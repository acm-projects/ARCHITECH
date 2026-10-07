// Component types a node on the architecture canvas can have. The single definition:
// the canvas, the saved-project validator and the analysis all read it from here.
export type ArchitectureNodeType =
  | "client"
  | "web-app"
  | "mobile-app"
  | "cdn"
  | "dns"
  | "server"
  | "api-gateway"
  | "load-balancer"
  | "database"
  | "cache"
  | "queue"
  | "worker"
  | "object-storage"
  | "search"
  | "auth";

// A component's saved configuration, for example `{ replicas: 3 }`. Flat on purpose:
// every value is a string, finite number or boolean. See nodeProperties.ts.
export type NodePropertyValue = string | number | boolean;
export type NodeProperties = Record<string, NodePropertyValue>;
