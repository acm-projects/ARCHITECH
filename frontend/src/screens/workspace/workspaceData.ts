import type { IconName } from "../../components/ui";
import type { ExperienceLevel } from "../../types";

export type NodeKind =
  | "client"
  | "lb"
  | "gateway"
  | "service"
  | "cache"
  | "queue"
  | "database"
  | "storage"
  | "cdn"
  | "external";

export type NodePropertyValue = string | number | boolean;
export type NodePropertyValues = Record<string, NodePropertyValue>;

export interface NodePortDefinition {
  id: string;
  label: string;
  side: "left" | "right" | "top" | "bottom";
  direction: "in" | "out" | "both";
}

export interface NodePropertyField {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  unit?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export interface NodeDefinition {
  kind: NodeKind;
  label: string;
  category: "Traffic" | "Compute" | "Data" | "Integration";
  icon: IconName;
  description: string;
  defaults: NodePropertyValues;
  fields: NodePropertyField[];
  ports: NodePortDefinition[];
}

export interface ToolboxItem {
  short: string;
  name: string;
  kind: NodeKind;
  icon: IconName;
  group: NodeDefinition["category"];
}

const select = (
  key: string,
  label: string,
  options: readonly string[],
): NodePropertyField => ({ key, label, type: "select", options });

const number = (
  key: string,
  label: string,
  unit: string,
  min = 0,
  max = 1000000,
  step = 1,
): NodePropertyField => ({ key, label, type: "number", unit, min, max, step });

const text = (
  key: string,
  label: string,
  placeholder = "",
): NodePropertyField => ({ key, label, type: "text", placeholder });

export const NODE_DEFINITIONS: Record<NodeKind, NodeDefinition> = {
  client: {
    kind: "client",
    label: "Client",
    category: "Traffic",
    icon: "client",
    description: "The user-facing caller that originates requests.",
    defaults: {
      platform: "Web browser",
      protocol: "HTTPS",
      region: "Global",
      concurrency: 2500,
    },
    fields: [
      select("platform", "Platform", ["Web browser", "iOS / Android", "Desktop app", "Service client"]),
      select("protocol", "Protocol", ["HTTPS", "HTTP/2", "WebSocket", "gRPC"]),
      text("region", "Region", "Global"),
      number("concurrency", "Peak concurrency", "users", 1, 1000000, 100),
    ],
    ports: [
      { id: "request", label: "REQUEST", side: "right", direction: "out" },
      { id: "response", label: "RESPONSE", side: "left", direction: "in" },
    ],
  },
  lb: {
    kind: "lb",
    label: "Load Balancer",
    category: "Traffic",
    icon: "balance",
    description: "Distributes traffic across healthy upstream instances.",
    defaults: {
      algorithm: "Least connections",
      healthCheck: "HTTP /health",
      tls: "Terminate",
      capacity: 12000,
    },
    fields: [
      select("algorithm", "Algorithm", ["Round robin", "Least connections", "Weighted round robin", "IP hash"]),
      text("healthCheck", "Health check", "HTTP /health"),
      select("tls", "TLS", ["Terminate", "Pass through", "Re-encrypt upstream"]),
      number("capacity", "Rated capacity", "req/s", 100, 1000000, 100),
    ],
    ports: [
      { id: "ingress", label: "INGRESS", side: "left", direction: "in" },
      { id: "upstream", label: "UPSTREAM", side: "right", direction: "out" },
      { id: "health", label: "HEALTH", side: "bottom", direction: "out" },
    ],
  },
  gateway: {
    kind: "gateway",
    label: "API Gateway",
    category: "Traffic",
    icon: "gateway",
    description: "Terminates public API traffic and applies routing policy.",
    defaults: {
      protocol: "REST / HTTPS",
      auth: "JWT",
      rateLimit: 5000,
      routes: 12,
    },
    fields: [
      select("protocol", "Protocol", ["REST / HTTPS", "GraphQL", "gRPC", "WebSocket"]),
      select("auth", "Authentication", ["JWT", "OAuth 2.0", "API key", "mTLS"]),
      number("rateLimit", "Rate limit", "req/min", 0, 1000000, 100),
      number("routes", "Routes", "routes", 1, 1000, 1),
    ],
    ports: [
      { id: "ingress", label: "INGRESS", side: "left", direction: "in" },
      { id: "route", label: "ROUTES", side: "right", direction: "out" },
      { id: "policy", label: "POLICY", side: "top", direction: "both" },
    ],
  },
  service: {
    kind: "service",
    label: "API Server",
    category: "Compute",
    icon: "server",
    description: "Runs application logic and scales with request load.",
    defaults: {
      runtime: "Node.js 22",
      replicas: 3,
      autoscaling: "2–10",
      port: 8080,
    },
    fields: [
      select("runtime", "Runtime", ["Node.js 22", "Java 21", "Go 1.24", "Python 3.13", "Rust"]),
      number("replicas", "Replicas", "instances", 1, 500, 1),
      text("autoscaling", "Autoscaling", "2–10"),
      number("port", "Service port", "tcp", 1, 65535, 1),
    ],
    ports: [
      { id: "request", label: "IN", side: "left", direction: "in" },
      { id: "response", label: "OUT", side: "right", direction: "out" },
      { id: "async", label: "ASYNC", side: "bottom", direction: "out" },
    ],
  },
  cache: {
    kind: "cache",
    label: "Cache",
    category: "Data",
    icon: "cache",
    description: "Keeps hot data in memory to reduce latency and origin load.",
    defaults: {
      engine: "Redis",
      memory: 8,
      ttl: 300,
      eviction: "allkeys-lru",
    },
    fields: [
      select("engine", "Engine", ["Redis", "Redis Cluster", "Memcached", "KeyDB"]),
      number("memory", "Memory", "GB", 1, 2048, 1),
      number("ttl", "Default TTL", "sec", 0, 86400, 30),
      select("eviction", "Eviction", ["allkeys-lru", "volatile-lru", "allkeys-lfu", "noeviction"]),
    ],
    ports: [
      { id: "read", label: "GET", side: "left", direction: "both" },
      { id: "write", label: "SET", side: "right", direction: "both" },
    ],
  },
  queue: {
    kind: "queue",
    label: "Queue",
    category: "Integration",
    icon: "queue",
    description: "Buffers asynchronous work and decouples producers from consumers.",
    defaults: {
      engine: "Kafka",
      partitions: 12,
      retention: "24 h",
      delivery: "At least once",
    },
    fields: [
      select("engine", "Broker", ["Kafka", "RabbitMQ", "AWS SQS", "Redis Streams"]),
      number("partitions", "Partitions / queues", "count", 1, 10000, 1),
      text("retention", "Retention", "24 h"),
      select("delivery", "Delivery", ["At least once", "At most once", "Exactly once"]),
    ],
    ports: [
      { id: "publish", label: "PUB", side: "left", direction: "in" },
      { id: "consume", label: "SUB", side: "right", direction: "out" },
    ],
  },
  database: {
    kind: "database",
    label: "Database",
    category: "Data",
    icon: "database",
    description: "Persists structured application state and serves queries.",
    defaults: {
      engine: "PostgreSQL 16",
      storage: 500,
      replicas: 2,
      consistency: "Strong",
    },
    fields: [
      select("engine", "Engine", ["PostgreSQL 16", "MySQL 8", "MongoDB", "Cassandra"]),
      number("storage", "Provisioned storage", "GB", 1, 100000, 10),
      number("replicas", "Read replicas", "replicas", 0, 50, 1),
      select("consistency", "Consistency", ["Strong", "Read-after-write", "Eventual"]),
    ],
    ports: [
      { id: "query", label: "QUERY", side: "left", direction: "both" },
      { id: "replica", label: "REPL", side: "right", direction: "out" },
    ],
  },
  storage: {
    kind: "storage",
    label: "Object Storage",
    category: "Data",
    icon: "storage",
    description: "Stores durable blobs, media, backups, and static assets.",
    defaults: {
      storageClass: "Object storage",
      capacity: 2000,
      redundancy: "Multi-AZ",
      lifecycle: "30d → archive",
    },
    fields: [
      select("storageClass", "Storage class", ["Object storage", "Block storage", "File storage", "Archive"]),
      number("capacity", "Capacity", "GB", 1, 10000000, 100),
      select("redundancy", "Redundancy", ["Single zone", "Multi-AZ", "Cross-region"]),
      text("lifecycle", "Lifecycle policy", "30d → archive"),
    ],
    ports: [
      { id: "object", label: "OBJECT", side: "left", direction: "both" },
      { id: "events", label: "EVENTS", side: "right", direction: "out" },
    ],
  },
  cdn: {
    kind: "cdn",
    label: "CDN",
    category: "Traffic",
    icon: "globe",
    description: "Caches content at edge locations close to users.",
    defaults: {
      provider: "Edge CDN",
      regions: 35,
      ttl: 3600,
      compression: "Brotli + gzip",
    },
    fields: [
      text("provider", "Provider", "Edge CDN"),
      number("regions", "Edge regions", "regions", 1, 500, 1),
      number("ttl", "Cache TTL", "sec", 0, 604800, 60),
      select("compression", "Compression", ["Brotli + gzip", "Brotli", "gzip", "Off"]),
    ],
    ports: [
      { id: "origin", label: "ORIGIN", side: "left", direction: "in" },
      { id: "edge", label: "EDGE", side: "right", direction: "out" },
    ],
  },
  external: {
    kind: "external",
    label: "External Service",
    category: "Integration",
    icon: "external",
    description: "Represents a third-party dependency outside your system boundary.",
    defaults: {
      provider: "Third-party API",
      endpoint: "api.example.com",
      auth: "OAuth 2.0",
      sla: "99.9%",
    },
    fields: [
      text("provider", "Provider", "Third-party API"),
      text("endpoint", "Endpoint", "api.example.com"),
      select("auth", "Authentication", ["OAuth 2.0", "API key", "mTLS", "None"]),
      text("sla", "Published SLA", "99.9%"),
    ],
    ports: [
      { id: "request", label: "REQ", side: "left", direction: "in" },
      { id: "response", label: "RESP", side: "right", direction: "out" },
    ],
  },
};

export const RECOMMENDED_CONFIG_INDEX: Record<ExperienceLevel, number> = {
  Beginner: 0,
  Intermediate: 1,
  Advanced: 2,
};

export const TOOLBOX_ITEMS: ToolboxItem[] = [
  { short: "CL", name: "Client", kind: "client", icon: "client", group: "Traffic" },
  { short: "LB", name: "Load Balancer", kind: "lb", icon: "balance", group: "Traffic" },
  { short: "GW", name: "API Gateway", kind: "gateway", icon: "gateway", group: "Traffic" },
  { short: "CDN", name: "CDN", kind: "cdn", icon: "globe", group: "Traffic" },
  { short: "API", name: "API Server", kind: "service", icon: "server", group: "Compute" },
  { short: "C", name: "Cache", kind: "cache", icon: "cache", group: "Data" },
  { short: "DB", name: "Database", kind: "database", icon: "database", group: "Data" },
  { short: "S3", name: "Object Storage", kind: "storage", icon: "storage", group: "Data" },
  { short: "Q", name: "Queue", kind: "queue", icon: "queue", group: "Integration" },
  { short: "EXT", name: "External Service", kind: "external", icon: "external", group: "Integration" },
];

export const WORKSPACE_TOUR = [
  ["Your component toolbox", "Drag infrastructure building blocks onto the canvas. Components are grouped by the role they play in the system."],
  ["Build on the canvas", "Move any node to arrange your system. Guides appear when components snap into alignment."],
  ["Create clean connections", "Start from a labeled port, then choose the destination component or port. Connections show how requests and data travel."],
  ["Test your architecture", "Run Test simulates real traffic, load, queues, and failures across every connection."],
  ["Read live system health", "These metrics update during a test so you can spot latency, cost, and reliability tradeoffs."],
  ["Meet your AI Architect", "Ask why something failed, find bottlenecks, or get a recommendation tailored to your level."],
] as const;

export function getNodeKind(name: string): NodeKind {
  const normalized = name.toLowerCase();

  if (normalized.includes("external") || normalized.includes("third-party") || normalized.includes("third party")) return "external";
  if (normalized.includes("cdn") || normalized.includes("edge")) return "cdn";
  if (normalized.includes("load balancer") || (normalized.includes("lb") && normalized.length < 6)) return "lb";
  if (normalized.includes("api gateway") || normalized.includes("gateway")) return "gateway";
  if (
    normalized.includes("cache") ||
    normalized.includes("redis") ||
    normalized.includes("memcache")
  ) return "cache";
  if (
    normalized.includes("queue") ||
    normalized.includes("kafka") ||
    normalized.includes("rabbit") ||
    normalized.includes("sqs")
  ) return "queue";
  if (
    normalized.includes("object storage") ||
    normalized.includes("blob") ||
    normalized.includes("bucket") ||
    normalized.includes("content store") ||
    normalized.includes("s3")
  ) return "storage";
  if (
    normalized.includes("database") ||
    normalized.includes("sql") ||
    normalized.includes("postgres") ||
    normalized.includes("mongo") ||
    normalized.includes("cassandra")
  ) return "database";
  if (
    normalized.includes("client") ||
    normalized.includes("browser") ||
    normalized.includes("smart tv") ||
    normalized.includes("mobile")
  ) return "client";

  return "service";
}

export function getNodeDefinition(nameOrKind: string): NodeDefinition {
  const kind = nameOrKind in NODE_DEFINITIONS
    ? (nameOrKind as NodeKind)
    : getNodeKind(nameOrKind);

  return NODE_DEFINITIONS[kind];
}

export function getDefaultNodeProperties(nameOrKind: string): NodePropertyValues {
  return { ...getNodeDefinition(nameOrKind).defaults };
}

function displayValue(value: NodePropertyValue | undefined): string {
  if (value === undefined || value === "") return "—";
  return String(value);
}

export function getNodeSummary(
  nameOrKind: string,
  properties: NodePropertyValues = {},
): string {
  const definition = getNodeDefinition(nameOrKind);
  const values = { ...definition.defaults, ...properties };

  switch (definition.kind) {
    case "client":
      return `${displayValue(values.platform)} · ${displayValue(values.protocol)}`;
    case "lb":
      return `${displayValue(values.algorithm)} · ${Number(values.capacity).toLocaleString()} req/s`;
    case "gateway":
      return `${displayValue(values.protocol)} · ${displayValue(values.routes)} routes`;
    case "service":
      return `${displayValue(values.replicas)} replicas · :${displayValue(values.port)}`;
    case "cache":
      return `${displayValue(values.engine)} · ${displayValue(values.memory)} GB · TTL ${displayValue(values.ttl)}s`;
    case "queue":
      return `${displayValue(values.engine)} · ${displayValue(values.partitions)} partitions`;
    case "database":
      return `${displayValue(values.engine)} · ${displayValue(values.storage)} GB · ${displayValue(values.replicas)} replicas`;
    case "storage":
      return `${displayValue(values.storageClass)} · ${displayValue(values.capacity)} GB`;
    case "cdn":
      return `${displayValue(values.regions)} regions · TTL ${displayValue(values.ttl)}s`;
    case "external":
      return `${displayValue(values.provider)} · ${displayValue(values.sla)} SLA`;
  }
}


export function getPortDefinition(
  nameOrKind: string,
  portId: string,
): NodePortDefinition | undefined {
  return getNodeDefinition(nameOrKind).ports.find((port) => port.id === portId);
}

export function getDefaultOutputPort(nameOrKind: string): string {
  const port = getNodeDefinition(nameOrKind).ports.find(
    (candidate) => candidate.direction === "out" || candidate.direction === "both",
  );
  return port?.id ?? "out";
}

export function getDefaultInputPort(nameOrKind: string): string {
  const port = getNodeDefinition(nameOrKind).ports.find(
    (candidate) => candidate.direction === "in" || candidate.direction === "both",
  );
  return port?.id ?? "in";
}

export function validatePortConnection(input: {
  fromName: string;
  fromPortId: string;
  toName: string;
  toPortId: string;
}): { valid: true } | { valid: false; reason: string } {
  const fromPort = getPortDefinition(input.fromName, input.fromPortId);
  const toPort = getPortDefinition(input.toName, input.toPortId);

  if (!fromPort) {
    return { valid: false, reason: "Choose a valid output port" };
  }
  if (!toPort) {
    return { valid: false, reason: "Choose a valid input port" };
  }
  if (fromPort.direction === "in") {
    return { valid: false, reason: `${fromPort.label} only accepts incoming traffic` };
  }
  if (toPort.direction === "out") {
    return { valid: false, reason: `${toPort.label} only sends outgoing traffic` };
  }

  return { valid: true };
}

export function getConnectionLabel(fromName: string, toName: string): string {
  const from = getNodeKind(fromName);
  const to = getNodeKind(toName);

  if (to === "database") return "SQL";
  if (to === "cache") return "GET / SET";
  if (to === "queue") return "PUBLISH";
  if (to === "storage") return "OBJECT";
  if (to === "cdn") return "EDGE";
  if (to === "external" || from === "external") return "HTTPS";
  if (from === "cdn") return "ORIGIN";
  if (from === "client") return "HTTPS";
  if (from === "lb") return "ROUTE";
  if (from === "gateway") return "API";
  if (from === "service") return "RPC";

  return "TCP";
}
