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
  | "api"
  | "load-balancer"
  | "database"
  | "cache"
  | "queue"
  | "worker"
  | "object-storage"
  | "search"
  | "auth"
  // A technology the app does not model (found when importing a repository). It is drawn
  // and connected like any component; Run Design passes traffic through it unmeasured.
  | "custom";

// A component's saved configuration, for example `{ replicas: 3 }`. Flat on purpose:
// every value is a string, finite number or boolean. See nodeProperties.ts.
export type NodePropertyValue = string | number | boolean;
export type NodeProperties = Record<string, NodePropertyValue>;
