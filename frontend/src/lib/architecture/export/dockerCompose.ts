import { resolveImplementation } from "../componentLibrary.ts";
import { actsAsOf } from "../customComponents.ts";
import type { ArchitectureNodeType } from "../types.ts";
import type { CustomTechnology } from "../../projects/customTechnologies.ts";

// Turns a design into a starter docker-compose.yml: the reverse of the GitHub import.
// Data stores, caches, queues, search and load balancers become real images; API servers and
// workers become `build:` services for the user's own code; managed cloud services get a local
// stand-in (noted in a comment). Clients, CDNs, DNS and API protocols are not containers: they
// are skipped, and connections through them are followed. Connections become depends_on and
// connection-string environment variables. Pure and deterministic.
//
// The file is also ARCHITECH's own design format. Compose ignores keys starting with "x-", so
// each service carries the component it came from under `x-architech` (id, type, label,
// technology, settings, position), and a top-level `x-architech` holds what is not a container
// (users, CDNs, hosted services...), every connection, and the project's custom technologies.
// fromCompose.ts reads it back exactly, so a design survives export -> import unchanged, and a
// repository import is shown as this file for review before the design is created.
//
// A component imported from a repository remembers the image it ran ("image" setting) or the
// folder it was built from ("build"), so its export keeps them.

export const ARCHITECH_FORMAT_VERSION = 1;

type Node = {
  id: string;
  position?: { x: number; y: number };
  data: { type: ArchitectureNodeType; label?: string; implementation?: string; properties?: Record<string, unknown> };
};
type Edge = { source: string; target: string };

type Kind = "app" | "proxy" | "store" | "skip";
type Image = {
  kind: Kind;
  image?: string;
  port?: number;
  note?: string;
  env?: Record<string, string>;
  command?: string[];
  volume?: string;
  // Environment variable a connected service receives, and its value for service `host`.
  connect?: { name: string; url: (host: string) => string };
};

const APP_PORTS: Record<string, number> = { "nodejs-express": 3000, "go-service": 8080, "python-fastapi": 8000, "java-spring-boot": 8080, "nodejs-worker": 3000 };
const APP_BASE: Record<string, string> = {
  "nodejs-express": "a Node.js (Express) app, e.g. FROM node:22-alpine",
  "go-service": "a Go service, e.g. FROM golang:1.23 then a distroless image",
  "python-fastapi": "a FastAPI app, e.g. FROM python:3.12-slim with uvicorn",
  "java-spring-boot": "a Spring Boot app, e.g. FROM eclipse-temurin:21-jre",
  "nodejs-worker": "a Node.js worker, e.g. FROM node:22-alpine",
};

function imageFor(type: ArchitectureNodeType, implementation: string): Image {
  switch (type) {
    case "server":
    case "worker":
      return { kind: "app", port: APP_PORTS[implementation] ?? 8080, note: `Your code: ${APP_BASE[implementation] ?? "a Dockerfile in this folder"}.` };
    case "load-balancer":
      if (implementation === "haproxy") return { kind: "proxy", image: "haproxy:3.0-alpine", port: 80, note: "Add your haproxy.cfg (backends: the services it connects to)." };
      return {
        kind: "proxy",
        image: "nginx:1.27-alpine",
        port: 80,
        note: implementation === "aws-alb" ? "AWS ALB is managed; NGINX stands in locally. Add an upstream for each service it connects to." : "Add an nginx.conf with an upstream for each service it connects to.",
      };
    case "api-gateway":
      return { kind: "proxy", image: "nginx:1.27-alpine", port: 80, note: "Amazon API Gateway is managed; NGINX stands in locally as the single entry point." };
    case "database":
      if (implementation === "mysql") {
        return {
          kind: "store", image: "mysql:8.4", port: 3306, volume: "/var/lib/mysql",
          env: { MYSQL_DATABASE: "app", MYSQL_USER: "app", MYSQL_PASSWORD: "app", MYSQL_ROOT_PASSWORD: "root" },
          connect: { name: "DATABASE_URL", url: (host) => `mysql://app:app@${host}:3306/app` },
        };
      }
      if (implementation === "mongodb") {
        return { kind: "store", image: "mongo:7", port: 27017, volume: "/data/db", connect: { name: "MONGODB_URL", url: (host) => `mongodb://${host}:27017/app` } };
      }
      return {
        kind: "store", image: "postgres:16-alpine", port: 5432, volume: "/var/lib/postgresql/data",
        env: { POSTGRES_DB: "app", POSTGRES_USER: "app", POSTGRES_PASSWORD: "app" },
        connect: { name: "DATABASE_URL", url: (host) => `postgresql://app:app@${host}:5432/app` },
      };
    case "cache":
      if (implementation === "memcached") return { kind: "store", image: "memcached:1.6-alpine", port: 11211, connect: { name: "MEMCACHED_SERVERS", url: (host) => `${host}:11211` } };
      return { kind: "store", image: "redis:7-alpine", port: 6379, connect: { name: "REDIS_URL", url: (host) => `redis://${host}:6379` } };
    case "queue":
      if (implementation === "apache-kafka") return { kind: "store", image: "apache/kafka:3.8.0", port: 9092, note: "Single-node Kafka (KRaft) for development.", connect: { name: "KAFKA_BROKERS", url: (host) => `${host}:9092` } };
      if (implementation === "amazon-sqs") {
        return {
          kind: "store", image: "localstack/localstack:3", port: 4566, env: { SERVICES: "sqs" },
          note: "Amazon SQS is managed; LocalStack stands in locally.",
          connect: { name: "SQS_ENDPOINT", url: (host) => `http://${host}:4566` },
        };
      }
      return { kind: "store", image: "rabbitmq:3.13-management-alpine", port: 5672, connect: { name: "AMQP_URL", url: (host) => `amqp://guest:guest@${host}:5672` } };
    case "object-storage":
      return {
        kind: "store", image: "minio/minio:latest", port: 9000, volume: "/data", command: ["server", "/data"],
        env: { MINIO_ROOT_USER: "minio", MINIO_ROOT_PASSWORD: "minio-secret" },
        note: "Amazon S3 is managed; MinIO (S3-compatible) stands in locally.",
        connect: { name: "S3_ENDPOINT", url: (host) => `http://${host}:9000` },
      };
    case "search":
      return {
        kind: "store", image: "docker.elastic.co/elasticsearch/elasticsearch:8.15.0", port: 9200, volume: "/usr/share/elasticsearch/data",
        env: { "discovery.type": "single-node", "xpack.security.enabled": "false", ES_JAVA_OPTS: "-Xms512m -Xmx512m" },
        connect: { name: "ELASTICSEARCH_URL", url: (host) => `http://${host}:9200` },
      };
    case "auth":
      return implementation === "authjs"
        ? { kind: "skip", note: "Auth.js runs inside your app, not as its own container." }
        : { kind: "skip", note: `${resolveImplementation(type, implementation).name} is a hosted service: set its credentials in your app's environment.` };
    case "custom":
      return { kind: "skip", note: "Not modelled by ARCHITECH: add it by hand." };
    case "worker":
      return { kind: "app" };
    default:
      // client, web-app, mobile-app, cdn, dns, api: not containers; connections pass through them.
      return { kind: "skip" };
  }
}

const PASS_THROUGH = new Set<ArchitectureNodeType>(["client", "web-app", "mobile-app", "cdn", "dns", "api"]);

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// YAML scalar: quoted unless plainly safe.
const scalar = (value: string | number) =>
  typeof value === "number" || /^[A-Za-z0-9_./:@-]+$/.test(value) && !/^(true|false|yes|no|null|on|off|\d+)$/i.test(value) ? String(value) : JSON.stringify(value);

export type ComposeExport = { yaml: string; services: string[]; skipped: { label: string; reason: string }[] };

// ---- Writing YAML by hand (small, so the output layout and comments stay ours) ----

// YAML scalar for x-architech values: numbers and booleans plain, strings quoted when needed.
const value = (item: unknown): string =>
  typeof item === "number" || typeof item === "boolean" ? String(item) : typeof item === "string" ? scalar(item) : JSON.stringify(item ?? null);
const key = (name: string) => (/^[A-Za-z0-9_-]+$/.test(name) && !/^(true|false|yes|no|null|on|off|\d+)$/i.test(name) ? name : JSON.stringify(name));

// The component a node is, as x-architech lines at `indent`.
function componentLines(node: Node, indent: string, withId: boolean): string[] {
  const lines: string[] = [];
  if (withId) lines.push(`${indent}id: ${value(node.id)}`);
  lines.push(`${indent}type: ${value(node.data.type)}`);
  if (node.data.label !== undefined) lines.push(`${indent}label: ${value(node.data.label)}`);
  if (node.data.implementation) lines.push(`${indent}implementation: ${value(node.data.implementation)}`);
  if (node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)) {
    lines.push(`${indent}position: [${Math.round(node.position.x)}, ${Math.round(node.position.y)}]`);
  }
  const settings = Object.entries(node.data.properties ?? {}).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item));
  if (settings.length > 0) {
    lines.push(`${indent}settings:`);
    for (const [name, item] of settings) lines.push(`${indent}  ${key(name)}: ${value(item)}`);
  }
  return lines;
}

export function toDockerCompose(
  design: { title: string; nodes: readonly Node[]; edges: readonly Edge[]; customTechnologies?: readonly CustomTechnology[] },
  generatedAt = new Date(),
): ComposeExport {
  const nodes = new Map(design.nodes.map((node) => [node.id, node]));
  const plans = new Map<string, Image & { name: string; label: string; implementation: string; build?: string }>();
  const used = new Set<string>();
  const skipped: ComposeExport["skipped"] = [];

  for (const node of design.nodes) {
    // A custom component that acts like something runs as that kind of container.
    const actsAs = node.data.type === "custom" ? actsAsOf(node.data.properties as never) : null;
    const type = actsAs ?? node.data.type;
    const implementation = node.data.type === "custom" ? "custom-technology" : resolveImplementation(type, node.data.implementation).id;
    const label = node.data.label?.trim() || node.data.type;
    const ownImage = typeof node.data.properties?.image === "string" ? node.data.properties.image : undefined;
    const ownBuild = typeof node.data.properties?.build === "string" ? node.data.properties.build : undefined;
    let image: Image;
    if (actsAs) {
      const technology = String(node.data.properties?.technology ?? label);
      const standIn = imageFor(actsAs, resolveImplementation(actsAs, undefined).id);
      // Hosted kinds (auth) still run as a container when the project has its own one.
      const kind: Kind = standIn.kind === "skip" ? "app" : standIn.kind;
      if (ownImage) image = { kind, image: ownImage, ...(standIn.port ? { port: standIn.port } : {}) };
      else if (ownBuild !== undefined || kind === "app") image = { kind: "app", port: standIn.port ?? 8080, ...(ownBuild !== undefined ? {} : { note: `${technology}: your code, or set its image.` }) };
      else image = { ...standIn, kind, note: `${technology}: ${standIn.image} stands in for it; replace it with the real image.` };
    } else {
      image = imageFor(type, implementation);
      if (image.kind !== "skip" && ownImage) image = { ...image, image: ownImage, note: undefined };
      else if (image.kind === "app" && ownBuild !== undefined) image = { ...image, note: undefined };
    }
    if (image.kind === "skip") {
      if (image.note) {
        const technology = node.data.type === "custom" ? String(node.data.properties?.technology ?? "Custom") : label;
        skipped.push({ label: technology, reason: image.note });
      }
      continue;
    }
    // An imported service keeps its own name (its id); a drawn one is named after its label.
    const base = (ownImage !== undefined || ownBuild !== undefined ? slugify(node.id) : "") || slugify(label) || node.data.type;
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`;
    used.add(name);
    plans.set(node.id, { ...image, name, label, implementation, ...(ownBuild !== undefined ? { build: ownBuild } : {}) });
  }

  // Exported services a node reaches, following connections through pass-through nodes.
  const reach = (from: string, seen = new Set<string>()): string[] => {
    const out: string[] = [];
    for (const edge of design.edges) {
      if (edge.source !== from || seen.has(edge.target)) continue;
      seen.add(edge.target);
      if (plans.has(edge.target)) out.push(edge.target);
      else if (nodes.get(edge.target) && PASS_THROUGH.has(nodes.get(edge.target)!.data.type)) out.push(...reach(edge.target, seen));
    }
    return out;
  };
  // Entry services: reached from a client, web or mobile app (through CDNs, DNS or APIs).
  const entries = new Set(design.nodes.filter((node) => ["client", "web-app", "mobile-app"].includes(node.data.type)).flatMap((node) => reach(node.id)));

  const lines: string[] = [
    `# docker-compose.yml for "${design.title.replace(/[\r\n]/g, " ")}", generated by ARCHITECH on ${generatedAt.toISOString().slice(0, 10)}.`,
    "# A starting point: images and connection settings follow your design. Fill in your own code",
    "# under each build: folder, and change the development passwords before deploying anywhere.",
  ];
  if (skipped.length > 0) {
    lines.push("#", "# Not included:");
    for (const item of skipped) lines.push(`#   - ${item.label}: ${item.reason}`);
  }
  // What is not a container, every connection, and the sidebar's custom technologies.
  lines.push(
    "",
    "# ARCHITECH's design: compose ignores x- keys. Edit types, settings and connections here,",
    "# then import this file to rebuild the design.",
    "x-architech:",
    `  version: ${ARCHITECH_FORMAT_VERSION}`,
    `  title: ${value(design.title)}`,
  );
  const others = design.nodes.filter((node) => !plans.has(node.id));
  if (others.length > 0) {
    lines.push("  components:");
    for (const node of others) lines.push(`    ${key(node.id)}:`, ...componentLines(node, "      ", false));
  }
  const connections = design.edges.filter((edge) => nodes.has(edge.source) && nodes.has(edge.target));
  if (connections.length > 0) {
    lines.push("  connections:");
    for (const edge of connections) lines.push(`    - ${value(`${edge.source} -> ${edge.target}`)}`);
  }
  if (design.customTechnologies && design.customTechnologies.length > 0) {
    lines.push("  technologies:");
    for (const technology of design.customTechnologies) {
      lines.push(`    - id: ${value(technology.id)}`, `      name: ${value(technology.name)}`);
      if (technology.actsAs) lines.push(`      actsAs: ${value(technology.actsAs)}`);
      if (technology.evidence.length > 0) {
        lines.push("      evidence:");
        for (const line of technology.evidence) lines.push(`        - ${value(line)}`);
      }
    }
  }
  lines.push("", "services:");

  const volumes: string[] = [];
  let hostPort = 8080;
  for (const [id, plan] of plans) {
    const node = nodes.get(id)!;
    lines.push(`  ${plan.name}:`);
    if (plan.note) lines.push(`    # ${plan.note}`);
    if (plan.kind === "app" && plan.image) {
      // The project's own published image.
      if (plan.build !== undefined) lines.push(`    build: ./${plan.build}`);
      lines.push(`    image: ${scalar(plan.image)}`);
    } else if (plan.kind === "app") {
      lines.push(`    build: ./${plan.build ?? plan.name}`, `    image: ${scalar(`${slugify(design.title) || "app"}-${plan.name}`)}`);
    } else {
      lines.push(`    image: ${scalar(plan.image!)}`);
    }
    if (plan.command) lines.push(`    command: [${plan.command.map((part) => JSON.stringify(part)).join(", ")}]`);
    if (entries.has(id) && plan.port) {
      lines.push("    ports:", `      - ${JSON.stringify(`${hostPort}:${plan.port}`)}`);
      hostPort += 1;
    }
    const env: [string, string][] = Object.entries(plan.env ?? {});
    // Your own code listens on PORT; a published image already knows its port.
    if (plan.kind === "app" && !plan.image) env.push(["PORT", String(plan.port)]);
    // What this service depends on: what it connects to and, for a worker, the queues that feed
    // it. Data stores, caches and queues themselves depend on nothing.
    const targets =
      plan.kind === "store"
        ? []
        : [
            ...reach(id),
            ...(plan.kind === "app"
              ? design.edges.filter((edge) => edge.target === id && nodes.get(edge.source)?.data.type === "queue" && plans.has(edge.source)).map((edge) => edge.source)
              : []),
          ].filter((target, index, all) => target !== id && all.indexOf(target) === index);
    // Connection strings for what this service talks to (a suffix when there are several of a kind).
    const byName = new Map<string, number>();
    for (const target of targets) {
      const connect = plans.get(target)!.connect;
      if (connect) byName.set(connect.name, (byName.get(connect.name) ?? 0) + 1);
    }
    for (const target of targets) {
      const other = plans.get(target)!;
      if (!other.connect) continue;
      const name = byName.get(other.connect.name)! > 1 ? `${other.connect.name}_${other.name.toUpperCase().replace(/-/g, "_")}` : other.connect.name;
      env.push([name, other.connect.url(other.name)]);
    }
    if (env.length > 0) {
      lines.push("    environment:");
      for (const [key, value] of env) lines.push(`      ${key}: ${JSON.stringify(value)}`);
    }
    if (targets.length > 0) {
      lines.push("    depends_on:");
      for (const target of [...new Set(targets)]) lines.push(`      - ${plans.get(target)!.name}`);
    }
    const replicas = Number(node.data.properties?.replicas);
    if (Number.isInteger(replicas) && replicas > 1) {
      if (plan.kind === "app") lines.push("    deploy:", `      replicas: ${replicas}`);
      else lines.push(`    # The design has ${replicas} instances; run replicas/clustering in production, one is enough locally.`);
    }
    if (plan.volume) {
      volumes.push(`${plan.name}-data`);
      lines.push("    volumes:", `      - ${plan.name}-data:${plan.volume}`);
    }
    lines.push("    x-architech:", ...componentLines(node, "      ", node.id !== plan.name));
    lines.push("");
  }
  if (plans.size === 0) lines.push("  {} # Nothing in this design runs as a container yet.", "");
  if (volumes.length > 0) {
    lines.push("volumes:");
    for (const volume of volumes) lines.push(`  ${volume}:`);
    lines.push("");
  }
  return { yaml: lines.join("\n"), services: [...plans.values()].map((plan) => plan.name), skipped };
}
