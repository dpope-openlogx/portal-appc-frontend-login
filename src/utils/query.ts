/**
 * Extracts the value of a specific query parameter from the URL hash.
 * 
 * Example:
 * If window.location.hash = "#/mfa-setup?uri=someValue",
 * calling getHashQueryParam('uri') will return "someValue".
 * 
 * @param key The name of the query parameter to extract
 * @returns The value of the query parameter, or null if not found
 */
export function getHashQueryParam(key: string): string | null {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;

  const queryString = hash.substring(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  return params.get(key);
}

/**
 * Returns a URLSearchParams object representing all query parameters
 * found in the hash portion of the URL.
 * 
 * Example:
 * If window.location.hash = "#/mfa-setup?uri=abc&foo=bar",
 * getAllHashQueryParams().get('foo') returns "bar"
 * 
 * @returns URLSearchParams instance with key-value pairs from the hash query
 */
export function getAllHashQueryParams(): URLSearchParams {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  const queryString = queryIndex >= 0 ? hash.substring(queryIndex + 1) : '';
  return new URLSearchParams(queryString);
}