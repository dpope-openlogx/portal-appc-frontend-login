// Global declarations for third-party libraries
/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    jQuery: any;
    $: any;
  }
}