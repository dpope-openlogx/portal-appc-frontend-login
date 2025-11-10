import { loadStylesheetOnce } from '../../utils/loaders';
import { setupMFA, registerPasskey } from '../../utils/auth';
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
  const setupMfaBtn = document.getElementById('setup-mfa-btn') as HTMLButtonElement;
  const setupPasskeyBtn = document.getElementById('setup-passkey-btn') as HTMLButtonElement;
  const createPasskeyBtn = document.getElementById('create-passkey-btn') as HTMLButtonElement;
  const backToChoiceBtn = document.getElementById('back-to-choice-btn') as HTMLButtonElement;
  const errorMessage = document.getElementById('error-message') as HTMLElement;
  const successMessage = document.getElementById('success-message') as HTMLElement;

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
    hideMessages();
  }

  function showAuthChoice(): void {
    passkeySetupSection?.classList.add('d-none');
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
          showSuccess('Passkey created successfully! Redirecting...');

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
        showError(message);
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
