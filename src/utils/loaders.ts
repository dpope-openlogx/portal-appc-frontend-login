// utils/loaders.ts
// This module provides helper functions to dynamically load JavaScript and CSS assets once,
// appending a version string for cache busting.

import { ASSET_VERSION } from './version';
import { notify } from './notify';

// Keep track of already loaded scripts, stylesheets, and HTML fragments to avoid duplicates
const loadedScripts = new Set<string>();
const loadedStyles = new Set<string>();
const loadedHTML = new Set<string>();

/**
 * Dynamically load a JavaScript file once.
 * Appends a version query param for cache busting.
 */
export function loadScriptOnce(src: string): Promise<void> {
  // Construct URL with version for cache busting
  const url = `${src}?v=${ASSET_VERSION}`;

  // If script already loaded, resolve immediately
  if (loadedScripts.has(url)) return Promise.resolve();

  // Otherwise, load the script and add it to the document head
  return new Promise<void>((resolve, reject) => {
    try {
      // Create the script element
      const script = document.createElement('script');
      script.src = url;

      // On successful load, add to cache and resolve
      script.onload = () => {
        loadedScripts.add(url);
        resolve();
      };

      // On error, reject the promise with a useful message
      script.onerror = () => {
        console.warn(`[loadScriptOnce] Failed to load script: ${url}`);
        notify('error', `Failed to load script: ${url}`, 'Asset Load Error');
        resolve(); // silently fail
      };

      // Append script to document head
      document.head.appendChild(script);
    } catch (err) {
      console.warn(`[loadScriptOnce] Exception loading script: ${url}`, err);
      notify('error', `Exception loading script: ${url}`, 'Asset Load Error');
      resolve(); // silently fail
    }
  });
}

/**
 * Dynamically load and inject an HTML file once.
 * Appends a version query param for cache busting.
 * Injects the HTML into the target container specified by CSS selector.
 * @param route - Object with the component name.
 * @param targetSelector - CSS selector of the target container.
 * @param mode - Whether to 'append' or 'replace' the HTML. Defaults to 'append'.
 */
export async function loadComponentHTMLOnce(route: { component: string },targetSelector: string,mode: 'append' | 'replace' = 'append'): Promise<void> {
  const basePath = import.meta.env.DEV ? `${import.meta.env.BASE_URL}src/components` : `${import.meta.env.BASE_URL}components`;
  const fullUrl = `${basePath}/${route.component}/component.html?v=${ASSET_VERSION}`;  
  if (loadedHTML.has(fullUrl)) return;

  try {
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error(`Failed to fetch HTML: ${fullUrl}`);
    const html = await res.text();
    const container = document.querySelector(targetSelector);
    if (!container) throw new Error(`Container not found: ${targetSelector}`);
    if (mode === 'replace') {
      container.innerHTML = html;
    } else {
      container.insertAdjacentHTML('beforeend', html);
    }
    loadedHTML.add(fullUrl);
  } catch (err) {
    console.warn(`[loadComponentHTMLOnce] Failed to load or inject HTML from ${fullUrl}`, err);
    notify('error', `Failed to load HTML for ${route.component}`, 'Component Load Error');
    return; // silently fail
  }
}

/**
 * Dynamically load and inject an HTML file (always).
 * Appends a version query param for cache busting.
 * Injects the HTML into the target container specified by CSS selector.
 * @param route - Object with the component name.
 * @param targetSelector - CSS selector of the target container.
 * @param mode - Whether to 'append' or 'replace' the HTML. Defaults to 'append'.
 */
export async function loadComponentHTML(route: { component: string }, targetSelector: string, mode: 'append' | 'replace' = 'append'): Promise<void> {
  const basePath = import.meta.env.DEV ? `${import.meta.env.BASE_URL}src/components` : `${import.meta.env.BASE_URL}components`;
  const fullUrl = `${basePath}/${route.component}/component.html?v=${ASSET_VERSION}`;  

  try {
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error(`Failed to fetch HTML: ${fullUrl}`);
    const html = await res.text();
    const container = document.querySelector(targetSelector);
    if (!container) throw new Error(`Container not found: ${targetSelector}`);
    if (mode === 'replace') {
      container.innerHTML = html;
    } else {
      container.insertAdjacentHTML('beforeend', html);
    }
  } catch (err) {
    console.warn(`[loadComponentHTML] Failed to load or inject HTML from ${fullUrl}`, err);
    notify('error', `Failed to load HTML for ${route.component}`, 'Component Load Error');
    return; // silently fail
  }
}

/**
 * Dynamically load a CSS stylesheet once.
 * Appends a version query param for cache busting.
 */
export function loadStylesheetOnce(href: string): Promise<void> {
  // Construct URL with version for cache busting
  const url = `${href}?v=${ASSET_VERSION}`;

  // If stylesheet already loaded, resolve immediately
  if (loadedStyles.has(url)) return Promise.resolve();

  // Otherwise, load the stylesheet and add it to the document head
  return new Promise<void>((resolve, reject) => {
    try {
      // Create the link element
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;

      // On successful load, add to cache and resolve
      link.onload = () => {
        loadedStyles.add(url);
        resolve();
      };

      // On error, reject the promise with a useful message
      link.onerror = () => {
        console.warn(`[loadStylesheetOnce] Failed to load stylesheet: ${url}`);
        notify('error', `Failed to load stylesheet: ${url}`, 'Asset Load Error');
        resolve(); // silently fail
      };

      // Append stylesheet to document head
      document.head.appendChild(link);
    } catch (err) {
      console.warn(`[loadStylesheetOnce] Exception loading stylesheet: ${url}`, err);
      notify('error', `Exception loading stylesheet: ${url}`, 'Asset Load Error');
      resolve(); // silently fail
    }
  });
}