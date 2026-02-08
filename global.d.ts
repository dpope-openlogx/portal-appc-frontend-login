// Global declarations for third-party libraries
/// <reference types="vite/client" />

export {};

declare global {
  const __BUILD_HASH__: string;

  interface Window {
    jQuery: any;
    $: any;
  }
}