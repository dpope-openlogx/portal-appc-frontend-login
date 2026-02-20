import { loadStylesheetOnce } from '../../utils/loaders';
import { setupMFA, registerPasskey, updateUserAuthMethod } from '../../utils/auth';
import { notify } from '../../utils/notify';
import { getEmail, clearEmail } from '../../utils/state';
import { getAuthEndpoint } from '../../utils/config';

const componentName = 'post-password-change';

const trackedHandlers: Array<{
  name: string;
  element: HTMLElement;
  event: string;
  listener: EventListenerOrEventListenerObject;
}> = [];

let initCount = 0;

export async function init(): Promise<void> {
  initCount++;
  console.log(`[${componentName}] component initialized`, initCount);

  // Component css
  const cssPath = import.meta.env.DEV
    ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
    : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);

  // Get DOM elements
  const authChoiceSection = document.querySelector('.auth-choice-section') as HTMLElement;
  const passkeySetupSection = document.getElementById('passkey-setup-section') as HTMLElement;
  const passwordOnlyOption = document.getElementById('password-only-option') as HTMLElement;
  const passwordOnlyConfirmSection = document.getElementById('password-only-confirm-section') as HTMLElement;
  const setupMfaBtn = document.getElementById('setup-mfa-btn') as HTMLButtonElement;
  const setupPasskeyBtn = document.getElementById('setup-passkey-btn') as HTMLButtonElement;
  const passwordOnlyBtn = document.getElementById('password-only-btn') as HTMLButtonElement;
  const confirmPasswordOnlyBtn = document.getElementById('confirm-password-only-btn') as HTMLButtonElement;
  const backFromPasswordOnlyBtn = document.getElementById('back-from-password-only-btn') as HTMLButtonElement;
  const createPasskeyBtn = document.getElementById('create-passkey-btn') as HTMLButtonElement;
  const backToChoiceBtn = document.getElementById('back-to-choice-btn') as HTMLButtonElement;
  const errorMessage = document.getElementById('error-message') as HTMLElement;
  const successMessage = document.getElementById('success-message') as HTMLElement;

  // Show password-only option if env variable allows it
  if (import.meta.env.VITE_ALLOW_PASSWORD_ONLY === 'true' && passwordOnlyOption) {
    passwordOnlyOption.classList.remove('d-none');
    console.log(`[${componentName}] Password-only option enabled via VITE_ALLOW_PASSWORD_ONLY`);
  }

  // Helper functions
  function showError(message: string): void {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.classList.remove('d-none');
    }
    if (successMessage) {
      successMessage.classList.add('d-none');
    }
  }

  function showSuccess(message: string): void {
    if (successMessage) {
      successMessage.textContent = message;
      successMessage.classList.remove('d-none');
    }
    if (errorMessage) {
      errorMessage.classList.add('d-none');
    }
  }

  function hideMessages(): void {
    errorMessage?.classList.add('d-none');
    successMessage?.classList.add('d-none');
  }

  function showPasskeySetup(): void {
    authChoiceSection?.classList.add('d-none');
    passkeySetupSection?.classList.remove('d-none');
    passwordOnlyConfirmSection?.classList.add('d-none');
    hideMessages();
  }

  function showPasswordOnlyConfirm(): void {
    authChoiceSection?.classList.add('d-none');
    passkeySetupSection?.classList.add('d-none');
    passwordOnlyConfirmSection?.classList.remove('d-none');
    hideMessages();
  }

  function showAuthChoice(): void {
    passkeySetupSection?.classList.add('d-none');
    passwordOnlyConfirmSection?.classList.add('d-none');
    authChoiceSection?.classList.remove('d-none');
    hideMessages();
  }

  // MFA Setup Button Handler
  if (setupMfaBtn) {
    const mfaClickHandler = async (e: Event) => {
      e.preventDefault();
      hideMessages();

      try {
        console.log(`[${componentName}] Setting up MFA...`);

        const email = getEmail();
        if (!email) {
          console.error(`[${componentName}] Email is missing from state`);
          showError('Session error. Please log in again.');
          return;
        }

        // Call the MFA setup function which will return the TOTP setup URI
        const result = await setupMFA(email);

        if (result.status === 'Success' && result.setupUri) {
          // Email will be cleared after MFA is successfully verified in mfa-setup component
          // Redirect to MFA setup page with the URI
          window.location.href = `/#/mfa-setup?uri=${encodeURIComponent(result.setupUri)}`;
        } else {
          showError(result.error || 'Failed to set up MFA. Please try again.');
        }
      } catch (error) {
        console.error(`[${componentName}] MFA setup error:`, error);
        const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
        showError(message);
      }
    };

    setupMfaBtn.addEventListener('click', mfaClickHandler);
    trackedHandlers.push({
      name: 'setup-mfa-click',
      element: setupMfaBtn,
      event: 'click',
      listener: mfaClickHandler
    });
  }

  // Passkey Option Button Handler
  if (setupPasskeyBtn) {
    const passkeyOptionClickHandler = (e: Event) => {
      e.preventDefault();
      showPasskeySetup();
    };

    setupPasskeyBtn.addEventListener('click', passkeyOptionClickHandler);
    trackedHandlers.push({
      name: 'setup-passkey-option-click',
      element: setupPasskeyBtn,
      event: 'click',
      listener: passkeyOptionClickHandler
    });
  }

  // Create Passkey Button Handler
  if (createPasskeyBtn) {
    const btnText = createPasskeyBtn.querySelector('.passkey-btn-text') as HTMLElement;
    const btnSpinner = createPasskeyBtn.querySelector('.passkey-btn-spinner') as HTMLElement;

    const createPasskeyClickHandler = async (e: Event) => {
      e.preventDefault();
      hideMessages();

      try {
        // Show loading state
        if (createPasskeyBtn) {
          createPasskeyBtn.disabled = true;
          btnText?.classList.add('d-none');
          btnSpinner?.classList.remove('d-none');
        }

        console.log(`[${componentName}] Creating passkey...`);

        const result = await registerPasskey();

        if (result.status === 'Success') {
          // Update user's authMethod to passkey
          await updateUserAuthMethod('passkey');
          console.log(`[${componentName}] User authMethod updated to passkey`);

          notify('success', 'Passkey created successfully! Redirecting...', 'Account Setup');

          // Clear email from state since auth is complete
          clearEmail();

          // Wait a moment to show success message, then redirect
          setTimeout(() => {
            window.location.href = getAuthEndpoint();
          }, 1500);
        } else {
          // Restore button state on error
          if (createPasskeyBtn) {
            createPasskeyBtn.disabled = false;
            btnText?.classList.remove('d-none');
            btnSpinner?.classList.add('d-none');
          }
          showError(result.error || 'Failed to create passkey. Please try again.');
        }
      } catch (error) {
        console.error(`[${componentName}] Passkey creation error:`, error);

        // Restore button state
        if (createPasskeyBtn) {
          createPasskeyBtn.disabled = false;
          btnText?.classList.remove('d-none');
          btnSpinner?.classList.add('d-none');
        }

        // Check for user cancellation
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError' ||
              error.message.includes('cancelled') ||
              error.message.includes('canceled')) {
            console.log(`[${componentName}] User cancelled passkey creation`);
            showError('Passkey creation was cancelled.');
            return;
          }
        }

        const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
        notify('error', message, 'Account Setup');
      }
    };

    createPasskeyBtn.addEventListener('click', createPasskeyClickHandler);
    trackedHandlers.push({
      name: 'create-passkey-click',
      element: createPasskeyBtn,
      event: 'click',
      listener: createPasskeyClickHandler
    });
  }

  // Back to Choice Button Handler
  if (backToChoiceBtn) {
    const backClickHandler = (e: Event) => {
      e.preventDefault();
      showAuthChoice();
    };

    backToChoiceBtn.addEventListener('click', backClickHandler);
    trackedHandlers.push({
      name: 'back-to-choice-click',
      element: backToChoiceBtn,
      event: 'click',
      listener: backClickHandler
    });
  }

  // Password Only Button Handler
  if (passwordOnlyBtn) {
    const passwordOnlyClickHandler = (e: Event) => {
      e.preventDefault();
      showPasswordOnlyConfirm();
    };

    passwordOnlyBtn.addEventListener('click', passwordOnlyClickHandler);
    trackedHandlers.push({
      name: 'password-only-click',
      element: passwordOnlyBtn,
      event: 'click',
      listener: passwordOnlyClickHandler
    });
  }

  // Confirm Password Only Button Handler
  if (confirmPasswordOnlyBtn) {
    const btnText = confirmPasswordOnlyBtn.querySelector('.confirm-btn-text') as HTMLElement;
    const btnSpinner = confirmPasswordOnlyBtn.querySelector('.confirm-btn-spinner') as HTMLElement;

    const confirmPasswordOnlyHandler = async (e: Event) => {
      e.preventDefault();
      hideMessages();

      try {
        // Show loading state
        confirmPasswordOnlyBtn.disabled = true;
        btnText?.classList.add('d-none');
        btnSpinner?.classList.remove('d-none');

        console.log(`[${componentName}] Processing password-only choice...`);

        // Update authMethod to password-only
        await updateUserAuthMethod('password-only', true);
        console.log(`[${componentName}] User authMethod updated to password-only`);

        notify('success', 'Account setup complete! Redirecting...', 'Account Setup');

        // Clear email from state since auth is complete
        clearEmail();

        // Wait a moment to show success message, then redirect
        setTimeout(() => {
          window.location.href = getAuthEndpoint();
        }, 1500);

      } catch (error) {
        console.error(`[${componentName}] Password-only confirmation error:`, error);

        // Restore button state
        confirmPasswordOnlyBtn.disabled = false;
        btnText?.classList.remove('d-none');
        btnSpinner?.classList.add('d-none');

        const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
        notify('error', message, 'Account Setup');
      }
    };

    confirmPasswordOnlyBtn.addEventListener('click', confirmPasswordOnlyHandler);
    trackedHandlers.push({
      name: 'confirm-password-only-click',
      element: confirmPasswordOnlyBtn,
      event: 'click',
      listener: confirmPasswordOnlyHandler
    });
  }

  // Back from Password Only Button Handler
  if (backFromPasswordOnlyBtn) {
    const backFromPasswordOnlyHandler = (e: Event) => {
      e.preventDefault();
      showAuthChoice();
    };

    backFromPasswordOnlyBtn.addEventListener('click', backFromPasswordOnlyHandler);
    trackedHandlers.push({
      name: 'back-from-password-only-click',
      element: backFromPasswordOnlyBtn,
      event: 'click',
      listener: backFromPasswordOnlyHandler
    });
  }
}

export function destroy(): void {
  initCount--;

  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[${componentName}] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;

  console.log(`[${componentName}] component destroy`, initCount);
}
