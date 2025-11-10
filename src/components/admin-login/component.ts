import { loadStylesheetOnce } from '../../utils/loaders';
import { extractFormValues } from '../../utils/form';
import { signIn, confirmSignIn, fetchAuthSession, listWebAuthnCredentials, signOut } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import { notify } from '../../utils/notify';
import { setEmail, setPassword } from '../../utils/state';
import { getAuthEndpoint, getConfig } from '../../utils/config';

const componentName = 'admin-login';

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

  // Set admin mode flag
  sessionStorage.setItem('adminMode', 'true');

  // Load admin config and configure Amplify
  const config = await getConfig();

  // Use admin credentials if available, otherwise fall back to regular
  const userPoolId = config.admin_cognito_userPoolId || config.cognito_userPoolId;
  const clientId = config.admin_cognito_userPoolWebClientId || config.cognito_userPoolWebClientId;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId,
        userPoolClientId: clientId,
      }
    }
  });

  console.log(`[${componentName}] Configured with admin pool:`, userPoolId);

  // Component css (reuse login styles or create new if needed)
  const cssPath = import.meta.env.DEV
    ? `${import.meta.env.BASE_URL}src/components/login/component.css`
    : `${import.meta.env.BASE_URL}components/login/component.css`;
  await loadStylesheetOnce(cssPath);

  const form = document.querySelector<HTMLFormElement>('#admin-login-form');
  if (form) {

    const submitHandler = async (e: Event) => {
      e.preventDefault();

      const $form = (window as any).jQuery(form);
      if (!$form.parsley().isValid()) {
        console.warn('[AdminLogin] Form is invalid');
        return;
      }

      const { email: username = '', password = '' } = extractFormValues(form);
      if (!username || !password) {
        console.warn('[AdminLogin] Username or password is missing');
        return;
      }

      const submitBtn = document.getElementById('admin-login-submit-btn') as HTMLButtonElement;
      const btnText = submitBtn?.querySelector('.admin-login-btn-text') as HTMLElement;
      const btnSpinner = submitBtn?.querySelector('.admin-login-btn-spinner') as HTMLElement;

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

        const result = await signIn({ username, password });

        if (!result.isSignedIn && result.nextStep.signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP") {
          window.location.href = `/#/mfa-setup?uri=${encodeURIComponent(result.nextStep.totpSetupDetails?.getSetupUri('OpenLogx', username).toString() || '')}`;
        } else if (!result.isSignedIn && result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
          window.location.hash = '#/mfa';
        } else if (!result.isSignedIn && result.nextStep.signInStep === "RESET_PASSWORD") {
          setEmail(username);
          window.location.hash = '#/reset-password-confirm';
        } else if (!result.isSignedIn && result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
          // New admin needs to complete initial setup on administrative portal
          notify('warning', 'Admin account setup must be completed on the administrative portal. Please complete your password change and MFA/Passkey setup there first.', 'Setup Required');

          // Restore button state
          if (submitBtn) {
            submitBtn.disabled = false;
            btnText?.classList.remove('d-none');
            btnSpinner?.classList.add('d-none');
          }
          return;
        } else if (result.isSignedIn) {
          // User signed in directly (no MFA)
          // Check if they have passkeys - if so, they must use passkey sign-in
          try {
            const passkeyResult = await listWebAuthnCredentials();
            const hasPasskeys = (passkeyResult.credentials || []).length > 0;

            if (hasPasskeys) {
              // Admin has passkeys but signed in with password - not allowed
              console.warn('[AdminLogin] Admin has passkeys but attempted password sign-in');
              await signOut();

              // Restore button state
              if (submitBtn) {
                submitBtn.disabled = false;
                btnText?.classList.remove('d-none');
                btnSpinner?.classList.add('d-none');
              }

              notify('warning', 'You have passkeys registered. Please use the "Sign in with Passkey" button instead of password.', 'Passkey Required');
              return;
            }

            // No passkeys, password-only sign-in is allowed - set tokens
            const authSession = await fetchAuthSession();
            const idToken = authSession.tokens?.idToken?.toString();
            const accessToken = authSession.tokens?.accessToken?.toString();

            if (accessToken) {
              sessionStorage.setItem('accessToken', accessToken);
              setJWTCookie(accessToken);
            }
            if (idToken) {
              sessionStorage.setItem('idToken', idToken);
            }

            window.location.href = getAuthEndpoint();
          } catch (error) {
            console.error('Failed to check passkeys or set tokens:', error);
            // If check fails, allow sign-in to proceed (fail open for availability)
            window.location.href = getAuthEndpoint();
          }
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
          message = error.message;
        }
        console.error('[AdminLogin Error]', error);
        notify('error', message, 'Admin Login Error');
      }
    };

    form.addEventListener('submit', submitHandler);
    trackedHandlers.push({
      name: 'admin-login-submit',
      element: form,
      event: 'submit',
      listener: submitHandler
    });

    const forgotLink = document.getElementById('admin-forgot-password-link');
    if (forgotLink) {
      const forgotClickHandler = (e: Event) => {
        e.preventDefault();
        const { email: username} = extractFormValues(form);
        setEmail(username);
        window.location.hash = '#/forgot-password';
      };
      forgotLink.addEventListener('click', forgotClickHandler);
      trackedHandlers.push({
        name: 'admin-forgot-password-click',
        element: forgotLink,
        event: 'click',
        listener: forgotClickHandler
      });
    }
  }

  // Passkey sign-in button handler
  const passkeyBtn = document.getElementById('admin-passkey-signin-btn');
  const passkeySection = document.querySelector('.passkey-signin-section');
  const passwordFieldsGroup = document.querySelector('.password-fields-group');
  const passwordInput = document.getElementById('admin-password') as HTMLInputElement;
  const loginSubmitBtn = document.getElementById('admin-login-submit-btn') as HTMLButtonElement;

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
        name: 'admin-passkey-hover',
        element: passkeySection as HTMLElement,
        event: 'mouseenter',
        listener: handlePasskeyHover
      },
      {
        name: 'admin-passkey-leave',
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
      const btnText = submitBtn?.querySelector('.admin-passkey-btn-text') as HTMLElement;
      const btnSpinner = submitBtn?.querySelector('.admin-passkey-btn-spinner') as HTMLElement;

      let spinnerInterval: NodeJS.Timeout | undefined;

      try {
        // Show loading state immediately
        if (submitBtn) {
          submitBtn.disabled = true;
          console.log('[AdminPasskey] Button disabled, showing spinner');
        }
        if (btnText) {
          btnText.classList.add('d-none');
          console.log('[AdminPasskey] Button text hidden');
        }
        if (btnSpinner) {
          btnSpinner.classList.remove('d-none');
          console.log('[AdminPasskey] Spinner shown');
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

        // Admin passkey sign-in using same logic but with admin user pool (already configured)
        console.log('[AdminPasskey] Starting passkey sign-in for:', username);
        console.log('[AdminPasskey] Current host:', window.location.host);
        console.log('[AdminPasskey] Current origin:', window.location.origin);

        // Check if WebAuthn is supported
        if (!window.PublicKeyCredential) {
          notify('error', 'WebAuthn is not supported on this browser', 'Not Supported');
          if (submitBtn) {
            submitBtn.disabled = false;
            btnText?.classList.remove('d-none');
            btnSpinner?.classList.add('d-none');
          }
          return;
        }

        console.log('[AdminPasskey] Calling signIn with WEB_AUTHN challenge...');
        const { nextStep, isSignedIn } = await signIn({
          username: username,
          password: '',
          options: {
            authFlowType: 'USER_AUTH',
            preferredChallenge: 'WEB_AUTHN'
          }
        });
        console.log('[AdminPasskey] signIn completed. isSignedIn:', isSignedIn, 'nextStep:', nextStep);

        // Clear interval once authentication completes
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
        }

        // Check if sign-in completed successfully
        if (isSignedIn) {
          // Admin signed in successfully, set tokens
          try {
            const authSession = await fetchAuthSession();
            const idToken = authSession.tokens?.idToken?.toString();
            const accessToken = authSession.tokens?.accessToken?.toString();

            if (accessToken) {
              sessionStorage.setItem('accessToken', accessToken);
              setJWTCookie(accessToken);
            }
            if (idToken) {
              sessionStorage.setItem('idToken', idToken);
            }

            // Keep loading state during redirect
            window.location.href = getAuthEndpoint();
          } catch (error) {
            console.error('Failed to set tokens after admin passkey sign in:', error);
            notify('error', 'Failed to set session tokens', 'Authentication Error');
            if (spinnerInterval) {
              clearInterval(spinnerInterval);
            }
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
          }
          return;
        }

        // Handle next steps if sign-in is not complete
        if (nextStep) {
          console.log('[AdminPasskey] Next step:', nextStep.signInStep);
          console.log('[AdminPasskey] Available challenges:', (nextStep as any).availableChallenges);

          // If it's DONE, treat as success
          if (nextStep.signInStep === 'DONE') {
            window.location.href = getAuthEndpoint();
            return;
          }

          // Check if WEB_AUTHN challenge is available
          if (nextStep.signInStep === 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION') {
            const challenges = (nextStep as any).availableChallenges || [];
            if (!challenges.includes('WEB_AUTHN')) {
              console.warn('[AdminPasskey] WEB_AUTHN not in available challenges:', challenges);
              notify('warning', 'No passkey found for this account. Please sign in with email and password.', 'Passkey Not Found');
              if (submitBtn) {
                submitBtn.disabled = false;
                btnText?.classList.remove('d-none');
                btnSpinner?.classList.add('d-none');
              }
              return;
            }
          }

          notify('error', `Unexpected sign-in step: ${nextStep.signInStep}`, 'Passkey Authentication Failed');
          if (submitBtn) {
            submitBtn.disabled = false;
            btnText?.classList.remove('d-none');
            btnSpinner?.classList.add('d-none');
          }
          return;
        }

        notify('error', 'Passkey authentication did not complete successfully', 'Passkey Authentication Failed');
        if (submitBtn) {
          submitBtn.disabled = false;
          btnText?.classList.remove('d-none');
          btnSpinner?.classList.add('d-none');
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
            console.log('[AdminPasskey] User cancelled authentication');
            return; // Don't show error for cancellation
          }

          // Handle specific error cases
          if (error.name === 'EmptySignInPassword') {
            notify('warning', 'No passkey registered for this account', 'Passkey Not Found');
            return;
          }

          if (error.message?.includes('No credentials available') ||
              error.message?.includes('no credentials') ||
              error.message?.includes('User does not have') ||
              error.name === 'InvalidStateError') {
            notify('warning', 'No passkey found for this device', 'Passkey Not Found');
            return;
          }

          message = error.message;
        }
        console.error('[AdminPasskey Error]', error);
        notify('error', message, 'Passkey Authentication Failed');
      }
    };
    passkeyBtn.addEventListener('click', passkeyClickHandler);
    trackedHandlers.push({
      name: 'admin-passkey-signin-click',
      element: passkeyBtn,
      event: 'click',
      listener: passkeyClickHandler
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
  console.log(`[${componentName}] component destroy`);
}

function setJWTCookie(jwt: string): void {
  if (!jwt) return;

  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    const expiryDate = new Date(payload.exp * 1000);

    if (expiryDate <= new Date()) {
      return;
    }

    const isProduction = window.location.protocol === 'https:';
    const cookieOptions = [
      `token=${jwt}`,
      'path=/',
      `expires=${expiryDate.toUTCString()}`,
      'samesite=lax'
    ];

    if (isProduction) {
      cookieOptions.push('secure');
    }

    const cookieDomain = import.meta.env.VITE_COOKIE_DOMAIN;
    if (cookieDomain) {
      cookieOptions.push(`domain=${cookieDomain}`);
    }

    document.cookie = cookieOptions.join('; ');
  } catch (error) {
    console.error('Failed to parse JWT for cookie expiry:', error);
    const fallbackExpiry = new Date();
    fallbackExpiry.setHours(fallbackExpiry.getHours() + 1);
    document.cookie = `token=${jwt}; path=/; expires=${fallbackExpiry.toUTCString()}; samesite=strict`;
  }
}
