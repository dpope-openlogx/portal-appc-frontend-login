/**
 * Reinitializes the global App template logic.
 * This is typically used when new DOM content is injected dynamically (e.g., via routing)
 * and requires the template scripts (like layout JS plugins) to re-run on the updated content.
 */
export function reinitializeTemplate(): void {
  if ((window as any).App?.init) {
    (window as any).App.init();
  } else {
    console.warn('[Template] App.init() not found');
  }
}