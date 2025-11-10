export interface RouteEntry {
  component: string;
  child?: {
    component: string;
  };
}

export type RouteMap = Record<string, RouteEntry>;