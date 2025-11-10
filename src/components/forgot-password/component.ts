import { loadScriptOnce, loadStylesheetOnce } from '../../utils/loaders';
import { sendResetCode } from '../../utils/auth';
import { notify } from '../../utils/notify';
import { getEmail, clearEmail } from '../../utils/state';

const componentName = 'forgot-password';
let initCount = 0;
const trackedHandlers: Array<{
  name: string;
  element: HTMLElement;
  event: string;
  listener: EventListenerOrEventListenerObject;
}> = [];

export async function init(): Promise<void> {
  initCount++;
  console.log(`[${componentName}] component initialized`, initCount);

  // Component css
  const cssPath = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
  : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);

  const form = document.getElementById('forgot-password-form') as HTMLFormElement | null;
  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  if (emailInput) {
    const savedEmail = getEmail();
    if (savedEmail) {
      emailInput.value = savedEmail;
    }
  }
  
  if (!form || !emailInput) return;

  const submitHandler = async (e: Event) => {
    e.preventDefault();
    const email = emailInput.value.trim();

    if (!email) {
      notify('error', 'Please enter your email address', 'Forgot Password');
      return;
    }

    try {
      await sendResetCode(email);
      notify('success', 'Reset code sent. Check your email.', 'Password Reset');
      window.location.hash = '#/reset-password-confirm';
    } catch (err: any) {
      notify('error', err.message || 'Error sending reset code', 'Reset Failed');
    }
  };

  form.addEventListener('submit', submitHandler);
  trackedHandlers.push({
    name: 'forgot-password-submit',
    element: form,
    event: 'submit',
    listener: submitHandler
  });
}

export function destroy(): void {
  initCount--;
  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[forgot-password] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;
  console.log(`[${componentName}] component destroy`, initCount);
}