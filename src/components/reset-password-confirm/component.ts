import { loadScriptOnce, loadStylesheetOnce } from '../../utils/loaders';
import Auth from '../../utils/auth';
import { notify } from '../../utils/notify';
import { extractFormValues } from '../../utils/form';
import { getEmail, clearEmail } from '../../utils/state';

const componentName = 'reset-password-confirm';

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

  const form = document.getElementById('reset-password-form') as HTMLFormElement;
  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  if (emailInput) {
    const savedEmail = getEmail();
    if (savedEmail) {
      emailInput.value = savedEmail;
    }
  }

  const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement | null;
  if (newPasswordInput) {
    const inputListener = (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      updateRuleFeedback('length', value.length >= 12);
      updateRuleFeedback('uppercase', /[A-Z]/.test(value));
      updateRuleFeedback('number', /\d/.test(value));
      updateRuleFeedback('special', /[\W_]/.test(value));
    };
    newPasswordInput.addEventListener('input', inputListener);
    trackedHandlers.push({
      name: 'password-live-check',
      element: newPasswordInput,
      event: 'input',
      listener: inputListener
    });
  }

  function updateRuleFeedback(rule: string, passed: boolean) {
    const li = document.querySelector(`#password-rules li[data-rule="${rule}"]`);
    if (li) {
      li.classList.toggle('text-danger', !passed);
      li.classList.toggle('text-success', passed);
    }
  }

  const submitListener = async (e: Event) => {
    e.preventDefault();

    const { email, code, newPassword } = extractFormValues(form);

    const result = await Auth.confirmForgotPassword(email, code, newPassword);
    if (result.status === 'Success') {
      notify('success','Password updated successfully', 'Reset Verification');
      window.location.href = '/#/'; // Redirect to login or desired route
    } else {
      notify('error',result.error || 'Failed to reset password', 'Reset Verification');
    }
  };

  form.addEventListener('submit', submitListener);
  trackedHandlers.push({
    name: 'reset-password-submit',
    element: form,
    event: 'submit',
    listener: submitListener
  });


}

export function destroy(): void {
  initCount--;

  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[reset-password-confirm] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;

  console.log(`[${componentName}] component destroy`, initCount);
}
