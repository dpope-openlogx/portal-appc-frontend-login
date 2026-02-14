import { Amplify } from 'aws-amplify';
import { signIn, confirmSignIn, confirmResetPassword, fetchAuthSession, resetPassword, listWebAuthnCredentials, signOut, setUpTOTP, verifyTOTPSetup, updateMFAPreference, associateWebAuthnCredential, fetchMFAPreference } from 'aws-amplify/auth';
import { getConfig, getApiBaseUrl } from './config';

export const PUBLIC_ROUTES = ['/', '/login', '/login/admin', '/forgot-password', '/mfa', '/reset-password'
  ,  '/mfa-setup', '/reset-password-confirm','/update-password', '/post-password-change', '/register'] as string[];

let isConfigured = false;

export async function configureAuth(): Promise<void> {
  if (isConfigured) return;

  const config = await getConfig();

  const amplifyConfig = {
    Auth: {
      Cognito: {
        userPoolId: config.cognito_userPoolId,
        userPoolClientId: config.cognito_userPoolWebClientId,
      }
    }
  };

  console.log('[configureAuth] Amplify config:', amplifyConfig);
  console.log('[configureAuth] Current window.location:', {
    host: window.location.host,
    hostname: window.location.hostname,
    origin: window.location.origin,
    protocol: window.location.protocol
  });

  Amplify.configure(amplifyConfig);

  isConfigured = true;
}

export async function signInUser(email: string, password: string): Promise<{
  status: string;
  mfaSetupUrl?: string;
  error?: string;
}> {
  await configureAuth();

  let result;
  try {
    result = await signIn({ username: email, password });
  } catch (error: any) {
    if (error.message && error.message.includes('There is already a signed in user')) {
      console.log('[signInUser] User already signed in, attempting sign out and retry...');
      await signOut();
      result = await signIn({ username: email, password });
    } else {
      throw error;
    }
  }

  if (!result.isSignedIn && result.nextStep.signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP") {
    return {
      status: 'MFASetup',
      mfaSetupUrl: result.nextStep.totpSetupDetails?.getSetupUri('OpenLogx', email).toString()
    };
  } else if (!result.isSignedIn && result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
    return { 
      status: 'MFA' 
    };
  } else if (!result.isSignedIn && result.nextStep.signInStep === "RESET_PASSWORD") {
    return { 
      status: 'ResetPasswordConfirm' 
    };
  } else if (!result.isSignedIn && result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
    return { 
      status: 'UpdatePassword' 
    };
  } else if (result.isSignedIn) {
    // User signed in directly (no MFA during sign-in)
    // Check if they have any second factor set up (passkeys or MFA)
    try {
      const passkeyResult = await listWebAuthnCredentials();
      const hasPasskeys = (passkeyResult.credentials || []).length > 0;

      if (hasPasskeys) {
        // User has passkeys but signed in with password - not allowed
        console.warn('[signInUser] User has passkeys but attempted password sign-in');
        await signOut();
        return {
          status: 'PasskeyRequired',
          error: 'You have passkeys registered. Please use the "Sign in with Passkey" button instead of password.'
        };
      }

      // Check if MFA is enabled
      const mfaPreference = await fetchMFAPreference();
      const hasMFA = mfaPreference?.preferred === 'TOTP' || mfaPreference?.enabled?.includes('TOTP');

      console.log('[signInUser] MFA preference:', mfaPreference);
      console.log('[signInUser] Has MFA:', hasMFA, 'Has Passkeys:', hasPasskeys);

      // If user has neither MFA nor passkeys, check if they've chosen password-only
      if (!hasMFA && !hasPasskeys) {
        // Get the user's authMethod from the database to see if they chose password-only
        try {
          const authSession = await fetchAuthSession();
          const accessToken = authSession.tokens?.accessToken?.toString();

          if (accessToken) {
            // Store tokens early so they're available for post-password-change flow
            sessionStorage.setItem('accessToken', accessToken);
            setJWTCookie(accessToken);
            const idToken = authSession.tokens?.idToken?.toString();
            if (idToken) {
              sessionStorage.setItem('idToken', idToken);
            }

            // Decode token to get cognitoId
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            const cognitoId = payload.sub || payload['cognito:username'];

            if (cognitoId) {
              // Fetch user from API to check authMethod
              const apiBaseUrl = getApiBaseUrl();

              const response = await fetch(`${apiBaseUrl}get-user-by-cognito-id/${cognitoId}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`
                }
              });

              if (!response.ok) {
                console.warn('[signInUser] API returned', response.status, 'checking authMethod');
                try { await signOut(); } catch (_) { /* ignore */ }
                return { status: 'Failed', error: 'Sign-in is temporarily unavailable due to a system issue. Please try again later.' };
              }

              const userData = await response.json();
              console.log('[signInUser] User authMethod:', userData.authMethod);

              // If user has explicitly chosen password-only, allow sign-in
              if (userData.authMethod === 'password-only') {
                console.log('[signInUser] User has password-only auth method, allowing sign-in');
                return { status: 'Success' };
              }
            }
          }
        } catch (apiError) {
          console.warn('[signInUser] Failed to check user authMethod:', apiError);
          try { await signOut(); } catch (_) { /* ignore */ }
          return { status: 'Failed', error: 'Sign-in is temporarily unavailable due to a system issue. Please try again later.' };
        }

        console.warn('[signInUser] User has no second factor configured');
        return {
          status: 'MFASetup',
          mfaSetupUrl: '' // Empty URL signals we should go to post-password-change instead of mfa-setup
        };
      }

      // User has MFA enabled, password-only sign-in is allowed - set tokens
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
    } catch (error) {
      console.error('Failed to check passkeys or MFA preference:', error);
      // If check fails, allow sign-in to proceed (fail open for availability)
    }
  }

  return { status: 'Success'};
}

export async function updatePassword(email: string, newPassword: string, tempPassword: string) {
  try {
    await configureAuth();

    const signInOutput = await signIn({
      username: email,
      password: tempPassword,
    });

    if (
      !signInOutput.isSignedIn &&
      signInOutput.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
    ) {
      const result = await confirmSignIn({
        challengeResponse: newPassword,
      });

      if (!result.isSignedIn && result.nextStep.signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP") {
        return {
          status: "MFASetup",
          mfaSetupUrl: result.nextStep.totpSetupDetails?.getSetupUri("OpenLogx", email).toString(),
        };
      }

      if (!result.isSignedIn && result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
        return { status: "MFA" };
      }

      // Password change successful - user can now set up MFA or Passkey
      // Keep them authenticated so they can complete the MFA setup process
      console.log('[updatePassword] Password changed successfully');
      return { status: "Success" };
    }

    return { status: "Failed", error: "Unexpected sign-in step" };
  } catch (e: any) {
    console.error("[UpdatePassword Error]", e);
    return { status: "Failed", error: e.message };
  }
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<{ status: string; error?: string }> {
  try {
    await configureAuth();
    await confirmResetPassword({
      username: email,
      confirmationCode: code,
      newPassword
    });
    return { status: 'Success' };
  } catch (e: any) {
    console.error("[ConfirmForgotPassword Error]", e);
    return { status: 'Failed', error: e.message };
  }
}

export async function sendResetCode(email: string): Promise<{ status: string; error?: string }> {
  try {
    await configureAuth();
    await resetPassword({ username: email });
    return { status: 'Success' };
  } catch (e: any) {
    console.error('[sendResetCode Error]', e);
    return { status: 'Failed', error: e.message };
  }
}

export async function signInWithPasskey(email: string): Promise<{ status: string; error?: string }> {
  try {
    await configureAuth();

    console.log('[SignInWithPasskey] Starting passkey sign-in for:', email);
    console.log('[SignInWithPasskey] Current host:', window.location.host);
    console.log('[SignInWithPasskey] Current origin:', window.location.origin);

    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      return { status: 'NotSupported', error: 'WebAuthn is not supported on this browser' };
    }

    console.log('[SignInWithPasskey] Calling signIn with WEB_AUTHN challenge...');
    // Sign in with WebAuthn using preferredChallenge option
    // Pass empty password to explicitly indicate passwordless auth
    const { nextStep, isSignedIn } = await signIn({
      username: email,
      password: '',
      options: {
        authFlowType: 'USER_AUTH',
        preferredChallenge: 'WEB_AUTHN'
      }
    });
    console.log('[SignInWithPasskey] signIn completed. isSignedIn:', isSignedIn, 'nextStep:', nextStep);

    // Check if sign-in completed successfully
    if (isSignedIn) {
      // User signed in successfully, set tokens
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
      } catch (error) {
        console.error('Failed to set tokens after passkey sign in:', error);
      }

      return { status: 'Success' };
    }

    // Handle next steps if sign-in is not complete
    if (nextStep) {
      console.log('[SignInWithPasskey] Next step:', nextStep.signInStep);
      console.log('[SignInWithPasskey] Available challenges:', (nextStep as any).availableChallenges);

      // If it's DONE, treat as success
      if (nextStep.signInStep === 'DONE') {
        return { status: 'Success' };
      }

      // Check if WEB_AUTHN challenge is available
      if (nextStep.signInStep === 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION') {
        const challenges = (nextStep as any).availableChallenges || [];
        if (!challenges.includes('WEB_AUTHN')) {
          console.warn('[SignInWithPasskey] WEB_AUTHN not in available challenges:', challenges);
          return { status: 'NoPasskey', error: 'No passkey registered for this account. Please register a passkey from your profile after signing in.' };
        }
      }

      return { status: 'Failed', error: `Unexpected sign-in step: ${nextStep.signInStep}` };
    }

    return { status: 'Failed', error: 'Passkey authentication did not complete successfully' };
  } catch (e: any) {
    console.error('[SignInWithPasskey Error]', e);

    // Handle specific error cases
    if (e.name === 'NotAllowedError') {
      return { status: 'Cancelled', error: 'Authentication was cancelled' };
    }

    // EmptySignInPassword means no passkey is registered (fallback to password flow)
    // This is a security feature to prevent user enumeration attacks
    if (e.name === 'EmptySignInPassword') {
      return { status: 'NoPasskey', error: 'No passkey registered for this account' };
    }

    if (e.message?.includes('No credentials available') ||
        e.message?.includes('no credentials') ||
        e.message?.includes('User does not have') ||
        e.name === 'InvalidStateError') {
      return { status: 'NoPasskey', error: 'No passkey found for this device' };
    }

    return { status: 'Failed', error: e.message };
  }
}

export async function verifyMFACode(site: string, code: string): Promise<{ status: string; errorMsg?: string }> {
  try {
    await configureAuth();
    const confirmSignInOutput = await confirmSignIn({ challengeResponse: code });

    if (confirmSignInOutput.isSignedIn) {
      const authSession = await fetchAuthSession();
      const accessToken = authSession.tokens?.accessToken?.toString() || '';
      const idToken = authSession.tokens?.idToken?.toString() || '';
      
      sessionStorage.setItem('accessToken', accessToken);
      
      // Set JWT cookie for CloudFront
      // Also added to the if we do not enable MFA for some users line 48 area
      if (accessToken) {
        setJWTCookie(accessToken);
      }
      if (idToken) {
        sessionStorage.setItem('idToken', idToken);
      }
      
      return { status: 'Success' };
    }

    // If not signed in, treat as failure
    return { status: 'Failed', errorMsg: 'MFA code invalid or not accepted.' };
  } catch (e: any) {
    console.error("[VerifyMFACode Error]", e);
    return { status: 'Failed', errorMsg: e.message };
  }
}

export async function checkSession(): Promise<boolean> {
  try {
    await configureAuth();
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();
    const idToken = session.tokens?.idToken?.toString();

    if (accessToken && idToken) {
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('idToken', idToken);
      
      // Set JWT cookie if we have a valid session
      setJWTCookie(accessToken);
      
      return true;
    }

    return false;
  } catch (e: any) {
    console.warn('[checkSession] No valid session:', e?.message || e);
    return false;
  }
}

export function showSessionExpiredModal(): void {
  // Show the session expired modal
  const modal = document.getElementById('modal-session');
  if (modal) {
    // Use Bootstrap's modal API if available
    const bootstrapModal = (window as any).bootstrap?.Modal?.getOrCreateInstance(modal);
    if (bootstrapModal) {
      bootstrapModal.show();
    } else {
      // Fallback: show modal manually
      modal.classList.add('show');
      modal.style.display = 'block';
      document.body.classList.add('modal-open');
    }
    
    // Add click handler to the OK button
    const loginButton = document.getElementById('session-logout-button');
    if (loginButton) {
      loginButton.onclick = () => {
        // Just close the modal - user is already on the login page
        if (bootstrapModal) {
          bootstrapModal.hide();
        } else {
          modal.classList.remove('show');
          modal.style.display = 'none';
          document.body.classList.remove('modal-open');
        }
      };
    }
  }
}

// Check if user was redirected due to session expiry
export function checkForSessionExpiry(): void {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('reason') === 'session_expired') {
    // Check if user was in admin mode (from sessionStorage since URL doesn't tell us)
    const wasAdminMode = sessionStorage.getItem('adminMode') === 'true';

    // Remove the query parameter and redirect to appropriate login page
    const loginHash = wasAdminMode ? '#/login/admin' : '#/';
    window.history.replaceState({}, document.title, loginHash);

    // Try to show modal immediately, fall back to delay if DOM not ready
    attemptToShowModal();
  }
}

function attemptToShowModal(): void {
  const modal = document.getElementById('modal-session');
  if (modal) {
    // DOM is ready, show immediately
    showSessionExpiredModal();
  } else {
    // DOM not ready yet, try again with shorter delay
    setTimeout(() => {
      if (document.getElementById('modal-session')) {
        showSessionExpiredModal();
      } else {
        // Last resort with longer delay
        setTimeout(showSessionExpiredModal, 200);
      }
    }, 50);
  }
}

const Auth = {
  configureAuth,
  signInUser,
  signIn: signInUser,
  signInWithPasskey,
  updatePassword,
  confirmForgotPassword,
  verifyMFACode,
  checkSession,
  PUBLIC_ROUTES,
  showSessionExpiredModal,
  checkForSessionExpiry
};
export default Auth;

export function getAccessToken(): string | null {
  return sessionStorage.getItem('accessToken');
}

function setJWTCookie(jwt: string): void {
  if (!jwt) return;

  try {
    // Parse JWT to get expiry time
    const payload = JSON.parse(atob(jwt.split('.')[1]));

    // JWT exp is in seconds, convert to milliseconds
    const expiryDate = new Date(payload.exp * 1000);

    // Check if token is already expired
    if (expiryDate <= new Date()) {
      // Attempting to set cookie with expired JWT
      return;
    }

    const cookieOptions = [
      `token=${jwt}`,
      'path=/',
      `expires=${expiryDate.toUTCString()}`,
      'samesite=none',
      'secure'
    ];

    cookieOptions.push('domain=.oils.exchange');

    document.cookie = cookieOptions.join('; ');
  } catch (error) {
    console.error('Failed to parse JWT for cookie expiry:', error);
    // Fallback to 1 hour if we can't parse the JWT
    const fallbackExpiry = new Date();
    fallbackExpiry.setHours(fallbackExpiry.getHours() + 1);
    document.cookie = `token=${jwt}; path=/; expires=${fallbackExpiry.toUTCString()}; samesite=none; secure; domain=.oils.exchange`;
  }
}

// Set up TOTP MFA for a user
export async function setupMFA(email: string): Promise<{ status: string; setupUri?: string; error?: string }> {
  try {
    await configureAuth();

    console.log('[setupMFA] Setting up TOTP for:', email);

    // Call setUpTOTP to get the secret code
    const totpSetupDetails = await setUpTOTP();

    // Generate the setup URI
    const setupUri = totpSetupDetails.getSetupUri('OpenLogx', email).toString();

    console.log('[setupMFA] TOTP setup URI generated');

    return {
      status: 'Success',
      setupUri
    };
  } catch (error: any) {
    console.error('[setupMFA] Error:', error);
    return {
      status: 'Failed',
      error: error.message || 'Failed to set up MFA'
    };
  }
}

// Verify TOTP code and set MFA preference
export async function verifyAndEnableMFA(code: string): Promise<{ status: string; error?: string }> {
  try {
    await configureAuth();

    console.log('[verifyAndEnableMFA] Verifying TOTP code');

    // Verify the TOTP setup with the code
    await verifyTOTPSetup({ code });

    console.log('[verifyAndEnableMFA] TOTP verified, setting preference');

    // Set TOTP as the preferred MFA method
    await updateMFAPreference({ totp: 'PREFERRED' });

    console.log('[verifyAndEnableMFA] MFA preference set to TOTP');

    // Fetch and set auth tokens now that MFA is complete
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
      console.log('[verifyAndEnableMFA] Auth tokens set successfully');
    } catch (tokenError) {
      console.error('[verifyAndEnableMFA] Failed to set tokens:', tokenError);
      // Continue anyway - the session might still be valid
    }

    return { status: 'Success' };
  } catch (error: any) {
    console.error('[verifyAndEnableMFA] Error:', error);
    return {
      status: 'Failed',
      error: error.message || 'Failed to verify MFA code'
    };
  }
}

// Register a passkey for the current user
export async function registerPasskey(): Promise<{ status: string; error?: string }> {
  try {
    await configureAuth();

    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      return {
        status: 'NotSupported',
        error: 'Passkeys are not supported on this browser or device'
      };
    }

    console.log('[registerPasskey] Registering passkey');

    // Associate WebAuthn credential (passkey)
    await associateWebAuthnCredential();

    console.log('[registerPasskey] Passkey registered successfully');

    // Optionally disable TOTP MFA when passkey is registered
    try {
      await updateMFAPreference({ totp: 'DISABLED' });
      console.log('[registerPasskey] TOTP MFA disabled after passkey registration');
    } catch (mfaError) {
      console.warn('[registerPasskey] Failed to disable TOTP MFA:', mfaError);
      // Don't fail the whole operation if MFA disable fails
    }

    // Fetch and set auth tokens now that passkey is registered
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
      console.log('[registerPasskey] Auth tokens set successfully');
    } catch (tokenError) {
      console.error('[registerPasskey] Failed to set tokens:', tokenError);
      // Continue anyway - the session might still be valid
    }

    return { status: 'Success' };
  } catch (error: any) {
    console.error('[registerPasskey] Error:', error);

    // Check for user cancellation
    if (error.name === 'NotAllowedError') {
      return {
        status: 'Cancelled',
        error: 'Passkey registration was cancelled'
      };
    }

    return {
      status: 'Failed',
      error: error.message || 'Failed to register passkey'
    };
  }
}