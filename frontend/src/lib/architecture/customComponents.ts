import type { GraphNode } from "./graph.ts";
import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// Custom components (technologies ARCHITECH does not model, such as ClickHouse or Zipkin) are
// measured like built-in ones once they say what they act like. A custom node's properties:
//   technology       its name, e.g. "ClickHouse" (shown on the node)
//   actsAs           the built-in component type whose behaviour it shares, e.g. "database"
//   replicas         instances, as for any component
//   capacity         work per second per instance
//   latencyMs        added to a request passing through, when idle
//   costPerInstance  monthly cost of one instance, in dollars
//   availability     availability of one instance, 0-1 (0.999 is 99.9%)
// Numbers left out use the actsAs type's standard technology. Without actsAs the node is drawn
// but not measured (traffic passes through it), as before.

// What a custom component can act like: everything that carries or stores requests.
export const ACTS_AS_TYPES = [
  "server",
  "worker",
  "api-gateway",
  "load-balancer",
  "database",
  "cache",
  "queue",
  "object-storage",
  "search",
  "auth",
  "cdn",
] as const satisfies readonly ArchitectureNodeType[];
export type ActsAsType = (typeof ACTS_AS_TYPES)[number];

export const ACTS_AS_LABELS: Record<ActsAsType, string> = {
  server: "API server",
  worker: "Background worker",
  "api-gateway": "API gateway",
  "load-balancer": "Load balancer / proxy",
  database: "Database",
  cache: "Cache",
  queue: "Message queue",
  "object-storage": "Object storage",
  search: "Search",
  auth: "Authentication",
  cdn: "CDN",
};

export const isActsAsType = (value: unknown): value is ActsAsType =>
  typeof value === "string" && (ACTS_AS_TYPES as readonly string[]).includes(value);

export function actsAsOf(properties: NodeProperties | undefined): ActsAsType | null {
  const value = properties?.actsAs;
  return isActsAsType(value) ? value : null;
}

// Overrides a custom component puts on its role's standard profile.
export type ProfileOverrides = {
  latencyMs?: number;
  monthlyCostPerInstance?: number;
  availability?: number;
};

// Limits for the custom numbers (shared by validation and the engine).
export const CUSTOM_LIMITS = {
  latencyMs: { min: 0, max: 60_000 },
  costPerInstance: { min: 0, max: 1_000_000 },
  availability: { min: 0.5, max: 1 },
} as const;

const numberIn = (value: unknown, limits: { min: number; max: number }) =>
  typeof value === "number" && Number.isFinite(value) && value >= limits.min && value <= limits.max ? value : undefined;

// The node as the engine measures it: a custom node with actsAs becomes a node of that type
// carrying its own numbers; anything else is returned unchanged.
export function measuredNode(node: GraphNode): GraphNode {
  if (node.data.type !== "custom") return node;
  const actsAs = actsAsOf(node.data.properties);
  if (!actsAs) return node;
  const properties = node.data.properties ?? {};
  const profile: ProfileOverrides = {};
  const latency = numberIn(properties.latencyMs, CUSTOM_LIMITS.latencyMs);
  const cost = numberIn(properties.costPerInstance, CUSTOM_LIMITS.costPerInstance);
  const availability = numberIn(properties.availability, CUSTOM_LIMITS.availability);
  if (latency !== undefined) profile.latencyMs = latency;
  if (cost !== undefined) profile.monthlyCostPerInstance = cost;
  if (availability !== undefined) profile.availability = availability;
  const kept: NodeProperties = {};
  for (const key of ["replicas", "capacity"]) if (properties[key] !== undefined) kept[key] = properties[key];
  return {
    id: node.id,
    data: {
      type: actsAs,
      ...(node.data.label === undefined ? {} : { label: node.data.label }),
      ...(Object.keys(kept).length > 0 ? { properties: kept } : {}),
      ...(Object.keys(profile).length > 0 ? { profile } : {}),
    },
  };
}

// ---- Guessing what an unmodeled technology acts like (for imports) ----

const GUESSES: [RegExp, ActsAsType][] = [
  [/clickhouse|cassandra|scylla|cockroach|timescale|influx|neo4j|couch|dynamo|questdb|druid|tidb|yugabyte|mssql|sqlserver|sql-server|oracle|db2|firebird|hsqldb|h2db|surreal|arangodb|rethink/, "database"],
  [/pgbouncer|pgpool|proxysql|envoy|traefik|caddy|varnish|squid|apache|httpd|ingress|proxy|balancer/, "load-balancer"],
  [/kong|tyk|krakend|gateway|zuul/, "api-gateway"],
  [/seaweed|minio|ceph|swift|gcs|blob|storage|s3/, "object-storage"],
  [/hazelcast|ignite|dragonfly|keydb|aerospike|varnish-cache|cache/, "cache"],
  [/nats|pulsar|activemq|artemis|zeromq|mosquitto|emqx|redpanda|sqs|sns|pubsub|kinesis|eventhub|queue|broker|mq\b/, "queue"],
  [/solr|meili|typesense|algolia|opensearch|sphinx|vespa|search/, "search"],
  [/keycloak|authelia|authentik|hydra|ory|kratos|zitadel|cognito|auth0|okta|identity|oauth|auth/, "auth"],
  [/worker|consumer|cron|scheduler|celery|sidekiq|beat|job|task|ingest|processor|forwarder|replacer|cleanup/, "worker"],
];

// What a technology most likely acts like, from its name. Anything else runs code: an API server.
export function guessActsAs(name: string): ActsAsType {
  const key = name.toLowerCase();
  for (const [pattern, type] of GUESSES) if (pattern.test(key)) return type;
  return "server";
}

// Operations tools: monitoring, tracing, service discovery, configuration, admin consoles.
// Imports place and cost them, but do not route user requests through them.
export function isOperationsTool(name: string): boolean {
  return /prometheus|grafana|zipkin|jaeger|tempo|loki|kibana|elastic-apm|otel|opentelemetry|collector|datadog|newrelic|sentry-relay-monitor|alertmanager|node-exporter|cadvisor|eureka|consul|etcd|zookeeper|discovery|config-server|configserver|spring-cloud-config|admin|pgadmin|adminer|portainer|mailhog|mailpit|smtp|maildev|seq\b|flower|redis-commander|kafka-ui|kafdrop|akhq|healthcheck|watchtower|uptime|load-?gen|loadgen|locust|k6|jmeter|gatling|telemetry-docs|swagger|docs$/.test(
    name.toLowerCase(),
  );
}
