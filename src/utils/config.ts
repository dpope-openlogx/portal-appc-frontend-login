import { notify } from './notify';

export interface IConfig {
  cognito_userPoolId: string;
  cognito_userPoolWebClientId: string;
  admin_cognito_userPoolId?: string;
  admin_cognito_userPoolWebClientId?: string;
}

/**
 * Build service URLs dynamically from current window location
 * Example: https://dev.portal.admin.openlogx.com
 * - API: https://dev.portal.admin.api.openlogx.com
 * - Auth: https://dev.portal.admin.auth.openlogx.com
 * - WebSocket: https://dev.portal.admin.ws.openlogx.com
 */
export function buildServiceUrl(service: 'api' | 'auth' | 'ws'): string {
  try {
    const currentHost = window.location.host;
    const protocol = window.location.protocol;

    // For local development (localhost or local.openlogx.com), use specific fallbacks
    if (currentHost.includes('local')) {
      switch (service) {
        case 'auth':
          return `${import.meta.env.BASE_URL}secure/`;
        case 'api':
          return '/api/'; // Will be proxied by vite middleware
        case 'ws':
          return `ws://localhost:${window.location.port}/ws/`;
        default:
          return '/';
      }
    }

    // For production domains ending with .openlogx.com
    if (currentHost.includes('.openlogx.com')) {
      const parts = currentHost.split('.');
      if (parts.length >= 3) {
        // Find the position of 'openlogx' and insert the service before it
        const openlogxIndex = parts.findIndex(part => part === 'openlogx');
        if (openlogxIndex >= 0) {
          parts.splice(openlogxIndex, 0, service);
          const serviceHost = parts.join('.');
          const baseUrl = `${protocol}//${serviceHost}`;
          // AWS API Gateway WebSocket still uses https, not wss
          return service === 'auth' ? `${baseUrl}/callback` : baseUrl;
        }
      }
    }

    // Fallback for unexpected domains
    switch (service) {
      case 'auth':
        return `${import.meta.env.BASE_URL}secure/`;
      case 'api':
        return '/api/';
      case 'ws':
        return '/ws/';
      default:
        return '/';
    }
  } catch (error) {
    console.warn(`Failed to build ${service} URL from current location, using fallback`, error);
    return service === 'auth' ? `${import.meta.env.BASE_URL}secure/` : `${import.meta.env.BASE_URL}${service}/`;
  }
}

/**
 * Get the auth endpoint URL
 */
export function getAuthEndpoint(): string {
  return buildServiceUrl('auth');
}

/**
 * Get the API base URL
 */
export function getApiBaseUrl(): string {
  return buildServiceUrl('api');
}

/**
 * Get the WebSocket URL
 */
export function getWebSocketUrl(): string {
  return buildServiceUrl('ws');
}

let cachedConfig: IConfig | null = null;

export async function getConfig(): Promise<IConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    // Note: In production (e.g., CloudFront), missing or error responses for /config.json 
    // will typically result in non-200 status codes, and response.ok will correctly be false.
    // However, in Vite's dev server, it may return 200 OK even if the file doesn't exist,
    // often serving an HTML fallback. So we must also manually parse the text to detect invalid JSON.
    const response = await fetch(`${import.meta.env.BASE_URL}config.json`);
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status}`);
    }

    const text = await response.text();

    cachedConfig = JSON.parse(text);
    return cachedConfig!;
  } catch (error) {
    notify('error', 'Failed to load config.json', 'Config Error');
    throw error;
  }
}