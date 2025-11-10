/**
 * Populates input elements in a form based on matching `name` attributes to properties in the `data` object.
 * Optionally accepts a set of field names to ignore.
 */
export function populateFormFields(
  form: HTMLFormElement,
  data: Record<string, any>,
  skipFields: Set<string> = new Set()
): void {
  Object.entries(data).forEach(([key, value]) => {
    if (skipFields.has(key)) return;

    const input = form.querySelector(`[name="${key}"]`) as HTMLInputElement | null;
    if (input) {
      input.value = String(value ?? '');
    }
  });
}

export function extractFormValues(form: HTMLFormElement, ignore: string[] = []): Record<string, string> {
  const values: Record<string, string> = {};

  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement >('input, select, textarea')
    .forEach(el => {
      const name = el.name;
      if (!name || ignore.includes(name)) return;
      values[name] = el.value.trim();
    });

  return values;
}