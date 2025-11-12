import { loadScriptOnce,loadStylesheetOnce } from '../../utils/loaders';
import { reinitializeTemplate } from '../../utils/template';
import type { RouteEntry } from '../../types/routes';
import type { ComponentModule } from '../../types/component-module';
import { registerLayoutCleanup, cleanupCurrentComponent } from '../../app';

let currentComponent: string | null = null;
const componentName = 'main-viewport';

let initCount = 0;

export async function init(): Promise<void> {
  initCount++;
  console.log('[main-Viewport] component initialized', initCount);
  await loadScriptOnce(`${import.meta.env.BASE_URL}assets/js/app.min.js`);

  // Component css
  const cssPath = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}src/components/${componentName}/component.css`
  : `${import.meta.env.BASE_URL}components/${componentName}/component.css`;
  await loadStylesheetOnce(cssPath);

  // Loading CRUD plugins on main-viewport
  await loadScriptOnce(`${import.meta.env.BASE_URL}assets/plugins/parsleyjs/parsley.min.js`); //validation plugin

  // Color Admin: Reinitializes the global App template logic
  reinitializeTemplate();
}

export function destroy(): void {
  console.log('[main-viewport] component destroy');

  initCount--; // debug counter
}

// This is called by App.ts, it initializes header-slot, sidemenu-slot, main-slot
export async function initializeLayout(): Promise<void> {
  const appContainer = document.getElementById('app');
  const componentSlots = appContainer?.querySelectorAll('[data-component]') ?? [];
  const componentModules = import.meta.glob('../*/component.ts');
  const basePath = import.meta.env.DEV ? `${import.meta.env.BASE_URL}src/components` : `${import.meta.env.BASE_URL}components`;

  for (const el of Array.from(componentSlots)) {
    const name = el.getAttribute('data-component');
    //if (!name) continue;
    if (!name || name === 'login') continue;

    try {
      const html = await fetch(`${basePath}/${name}/component.html`).then((r) => r.text());
      el.innerHTML = html;

      const path = `../${name}/component.ts`;
      const loader = componentModules[path];
      if (!loader) {
        console.error(`[MainViewport] Could not find module for component "${name}"`);
        continue;
      }

      const mod = await loader() as ComponentModule;
      if (mod.init) await mod.init();
      if (mod.destroy) registerLayoutCleanup(mod.destroy);
    } catch (err) {
      console.error(`[MainViewport] Failed to load component "${name}"`, err);
    }

  }

  reinitializeTemplate();  

  // Ensure the initial route component (e.g., login) is loaded via updateChildView
  const hash = window.location.hash || '#/';
  const path = hash.replace(/^#/, '');

  const response = await fetch('/routes.json');
  const routes: Record<string, RouteEntry> = await response.json();
  const route = routes[path] || routes['/'];

  if (route?.child) {
    await updateChildView(route.child);
  }

  requestAnimationFrame(setupSessionInvalidHandler);
}

export async function updateChildView(childRoute: RouteEntry['child'] | undefined): Promise<void> {
  if (!childRoute || !childRoute.component) return;

  if (childRoute.component === currentComponent) {
    console.log('[MainViewport] Skipping reloading same component');
    return;
  }
  currentComponent = childRoute.component;

  const slot = document.querySelector<HTMLDivElement>('#main-slot');
  if (!slot) {
    console.error('[MainViewport] No #main-slot found');
    return;
  }

  try {
    cleanupCurrentComponent();

    const basePath = import.meta.env.DEV ? `${import.meta.env.BASE_URL}src/components` : `${import.meta.env.BASE_URL}components`;
    const html = await fetch(`${basePath}/${childRoute.component}/component.html`).then((r) => r.text());
    
    slot.innerHTML = html;
    console.log(`[MainViewport] Injected HTML (${childRoute.component}) into slot from ${basePath}/${childRoute.component}/component.html`);

    // Parsley: Configure email validator and bind validation after the child component's HTML is injected
    if ((window as any).jQuery && (window as any).jQuery.fn.parsley) {
      // Override Parsley's email validator to support + character and other valid email characters
      (window as any).Parsley.addValidator('email', {
        validateString: function(value: string) {
          // More comprehensive email regex that supports + and other valid characters
          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          return emailRegex.test(value);
        },
        messages: {
          en: 'This value should be a valid email.'
        }
      }, true); // true means override existing validator

      (window as any).jQuery('form[data-parsley-validate]').parsley();
    }

    const modules = import.meta.glob('../**/component.ts');
    const importPath = `../${childRoute.component}/component.ts`;
    const loader = modules[importPath];

    if (!loader) {
      console.error('[MainViewport] Could not find module for path:', importPath);
      slot.innerHTML = '<p>Component not found</p>';
      return;
    }

    const mod = await loader() as ComponentModule;

    if (mod.init) await mod.init();
    if (mod.destroy) {
      window.registerCleanup(mod.destroy);
    }
  } catch (err) {
    console.error('[MainViewport] Failed to load child component:', err);
  }

  reinitializeTemplate();
}

// Session invalid modal handler
function setupSessionInvalidHandler() {
  // Handler is now managed in auth.ts showSessionExpiredModal function
  // to avoid duplicate event listeners and unwanted reloads
  return;
}

// Listen for session:invalid custom event and show the modal
window.addEventListener('session:invalid', () => {
  const modal = document.getElementById('modal-session');
  if (modal) {
    (window as any).jQuery(modal).modal('show');
  }
});