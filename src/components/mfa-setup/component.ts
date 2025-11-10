import { loadScriptOnce, loadStylesheetOnce } from '../../utils/loaders';
import { getHashQueryParam } from '../../utils/query';
import { verifyMFACode, verifyAndEnableMFA } from '../../utils/auth';
import { notify } from '../../utils/notify';
import { getAuthEndpoint } from '../../utils/config';
import { clearEmail } from '../../utils/state';

const componentName = 'mfa-setup';

const trackedHandlers: Array<{
  name: string;
  element: HTMLElement;
  event: string;
  listener: EventListenerOrEventListenerObject;
}> = [];
let initCount = 0;

declare const QRCode: any;

export async function init(): Promise<void> {
  initCount++;
  console.log('[MFA-Setup] init');

  // Component css
  const cssPath = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
  : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);  

  await loadScriptOnce(`${import.meta.env.BASE_URL}assets/plugins/qrcodejs/qrcode.min.js`);

  const container = document.getElementById('qrcode');
  if (!container) return;

  new QRCode(container, {
    text: getHashQueryParam('uri') || 'No URI provided',
    width: 160,
    height: 160,
    colorDark: '#000',
    colorLight: '#fff',
    correctLevel: QRCode.CorrectLevel.H
  });

  // Code input logic
  const digits = document.querySelectorAll<HTMLInputElement>('.code-digit');
  digits.forEach((input, idx) => {
    const inputListener = () => {
      const val = input.value;
      if (/^\d$/.test(val)) {
        if (idx < digits.length - 1) digits[idx + 1].focus();
      } else {
        input.value = '';
      }

      // Hide error message if 6 digits are now entered
      const code = Array.from(digits).map(d => d.value).join('');
      const errorDiv = document.getElementById('mfa-error-message');
      if (/^\d{6}$/.test(code) && errorDiv) {
        errorDiv.textContent = '';
        errorDiv.classList.add('d-none');
      }
    };
    input.addEventListener('input', inputListener);
    trackedHandlers.push({
      name: `code-input-${idx}`,
      element: input,
      event: 'input',
      listener: inputListener
    });
    
    const keydownListener = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        digits[idx - 1].focus();
      }
    };

    input.addEventListener('keydown', keydownListener);
    trackedHandlers.push({
      name: 'code-digit-keydown',
      element: input,
      event: 'keydown',
      listener: keydownListener as EventListener
    });

  });

  const form = document.getElementById('mfa-form');
  const submitListener = (e: Event) => {
    e.preventDefault();
    const code = Array.from(digits).map(d => d.value).join('');
    // Use Parsley validation
    const parsleyForm = (form as any).parsley?.();
    if (!parsleyForm || parsleyForm.isValid()) {
      const errorDiv = document.getElementById('mfa-error-message');
      if (/^\d{6}$/.test(code)) {
        if (errorDiv) {
          errorDiv.textContent = '';
          errorDiv.classList.add('d-none');
        }
        console.log('[MFA-Setup] Code entered:', code);

        const submitBtn = document.getElementById('mfa-setup-verify-btn') as HTMLButtonElement;
        const btnText = submitBtn?.querySelector('.mfa-setup-btn-text') as HTMLElement;
        const btnSpinner = submitBtn?.querySelector('.mfa-setup-btn-spinner') as HTMLElement;

        (async () => {
          try {
            // Show loading state
            if (submitBtn) {
              submitBtn.disabled = true;
              btnText?.classList.add('d-none');
              btnSpinner?.classList.remove('d-none');
            }

            // Check if this is initial MFA setup (has URI param) or MFA verification during login
            const hasUri = getHashQueryParam('uri');
            const isSetup = !!hasUri;

            let result;
            if (isSetup) {
              // This is a new user setting up MFA for the first time
              console.log('[MFA-Setup] Verifying and enabling MFA');
              result = await verifyAndEnableMFA(code);
            } else {
              // This is an existing user verifying their MFA code during sign-in
              console.log('[MFA-Setup] Verifying MFA code for sign-in');
              result = await verifyMFACode('OpenLogx', code);
            }

            if (result.status === 'Success') {
              // Clear email from state since auth is complete
              clearEmail();
              // Keep loading state during redirect
              window.location.href = getAuthEndpoint();
            } else {
              // Restore button state on error
              if (submitBtn) {
                submitBtn.disabled = false;
                btnText?.classList.remove('d-none');
                btnSpinner?.classList.add('d-none');
              }
              notify('error', result.error || result.errorMsg || 'MFA code verification failed.', 'MFA Error');
            }
          } catch (e: any) {
            // Restore button state on exception
            if (submitBtn) {
              submitBtn.disabled = false;
              btnText?.classList.remove('d-none');
              btnSpinner?.classList.add('d-none');
            }
            notify('error', e.message || 'Unexpected error during MFA verification.', 'MFA Error');
          }
        })();
      } else {
        if (errorDiv) {
          errorDiv.textContent = 'Please enter a full 6-digit code';
          errorDiv.classList.remove('d-none');
        }
      }
    }
  };
  form?.addEventListener('submit', submitListener);
  if (form) {
    trackedHandlers.push({
      name: 'mfa-form-submit',
      element: form,
      event: 'submit',
      listener: submitListener
    });
  }
}

export function destroy(): void {
  initCount--;
  
  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[mfa-setup] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;

  console.log('[MFA-Setup] destroy');
}