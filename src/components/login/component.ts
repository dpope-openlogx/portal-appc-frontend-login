import { loadScriptOnce, loadStylesheetOnce } from '../../utils/loaders';
import { extractFormValues } from '../../utils/form';
import Auth from '../../utils/auth';
import { notify } from '../../utils/notify';
import { setEmail, setPassword } from '../../utils/state';
import { getAuthEndpoint } from '../../utils/config';

const componentName = 'login';

const trackedHandlers: Array<{
  name: string;
  element: HTMLElement;
  event: string;
  listener: EventListenerOrEventListenerObject;
}> = [];
let initCount = 0;

let submitHandler: EventListener;
let spinnerInterval: NodeJS.Timeout | undefined;

export async function init(): Promise<void> {
  initCount++;
  console.log(`[${componentName}] component initialized`, initCount);

  // Component css
  const cssPath = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
  : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);

  const form = document.querySelector<HTMLFormElement>('#login-form');
  if (form) {
    
    submitHandler = async (e: Event) => {
      e.preventDefault();

      const $form = (window as any).jQuery(form);
      if (!$form.parsley().isValid()) {
        console.warn('[Login] Form is invalid');
        return;
      }

      const { email: username = '', password = '' } = extractFormValues(form);
      if (!username || !password) {
        console.warn('[Login] Username or password is missing');
        
        return;
      }

      const submitBtn = document.getElementById('login-submit-btn') as HTMLButtonElement;
      const btnText = submitBtn?.querySelector('.login-btn-text') as HTMLElement;
      const btnSpinner = submitBtn?.querySelector('.login-btn-spinner') as HTMLElement;

      try {
        // Show loading state
        if (submitBtn) {
          submitBtn.disabled = true;
          btnText?.classList.add('d-none');
          btnSpinner?.classList.remove('d-none');
        }

        if ((window as any).Pace?.restart) {
          (window as any).Pace.restart();
        }

        const signInOutput = await Auth.signInUser(username, password);
        console.log('[Auth Response]', signInOutput);

        switch (signInOutput.status) {
          case 'MFASetup':
            // User needs to set up MFA/2FA
            setEmail(username); // Keep email in state for MFA/Passkey setup
            // Keep loading state during redirect
            // If mfaSetupUrl is empty, go to post-password-change to choose MFA or Passkey
            // If mfaSetupUrl has a value, it's from Cognito's TOTP setup flow
            if (!signInOutput.mfaSetupUrl) {
              window.location.href = '/#/post-password-change';
            } else {
              window.location.href = `/#/mfa-setup?uri=${encodeURIComponent(signInOutput.mfaSetupUrl)}`;
            }
            break;
          case 'MFA':
            // Keep loading state during redirect
            window.location.hash = '#/mfa';
            break;
          case 'UpdatePassword':
            setEmail(username); // setting singleton shared memory
            setPassword(password);
            // Keep loading state during redirect
            window.location.hash = '#/update-password';
            break;
          case 'ResetPasswordConfirm':
            setEmail(username); // setting singleton shared memory
            // Keep loading state during redirect
            window.location.hash = '#/reset-password-confirm';
            break;
          case 'PasskeyRequired':
            // User has passkeys and must use passkey button
            notify('warning', signInOutput.error || 'You have passkeys registered. Please use the "Sign in with Passkey" button.', 'Passkey Required');
            // Clear the interval
            if (spinnerInterval) {
              clearInterval(spinnerInterval);
            }
            // Restore button state
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
            break;
          case 'Success':
            // Keep loading state during redirect
            window.location.href = getAuthEndpoint();
            break;
          default:
            console.warn('[Login] Unhandled response status:', signInOutput.status);
            // Restore button state for unhandled status
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
            break;
        }
      } catch (error) {
        // Restore button state on error
        if (submitBtn) {
          submitBtn.disabled = false;
          btnText?.classList.remove('d-none');
          btnSpinner?.classList.add('d-none');
        }

        let message = 'An unknown error occurred.';
        if (error instanceof Error) {
          if (error.message.includes('Unexpected token')) {
            console.warn('[Login] Ignoring Vite fallback config error:', error.message);
            return;
          }
          message = error.message;
        }
        console.error('[Login Error]', error);
        notify('error', message, 'Login Error');
      }
    };
    form.addEventListener('submit', submitHandler);
    trackedHandlers.push({name: 'login-submit',element: form,event: 'submit',listener: submitHandler
    });
  
    const forgotLink = document.getElementById('forgot-password-link');
    if (forgotLink) {
      const forgotClickHandler = (e: Event) => {
        e.preventDefault();
        const { email: username} = extractFormValues(form);
        setEmail(username); // setting singleton shared memory
        console.log('Navigating to forgot-password');
        window.location.hash = '#/forgot-password';
      };
      forgotLink.addEventListener('click', forgotClickHandler);
      trackedHandlers.push({
        name: 'forgot-password-click',
        element: forgotLink,
        event: 'click',
        listener: forgotClickHandler
      });
    }

  }

  // Passkey sign-in button handler
  const passkeyBtn = document.getElementById('passkey-signin-btn');
  const passkeySection = document.querySelector('.passkey-signin-section');
  const passwordFieldsGroup = document.querySelector('.password-fields-group');
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  const loginSubmitBtn = document.getElementById('login-submit-btn') as HTMLButtonElement;

  if (passkeyBtn && passkeySection) {
    // Disable password fields when hovering passkey section
    const handlePasskeyHover = () => {
      if (passwordFieldsGroup) {
        passwordFieldsGroup.classList.add('disabled-group');
      }
      if (passwordInput) {
        passwordInput.disabled = true;
      }
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
      }
    };

    const handlePasskeyLeave = () => {
      if (passwordFieldsGroup) {
        passwordFieldsGroup.classList.remove('disabled-group');
      }
      if (passwordInput) {
        passwordInput.disabled = false;
      }
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = false;
      }
    };

    passkeySection.addEventListener('mouseenter', handlePasskeyHover);
    passkeySection.addEventListener('mouseleave', handlePasskeyLeave);

    trackedHandlers.push(
      {
        name: 'passkey-hover',
        element: passkeySection as HTMLElement,
        event: 'mouseenter',
        listener: handlePasskeyHover
      },
      {
        name: 'passkey-leave',
        element: passkeySection as HTMLElement,
        event: 'mouseleave',
        listener: handlePasskeyLeave
      }
    );

    const passkeyClickHandler = async (e: Event) => {
      e.preventDefault();

      // Get email from form
      const { email: username = '' } = extractFormValues(form!);
      if (!username) {
        notify('warning', 'Please enter your email address first.', 'Email Required');
        return;
      }

      const submitBtn = passkeyBtn as HTMLButtonElement;
      const btnText = submitBtn?.querySelector('.passkey-btn-text') as HTMLElement;
      const btnSpinner = submitBtn?.querySelector('.passkey-btn-spinner') as HTMLElement;

      try {
        // Show loading state immediately
        if (submitBtn) {
          submitBtn.disabled = true;
          console.log('[Passkey] Button disabled, showing spinner');
        }
        if (btnText) {
          btnText.classList.add('d-none');
          console.log('[Passkey] Button text hidden');
        }
        if (btnSpinner) {
          btnSpinner.classList.remove('d-none');
          console.log('[Passkey] Spinner shown');
        }

        if ((window as any).Pace?.restart) {
          (window as any).Pace.restart();
        }

        // Function to ensure spinner stays visible during WebAuthn
        const ensureSpinnerVisible = () => {
          if (submitBtn && btnText && btnSpinner) {
            submitBtn.disabled = true;
            btnText.classList.add('d-none');
            btnSpinner.classList.remove('d-none');
          }
        };

        // Set up interval to maintain spinner during WebAuthn dialog
        spinnerInterval = setInterval(ensureSpinnerVisible, 200);

        const signInOutput = await Auth.signInWithPasskey(username);

        // Clear the interval once authentication completes
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
        }

        console.log('[Passkey Auth Response]', signInOutput);

        switch (signInOutput.status) {
          case 'Success':
            // Keep loading state during redirect
            window.location.href = getAuthEndpoint();
            break;
          case 'NoPasskey':
            notify('warning', 'No passkey found for this account. Please sign in with email and password.', 'Passkey Not Found');
            // Clear the interval
            if (spinnerInterval) {
              clearInterval(spinnerInterval);
            }
            // Restore button state
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
            break;
          case 'NotSupported':
            notify('error', 'Passkey authentication is not supported on this browser or device.', 'Not Supported');
            // Clear the interval
            if (spinnerInterval) {
              clearInterval(spinnerInterval);
            }
            // Restore button state
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
            break;
          default:
            console.warn('[Passkey] Unhandled response status:', signInOutput.status);
            // Clear the interval
            if (spinnerInterval) {
              clearInterval(spinnerInterval);
            }
            // Restore button state
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
            break;
        }
      } catch (error) {
        // Clear the interval on error
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
        }
        // Restore button state on error
        if (submitBtn) {
          submitBtn.disabled = false;
          btnText?.classList.remove('d-none');
          btnSpinner?.classList.add('d-none');
        }

        let message = 'Failed to authenticate with passkey.';
        if (error instanceof Error) {
          // Check for user cancellation
          if (error.name === 'NotAllowedError' || error.message.includes('cancelled') || error.message.includes('canceled')) {
            console.log('[Passkey] User cancelled authentication');
            return; // Don't show error for cancellation
          }
          message = error.message;
        }
        console.error('[Passkey Error]', error);
        notify('error', message, 'Passkey Authentication Failed');
      }
    };
    passkeyBtn.addEventListener('click', passkeyClickHandler);
    trackedHandlers.push({
      name: 'passkey-signin-click',
      element: passkeyBtn,
      event: 'click',
      listener: passkeyClickHandler
    });
  }
}

export function destroy(): void {
  initCount--;
  
  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[login] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;
  console.log('[login] component destroy');
}