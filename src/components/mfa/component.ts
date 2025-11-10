import { loadScriptOnce, loadStylesheetOnce } from '../../utils/loaders';
import { verifyMFACode } from '../../utils/auth';
import { notify } from '../../utils/notify';
import { getAuthEndpoint } from '../../utils/config';

const componentName = 'mfa';

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

  const form = document.getElementById('mfa-form') as HTMLFormElement | null;
  if (!form) return;

  // --- Begin digit input and error box logic ---
  const digits = document.querySelectorAll<HTMLInputElement>('.code-digit');

  if (digits.length > 0) { // if there are any on the page
    digits[0].focus();
  }
  
  const errorBox = document.getElementById('mfa-error-message');

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
      name: `code-digit-input-${idx}`,
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
      name: `code-digit-keydown-${idx}`,
      element: input,
      event: 'keydown',
      listener: keydownListener as EventListener
    });
  });
  // --- End digit input and error box logic ---

  const submitHandler = async (e: Event) => {
    e.preventDefault();
    const code = Array.from(digits).map(d => d.value).join('').trim();

    if (code.length !== 6) {
      if (errorBox) {
        errorBox.textContent = 'Please enter a full 6-digit code';
        errorBox.classList.remove('d-none');
      }
      return;
    } else {
      if (errorBox) {
        errorBox.classList.add('d-none');
        errorBox.textContent = '';
      }
    }

    const submitBtn = document.getElementById('mfa-verify-btn') as HTMLButtonElement;
    const btnText = submitBtn?.querySelector('.mfa-btn-text') as HTMLElement;
    const btnSpinner = submitBtn?.querySelector('.mfa-btn-spinner') as HTMLElement;

    try {
      // Show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        btnText?.classList.add('d-none');
        btnSpinner?.classList.remove('d-none');
      }

      const result = await verifyMFACode('OpenLogx', code);
      if (result.status === 'Success') {
        // Keep loading state during redirect
        window.location.href = getAuthEndpoint();
      } else {
        // Restore button state on error
        if (submitBtn) {
          submitBtn.disabled = false;
          btnText?.classList.remove('d-none');
          btnSpinner?.classList.add('d-none');
        }
        notify('error', result.errorMsg || 'MFA code verification failed.', 'MFA Error');
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
  };

  form.addEventListener('submit', submitHandler);
  trackedHandlers.push({
    name: 'mfa-form-submit',
    element: form,
    event: 'submit',
    listener: submitHandler
  });
}

export function destroy(): void {
  initCount--;

  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[mfa] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;

  console.log(`[${componentName}] component destroy`, initCount);
}
