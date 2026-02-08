import { loadStylesheetOnce } from '../../utils/loaders';
import { notify } from '../../utils/notify';

const componentName = 'register';
let initCount = 0;
const trackedHandlers: Array<{
  name: string;
  element: HTMLElement;
  event: string;
  listener: EventListenerOrEventListenerObject;
}> = [];

/**
 * Submit registration request to backend
 * TODO: Implement actual API call when backend endpoint is ready
 */
async function submitRegistrationRequest(data: {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
}): Promise<void> {
  // TODO: Replace with actual API endpoint
  // const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     ...data,
  //     pendingApproval: true
  //   })
  // });
  // if (!response.ok) {
  //   const errorData = await response.json().catch(() => ({}));
  //   throw new Error(errorData.message || 'Registration failed');
  // }

  // Placeholder: simulate API call
  console.log('[Register] Submitting registration request:', data);
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Uncomment to test error handling:
  // throw new Error('Registration service is not available');
}

export async function init(): Promise<void> {
  initCount++;
  console.log(`[${componentName}] component initialized`, initCount);

  // Component css
  const cssPath = import.meta.env.DEV
    ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
    : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);

  const form = document.getElementById('register-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('register-submit-btn') as HTMLButtonElement | null;
  const formContainer = document.getElementById('register-form-container');
  const successContainer = document.getElementById('register-success-container');

  if (!form || !submitBtn || !formContainer || !successContainer) return;

  const firstNameInput = document.getElementById('firstName') as HTMLInputElement | null;
  const lastNameInput = document.getElementById('lastName') as HTMLInputElement | null;
  const emailInput = document.getElementById('email') as HTMLInputElement | null;
  const companyInput = document.getElementById('company') as HTMLInputElement | null;

  if (!firstNameInput || !lastNameInput || !emailInput) return;

  const submitHandler = async (e: Event) => {
    e.preventDefault();

    // Check Parsley validation
    const $form = (window as any).jQuery?.(form);
    if ($form?.parsley && !$form.parsley().isValid()) {
      $form.parsley().validate();
      return;
    }

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const email = emailInput.value.trim();
    const company = companyInput?.value.trim() || '';

    if (!firstName || !lastName || !email) {
      notify('error', 'Please fill in all required fields', 'Registration');
      return;
    }

    // Show loading state
    const btnText = submitBtn.querySelector('.register-btn-text');
    const btnSpinner = submitBtn.querySelector('.register-btn-spinner');
    if (btnText) btnText.classList.add('d-none');
    if (btnSpinner) btnSpinner.classList.remove('d-none');
    submitBtn.disabled = true;

    try {
      await submitRegistrationRequest({ firstName, lastName, email, company });

      // Show success container
      formContainer.classList.add('d-none');
      successContainer.classList.remove('d-none');
    } catch (err: any) {
      notify('error', err.message || 'Registration request failed', 'Registration Failed');

      // Reset button state
      if (btnText) btnText.classList.remove('d-none');
      if (btnSpinner) btnSpinner.classList.add('d-none');
      submitBtn.disabled = false;
    }
  };

  form.addEventListener('submit', submitHandler);
  trackedHandlers.push({
    name: 'register-submit',
    element: form,
    event: 'submit',
    listener: submitHandler
  });
}

export function destroy(): void {
  initCount--;
  trackedHandlers.forEach(({ name, element, event, listener }) => {
    element.removeEventListener(event, listener);
    console.log(`[destroy] Removed ${event} listener '${name}' from`, element);
  });
  trackedHandlers.length = 0;
  console.log(`[${componentName}] component destroy`, initCount);
}
