import type { ComponentModule } from './types/component-module';
import { loadScriptOnce, loadStylesheetOnce, loadComponentHTMLOnce } from './utils/loaders';
import { RouteMap } from './types/routes';
import { initializeLayout, updateChildView } from './components/main-viewport/component';
import Auth from './utils/auth';
import { getAuthEndpoint } from './utils/config';
import { ASSET_VERSION } from './utils/version';
import { listWebAuthnCredentials, fetchMFAPreference } from 'aws-amplify/auth';

// Vite import map for components
const componentModules = import.meta.glob('./components/**/component.{ts,js}');

// Extend the global Window interface to include our custom properties
declare global {
  interface Window {
    routes: RouteMap;
    registerCleanup: (fn: () => void) => void;
    debug: boolean;
    jQuery: any;
    $: any;
  }
}

// Debug mode - set window.debug = true in console to enable debug logs
window.debug = false;

// Override console.log to respect debug flag
const originalLog = console.log;
console.log = (...args: any[]) => {
  if (window.debug || import.meta.env.DEV) {
    originalLog.apply(console, args);
  }
};

// Store cleanup functions for dynamically loaded components
const cleanupCallbacks: Array<() => void> = [];

// Layout-specific cleanup callbacks
const layoutCleanupCallbacks: Array<() => void> = [];

// Store the last route hash to avoid redundant loads
let lastRouteHash: string | null = null;

function registerCleanup(fn: () => void): void {
  if (typeof fn === 'function') cleanupCallbacks.push(fn);
}

function registerLayoutCleanup(fn: () => void): void {
  if (typeof fn === 'function') layoutCleanupCallbacks.push(fn);
}

function cleanupCurrentComponent(): void {
  while (cleanupCallbacks.length) {
    const fn = cleanupCallbacks.pop();
    try {
      fn?.();
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
}

let isMainViewportLoaded = false;

async function handleRoute(): Promise<void> {
  const hash = window.location.hash.slice(1) || '/';
  const routePath = hash.split('?')[0];
  const route = window.routes?.[routePath];

  if (!route || !route.component) {
    console.warn(`[App] No route found for "${hash}"`);
    return;
  }

  try {
    const isPublic = Auth.PUBLIC_ROUTES.includes(routePath);

    if (!isPublic) {
      const isSessionValid = await Auth.checkSession();

      if (!isSessionValid) {
        const modalEl = document.getElementById('modal-session');
        if (modalEl) {
          const bsModal = new (window as any).bootstrap.Modal(modalEl, {
            backdrop: 'static',
            keyboard: false
          });
          bsModal.show();
          (window as any).App?.init?.();
        }

        // Click handler is attached in the modal show function in auth.ts
        return;
      }
    }
  } catch (err) {
    console.error('[App] Session check failed:', err);
    window.location.href = `${import.meta.env.BASE_URL}`;
    return;
  }

  cleanupCurrentComponent();

  const basePath = import.meta.env.DEV ? `${import.meta.env.BASE_URL}src/components` : `${import.meta.env.BASE_URL}components`;

  if (!isMainViewportLoaded) {
    console.log(`[MainViewport] layout loading from ${basePath}/${route.component}/component.html`);

    const html = await fetch(`${basePath}/${route.component}/component.html`).then(r => r.text());
    document.querySelector('main')!.innerHTML = html;

    const componentPath = Object.keys(componentModules).find(p =>
      p.includes(`/components/${route.component}/component`)
    );
    if (!componentPath || !componentModules[componentPath]) {
      console.error(`[App] Could not find module for ${route.component}`);
      return;
    }

    const mod = (await componentModules[componentPath]!()) as ComponentModule;
    if (mod.init) await mod.init(route.child);

    await initializeLayout();
    isMainViewportLoaded = true;
  } else {
    await updateChildView(route.child);
  }
}

// Re-evaluate the route when the URL hash changes
window.addEventListener('hashchange', handleRoute);

async function loadGlobalAssets(): Promise<void> {
  await Promise.all([
    loadStylesheetOnce(`${import.meta.env.BASE_URL}assets/css/vendor.min.css`),
    loadStylesheetOnce(`${import.meta.env.BASE_URL}assets/css/app.min.css`),
    loadStylesheetOnce(`${import.meta.env.BASE_URL}assets/plugins/gritter/css/jquery.gritter.css`),
  ]);

  // please not Color Admin's app.min.js is loaded when the main-viewport bootstraps
  await loadScriptOnce(`${import.meta.env.BASE_URL}assets/js/vendor.min.js`);
  await loadScriptOnce(`${import.meta.env.BASE_URL}assets/plugins/gritter/js/jquery.gritter.min.js`);
}

// Initialize styles/scripts and load routes on page load
window.addEventListener('DOMContentLoaded', async () => {

  // Auto-redirect if session is already valid
  const alreadyLoggedIn = await Auth.checkSession();
  if (alreadyLoggedIn) {
    console.log('[Login SPA] Session already valid, checking MFA setup...');

    try {
      // Check if user has MFA or passkeys configured
      const passkeyResult = await listWebAuthnCredentials();
      const hasPasskeys = (passkeyResult.credentials || []).length > 0;

      const mfaPreference = await fetchMFAPreference();
      const hasMFA = mfaPreference?.preferred === 'TOTP' || mfaPreference?.enabled?.includes('TOTP');

      if (!hasMFA && !hasPasskeys) {
        console.log('[Login SPA] User has valid session but no MFA setup, showing login page');
        // Don't redirect - continue loading the login page so they can complete setup
        // Fall through to load the login page
      } else {
        console.log('[Login SPA] Session valid and MFA configured, redirecting to /secure/');
        const authEndpoint = getAuthEndpoint();
        window.location.href = authEndpoint;
        return;
      }
    } catch (error) {
      console.warn('[Login SPA] Failed to check MFA status, showing login page:', error);
      // On error, show login page rather than auto-redirecting
      // Fall through to load the login page
    }
  }

  // load global assets
  await loadGlobalAssets()

    // Component session-modal
  const cssPath = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}src/components/session-modal/component.css`
  : `${import.meta.env.BASE_URL}components/session-modal/component.css`;
  await loadStylesheetOnce(cssPath);
  await loadComponentHTMLOnce({ component: 'session-modal' }, '#modal-container')

  // Check for session expiry redirect
  Auth.checkForSessionExpiry();

  // Load route config and start routing
  const routeData = await fetch(`${import.meta.env.BASE_URL}routes.json?v=${ASSET_VERSION}`).then(r => r.json());
  window.routes = routeData;
  
  // Bootstrap the app
  handleRoute();

});

window.registerCleanup = registerCleanup;

export { registerLayoutCleanup, cleanupCurrentComponent };