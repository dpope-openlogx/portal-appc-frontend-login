import { updatePassword } from '../../utils/auth';
import { extractFormValues } from '../../utils/form';
import { loadScriptOnce, loadStylesheetOnce } from '../../utils/loaders';
import { getEmail, clearEmail, getPassword, clearPassword } from '../../utils/state';
import { notify } from '../../utils/notify';
import { getAuthEndpoint } from '../../utils/config';

const componentName = 'update-password';

const trackedHandlers: Array<{
  name: string;
  element: HTMLElement;
  event: string;
  listener: EventListenerOrEventListenerObject;
}> = [];

let initCount = 0;

function updateRuleFeedback(rule: string, passed: boolean) {
  const li = document.querySelector(`#password-rules li[data-rule="${rule}"]`);
  if (li) {
    li.classList.toggle('text-danger', !passed);
    li.classList.toggle('text-success', passed);
  }
}

function showFieldError(fieldId: string, message: string) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  
  // Add error styling to field
  field.classList.add('is-invalid');
  
  // Create or update error message
  let errorDiv = field.parentElement?.querySelector('.field-error') as HTMLElement;
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'field-error text-danger fs-12px mt-1';
    field.parentElement?.appendChild(errorDiv);
  }
  errorDiv.textContent = message;
}

function clearFieldErrors() {
  // Remove error styling from all fields
  const fields = document.querySelectorAll('.is-invalid');
  fields.forEach(field => field.classList.remove('is-invalid'));
  
  // Remove all error messages
  const errorDivs = document.querySelectorAll('.field-error');
  errorDivs.forEach(div => div.remove());
}

export async function init(): Promise<void> {
  initCount++;
  console.log(`[${componentName}] component initialized`, initCount);

  // Component css
  const cssPath = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
  : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);    

  // Remove Parsley loading - using custom validation like reset-password component

  // Pre-populate current password field with stored password
  const currentPasswordInput = document.getElementById('currentPassword') as HTMLInputElement | null;
  const storedPassword = getPassword();
  if (currentPasswordInput && storedPassword) {
    currentPasswordInput.value = storedPassword;
    console.log('[UpdatePassword] Pre-populated current password field');
  }

  const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement | null;
  if (newPasswordInput) {
    const inputListener = (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      const lengthOk = value.length >= 12;
      const uppercaseOk = /[A-Z]/.test(value);
      const numberOk = /\d/.test(value);
      const specialOk = /[ !"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(value);
      
      updateRuleFeedback('length', lengthOk);
      updateRuleFeedback('uppercase', uppercaseOk);
      updateRuleFeedback('number', numberOk);
      updateRuleFeedback('special', specialOk);
      
      // Add/remove custom invalid class based on password strength
      const isValid = lengthOk && uppercaseOk && numberOk && specialOk;
      newPasswordInput.classList.toggle('password-invalid', value.length > 0 && !isValid);
    };
    newPasswordInput.addEventListener('input', inputListener);
    trackedHandlers.push({
      name: 'password-live-check',
      element: newPasswordInput,
      event: 'input',
      listener: inputListener
    });
  }

  const form = document.querySelector('#update-password-form') as HTMLFormElement;

  const submitHandler = async (e: Event) => {
    e.preventDefault();

    const { currentPassword, newPassword, confirmPassword } = extractFormValues(form);

    // Clear any existing error messages
    clearFieldErrors();

    // Validate required fields
    let hasErrors = false;
    
    if (!currentPassword?.trim()) {
      showFieldError('currentPassword', 'This value is required.');
      hasErrors = true;
    }
    
    if (!newPassword?.trim()) {
      showFieldError('newPassword', 'This value is required.');
      hasErrors = true;
    }
    
    if (!confirmPassword?.trim()) {
      showFieldError('confirmPassword', 'This value is required.');
      hasErrors = true;
    }

    // Validate password strength
    if (newPassword?.trim()) {
      const lengthOk = newPassword.length >= 12;
      const uppercaseOk = /[A-Z]/.test(newPassword);
      const numberOk = /\d/.test(newPassword);
      const specialOk = /[ !"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(newPassword);
      
      if (!lengthOk || !uppercaseOk || !numberOk || !specialOk) {
        showFieldError('newPassword', 'Password must meet all requirements below.');
        hasErrors = true;
      }
    }

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      showFieldError('confirmPassword', 'Passwords do not match.');
      hasErrors = true;
    }

    if (hasErrors) {
      console.warn('[UpdatePassword] Form validation failed');
      return;
    }

    const email = getEmail();
    if (!email) {
      console.error('[UpdatePassword] Email is missing');
      return;
    }

    const submitBtn = document.getElementById('update-password-btn') as HTMLButtonElement;
    const btnText = submitBtn?.querySelector('.update-password-btn-text') as HTMLElement;
    const btnSpinner = submitBtn?.querySelector('.update-password-btn-spinner') as HTMLElement;

    try {
      // Show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        btnText?.classList.add('d-none');
        btnSpinner?.classList.remove('d-none');
      }

      const signInOutput = await updatePassword(email, newPassword, currentPassword);
      // Clear password but keep email in state - it's needed for MFA/Passkey setup
      clearPassword();

      if (signInOutput.status === 'Success') {
        // Password updated successfully, redirect to post-password-change to choose MFA/Passkey
        // Note: Email is kept in state for MFA setup - it will be cleared after auth is complete
        // Keep loading state during redirect
        window.location.href = '/#/post-password-change';
      } else {
        // Restore button state on error
        if (submitBtn) {
          submitBtn.disabled = false;
          btnText?.classList.remove('d-none');
          btnSpinner?.classList.add('d-none');
        }
        console.warn('[UpdatePassword] Failed to update password:', signInOutput.error);
        notify('error', signInOutput.error?.message || 'An unknown error occurred.', 'Update Password Failed');
      }
    } catch (error) {
      // Restore button state on exception
      if (submitBtn) {
        submitBtn.disabled = false;
        btnText?.classList.remove('d-none');
        btnSpinner?.classList.add('d-none');
      }
      console.error('[UpdatePassword] Unexpected error:', error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      notify('error', message, 'Update Password Failed');
    }
  };

  form.addEventListener('submit', submitHandler);
  trackedHandlers.push({
    name: 'update-password-submit',
    element: form,
    event: 'submit',
    listener: submitHandler
  });
}

export function destroy(): void {
  initCount--;

  trackedHandlers.forEach(({ name, element, event, listener }) => {
    console.log(`[update-password] removing handler: ${name}`);
    element.removeEventListener(event, listener);
  });
  trackedHandlers.length = 0;

  console.log(`[${componentName}] component destroy`, initCount);
}
