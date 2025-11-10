// src/utils/notify.ts

// Define available notification types
export type NotifyType = 'success' | 'info' | 'warning' | 'error';

// Map each notification type to its corresponding Gritter CSS classes
const classMap: Record<NotifyType, string> = {
  success: 'gritter-success',
  info: 'gritter-info',
  warning: 'gritter-warning',
  error: 'gritter-error', // no 'gritter-light'
};

function isGritterReady(): boolean {
  const jq = (window as any).$;
  return !!(jq && jq.gritter && typeof jq.gritter.add === 'function');
}

// Show a Gritter notification with the given type, text, and optional title
export function notify(type: NotifyType, text: string, title?: string) {

  if (!isGritterReady()) {
    console.warn('[Notify Warning]', 'Gritter not available');
    return;
  }

  const titleClass = `gritter-title-${type}`;
  const options = {
    title: `<span class="${titleClass}">${title ?? type.toUpperCase()}</span>`,
    text,
    class_name: classMap[type],
    sticky: false,
    time: 4000,
  };

  (window as any).$.gritter.add(options);
}

// Shorthand utility methods for each notification type
export const notifyUtil = {
  success: (msg: string, title?: string) => notify('success', msg, title),
  info: (msg: string, title?: string) => notify('info', msg, title),
  warning: (msg: string, title?: string) => notify('warning', msg, title),
  error: (msg: string, title?: string) => notify('error', msg, title),
};