import type { RouteEntry } from './routes';

export interface ComponentModule {
  init?: (childRoute?: RouteEntry) => Promise<void> | void;
  destroy?: () => void;
}