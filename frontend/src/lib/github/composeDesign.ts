import { parseDocument } from "yaml";

import { interpolate, normalizePath, parseDotEnv } from "./composeEnv.ts";

import { guessActsAs, isOperationsTool, type ActsAsType } from "../architecture/customComponents.ts";
import type { ArchitectureNodeType, NodeProperties } from "../architecture/types.ts";
import type { CustomTechnology } from "../projects/customTechnologies.ts";
import { GRAPH_SCHEMA_VERSION, type GraphDocument } from "../projects/projectPayload.ts";
import { COLUMN_OF, COLUMN_WIDTH, ROW_HEIGHT } from "./buildDesign.ts";
import { resolveImplementation } from "../architecture/componentLibrary.ts";
import { BUILD_IMAGES, COMPOSE_NAME, KNOWN_NAMES, detectStack, detectUnmodeled, isRelational, relationalRank, modeledImage, slug, squash, titleCase, type DetectedComponent } from "./detectStack.ts";

// A design from a repository's docker-compose file: one component per service, connected the
// way the services say they talk (depends_on, links, and environment values that name another
// service, such as DATABASE_URL=postgres://db:5432). This is how the system really runs, so
// it is preferred to guessing from the libraries a repository uses (buildDesign.ts), which
// is the fallback when there is no compose file.
//
//   - A service running a modeled image (postgres, redis, nginx...) is that component.
//   - A service built from the repository's own code is a server (a worker or gateway by
//     its name), with its language's technology when its folder says which.
//   - Anything else (ClickHouse, Kong...) is a custom component that acts like the closest
//     modeled kind, so it is measured too.
//   - Operations tools (monitoring, tracing, service discovery, config, admin consoles) are
//     placed and costed but not wired into user traffic.
//   - Users reach the services that publish ports, through a gateway or proxy when there is
//     one; services found only through service discovery are routed from that gateway.
//   - Libraries that use a database or cache the compose file does not run (a managed
//     database, say) still add that component, wired to the services whose code uses it.

export type ComposeService = {
  name: string;
  file: string;
  image?: string;
  // The folder its code is built from ("" for the repository root), when it is built here.
  buildContext?: string;
  // Its Dockerfile's path from the repository root, when the compose file names one.
  dockerfile?: string;
  dependsOn: string[];
  environment: string[];
  publishesPorts: boolean;
  profiles: string[];
};

const isComposeFile = (path: string) => COMPOSE_NAME.test(path.split("/").pop() ?? path);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function keysOrList(value: unknown): string[] {
  if (Array.isArray(value)) return strings(value);
  if (isRecord(value)) return Object.keys(value);
  return [];
}

function environmentValues(value: unknown): string[] {
  if (Array.isArray(value)) return strings(value).map((entry) => entry.slice(entry.indexOf("=") + 1));
  if (isRecord(value)) return Object.values(value).filter((item) => typeof item === "string" || typeof item === "number").map(String);
  return [];
}

// "./vote" -> "vote", "." -> "", "../x" -> undefined (outside the repository).
function contextFolder(build: unknown, composeFolder: string): string | undefined {
  const raw = typeof build === "string" ? build : isRecord(build) && typeof build.context === "string" ? build.context : undefined;
  if (raw === undefined) return undefined;
  if (/^[a-z]+:\/\//i.test(raw) || raw.startsWith("git@")) return undefined;
  const parts = [...(composeFolder ? composeFolder.split("/") : []), ...raw.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return undefined;
      resolved.pop();
    } else resolved.push(part);
  }
  return resolved.join("/");
}

// Every service in the repository's compose files (root files first; a name seen twice keeps
// the first). Files that are not valid YAML are skipped.
export function readComposeServices(files: ReadonlyMap<string, string>): ComposeService[] {
  const paths = [...files.keys()].filter(isComposeFile).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const services = new Map<string, ComposeService>();
  for (const path of paths) {
    let parsed: unknown;
    try {
      const document = parseDocument(files.get(path) as string, { merge: true });
      if (document.errors.length > 0) continue;
      parsed = document.toJS({ maxAliasCount: 10_000 });
    } catch {
      continue;
    }
    if (!isRecord(parsed) || !isRecord(parsed.services)) continue;
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    // Variables the compose file uses, from the .env file next to it.
    const env = parseDotEnv(files.get(folder ? `${folder}/.env` : ".env"));
    const fill = (value: string) => interpolate(value, env);
    for (const [name, raw] of Object.entries(parsed.services)) {
      if (services.has(name) || !isRecord(raw)) continue;
      const build = typeof raw.build === "string" ? fill(raw.build) : isRecord(raw.build) ? { ...raw.build, ...(typeof raw.build.context === "string" ? { context: fill(raw.build.context) } : {}) } : raw.build;
      const buildContext = contextFolder(build, folder);
      const dockerfileRaw = isRecord(raw.build) && typeof raw.build.dockerfile === "string" ? fill(raw.build.dockerfile) : undefined;
      const dockerfile = buildContext !== undefined && dockerfileRaw && !dockerfileRaw.includes("$") ? normalizePath(dockerfileRaw, buildContext) : undefined;
      services.set(name, {
        name,
        file: path,
        ...(typeof raw.image === "string" ? { image: fill(raw.image) } : {}),
        ...(buildContext === undefined ? {} : { buildContext }),
        ...(dockerfile ? { dockerfile } : {}),
        dependsOn: [...keysOrList(raw.depends_on), ...strings(raw.links).map((link) => link.split(":")[0]!)],
        environment: environmentValues(raw.environment).map(fill),
        publishesPorts: Array.isArray(raw.ports) && raw.ports.length > 0,
        profiles: strings(raw.profiles),
      });
    }
  }
  return [...services.values()];
}

// ---- Naming ----

// "${SNUBA_IMAGE}" or "$SNUBA_IMAGE" -> "SNUBA_IMAGE"; "${X:-redis:7}" -> "redis:7".
function resolveImage(image: string): { image: string; variable?: string } {
  const withDefault = /^\$\{[A-Za-z_][A-Za-z0-9_]*:?-([^}]+)\}$/.exec(image);
  if (withDefault) return { image: withDefault[1]! };
  const variable = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(image);
  if (variable) return { image: "", variable: variable[1]! };
  return { image };
}

// The image's own name: "docker.io/library/postgres:15-alpine" -> "postgres".
const imageName = (image: string) => (image.split("@")[0]!.replace(/:[^/]*$/, "").split("/").pop() ?? "").toLowerCase();

// "SNUBA_IMAGE" -> "Snuba".
const variableName = (variable: string) => titleCase(variable.replace(/_?IMAGE$/i, "").toLowerCase()) || "Service";

const ONE_SHOT = /(^|[-_])(init|migrate|migrations|setup|seed|bootstrap|createdb|create-buckets|wait|test|tests)([-_]|$)/;

// ---- Classifying services ----

type Kind = "app" | "data" | "ops" | "proxy";

export type Placed = {
  id: string;
  service: string;
  type: ArchitectureNodeType;
  implementation?: string;
  label: string;
  properties?: NodeProperties;
  kind: Kind;
  evidence: string[];
  publishesPorts: boolean;
  folder?: string;
  // Built from the repository's own code (rather than a published image).
  own?: true;
  // Services that run as this one component (repeated workers).
  members: string[];
};

const DATA_TYPES = new Set<ArchitectureNodeType>(["database", "cache", "queue", "search", "object-storage", "auth"]);
const PROXY_TYPES = new Set<ArchitectureNodeType>(["load-balancer", "api-gateway"]);

// The effective type of a component: a custom one counts as what it acts like.
const roleOfPlaced = (item: { type: ArchitectureNodeType; properties?: NodeProperties }): ArchitectureNodeType =>
  item.type === "custom" && typeof item.properties?.actsAs === "string" ? (item.properties.actsAs as ArchitectureNodeType) : item.type;

function kindOf(type: ArchitectureNodeType): Kind {
  if (PROXY_TYPES.has(type)) return "proxy";
  if (DATA_TYPES.has(type)) return "data";
  return "app";
}

// The folder holding a service's code: its build context, or a top-level folder named after
// it (e.g. image "acme/spring-petclinic-vets-service" -> folder spring-petclinic-vets-service).
function codeFolder(service: ComposeService, image: string, folders: readonly string[]): string | undefined {
  // A Dockerfile in its own folder (context ".", dockerfile "src/ad/Dockerfile"): the code is there.
  if (service.dockerfile?.includes("/")) return service.dockerfile.slice(0, service.dockerfile.lastIndexOf("/"));
  if (service.buildContext !== undefined) return service.buildContext;
  const name = squash(service.name);
  const last = squash(imageName(image));
  return folders.find((folder) => {
    const key = squash(folder);
    return (last.length >= 3 && key === last) || (name.length >= 4 && key.endsWith(name));
  });
}

function filesUnder(files: ReadonlyMap<string, string>, folder: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const [path, text] of files) {
    const inFolder = folder === "" ? !path.includes("/") || path.startsWith("prisma/") : path.startsWith(`${folder}/`);
    if (inFolder) result.set(path, text);
  }
  return result;
}

// The server technology a Dockerfile's base images point to, if any.
const DOCKERFILE_BASES: [RegExp, string][] = [
  [/^(?:\S+\/)?golang(?::|$)/, "go-service"],
  [/^(?:\S+\/)?(?:node|bun)(?::|$)|^oven\/bun/, "nodejs-express"],
  [/^(?:\S+\/)?python(?::|$)/, "python-fastapi"],
  [/^(?:\S+\/)?(?:openjdk|eclipse-temurin|amazoncorretto|maven|gradle|ibmjava)(?::|$)/, "java-spring-boot"],
  [/^mcr\.microsoft\.com\/dotnet\//, "dotnet-aspnet-core"],
  [/^(?:\S+\/)?(?:rust)(?::|$)/, "rust-axum"],
];
function dockerfileBases(folderFiles: ReadonlyMap<string, string>): string[] {
  const text = [...folderFiles].find(([path]) => /(^|\/)Dockerfile$/.test(path))?.[1];
  return text ? [...text.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/gim)].map((match) => match[1]!.toLowerCase()) : [];
}
function serverFromDockerfile(folderFiles: ReadonlyMap<string, string>): string | undefined {
  for (const base of dockerfileBases(folderFiles)) {
    const found = DOCKERFILE_BASES.find(([pattern]) => pattern.test(base));
    if (found) return found[1];
  }
  return undefined;
}
// A background worker in a language: its worker technology.
const WORKER_FOR: Record<string, string> = {
  "go-service": "go-worker", "go-gin": "go-worker", "go-fiber": "go-worker", "go-echo": "go-worker",
  "dotnet-aspnet-core": "dotnet-worker", "java-spring-boot": "java-worker", "java-quarkus": "java-worker",
  "nodejs-express": "nodejs-worker", "nodejs-fastify": "nodejs-worker", "nodejs-nestjs": "nodejs-worker",
  "python-fastapi": "python-celery", "python-django": "python-celery", "python-flask": "python-celery",
  "rust-axum": "rust-worker", "rust-actix": "rust-worker", "ruby-on-rails": "ruby-sidekiq", "php-laravel": "php-laravel-queue",
};

// A service built FROM nginx, envoy, postgres... is that component with its own configuration
// (Robot Shop's web front is NGINX; the OpenTelemetry demo's frontend proxy is Envoy).
const INFRASTRUCTURE = new Set<ArchitectureNodeType>(["load-balancer", "api-gateway", "database", "cache", "queue", "search", "object-storage"]);
function infrastructureFromDockerfile(folderFiles: ReadonlyMap<string, string>) {
  // The last stage is what runs.
  for (const base of dockerfileBases(folderFiles).reverse()) {
    const modeled = modeledImage(base);
    if (modeled && INFRASTRUCTURE.has(modeled.type)) return modeled;
  }
  return null;
}

type OwnCode =
  | { type: ArchitectureNodeType; implementation?: string; properties?: undefined }
  | { type: "custom"; implementation?: undefined; properties: NodeProperties };

// A service built from the repository's own code: what it is and which technology runs it.
// When the app has no technology for it (a .NET worker, a Spring Cloud gateway), it is a custom
// component named after its language, acting like what it is, so it is still measured.
function ownCode(name: string, hint: string, folderFiles: ReadonlyMap<string, string>): OwnCode {
  const infrastructure = infrastructureFromDockerfile(folderFiles);
  if (infrastructure) return { type: infrastructure.type, ...(infrastructure.implementation ? { implementation: infrastructure.implementation } : {}) };
  const detected = detectStack(folderFiles);
  const pick = (type: ArchitectureNodeType) => detected.find((component) => component.type === type);
  const lower = name.toLowerCase();
  const server = pick("server");
  // No framework found: the Dockerfile's base image says the language (FROM golang -> Go).
  const fromDockerfile = server ? undefined : serverFromDockerfile(folderFiles);
  const serverImplementation = server?.implementation ?? fromDockerfile;
  const language = serverImplementation
    ? resolveImplementation("server", serverImplementation).name
    : detectUnmodeled(folderFiles)
        // Its language, not images its own compose file runs.
        .find((technology) => !technology.evidence.some((line) => line.includes(" runs the ")))
        ?.name.replace(/ \(.*\)$/, "").replace(/ (service|app)$/, "");
  const custom = (technology: string, actsAs: ActsAsType): OwnCode => ({ type: "custom", properties: { technology: technology.slice(0, 60), actsAs } });
  // Its own code may use a gateway or worker library the catalog knows (Spring Cloud Gateway, Celery).
  const gateway = pick("api-gateway");
  if (gateway && /gateway|edge|proxy/.test(lower)) return { type: "api-gateway", ...(gateway.implementation ? { implementation: gateway.implementation } : {}) };
  if (/gateway/.test(lower)) return custom(titleCase(name), "api-gateway");
  if (guessActsAs(lower) === "worker") {
    const worker = pick("worker");
    if (worker?.implementation) return { type: "worker", implementation: worker.implementation };
    // The language's worker technology, from the server framework or Dockerfile found.
    const asWorker = serverImplementation ? WORKER_FOR[serverImplementation] : undefined;
    if (asWorker) return { type: "worker", implementation: asWorker };
    if (server?.implementation === "nodejs-express" || folderFiles.has([...folderFiles.keys()].find((path) => path.endsWith("package.json")) ?? "-")) {
      return { type: "worker", implementation: "nodejs-worker" };
    }
    return custom(`${language ?? hint} worker`, "worker");
  }
  const web = pick("web-app");
  if (web && !server) return { type: "web-app", ...(web.implementation ? { implementation: web.implementation } : {}) };
  if (server) return { type: "server", ...(server.implementation ? { implementation: server.implementation } : {}) };
  if (fromDockerfile) return { type: "server", implementation: fromDockerfile };
  // Unknown language (e.g. a Dockerfile that only extends a published image): named by the
  // project's own name for it, acting like what that name suggests (ClickHouse: a database).
  return language ? custom(language, "server") : custom(hint, guessActsAs(`${name} ${hint}`));
}

// Where a service's container comes from, kept on the component so exporting it again writes
// the same image or build folder.
function origin(service: ComposeService): NodeProperties {
  const properties: NodeProperties = {};
  if (service.image && service.image.length <= 200) properties.image = service.image;
  if (service.buildContext !== undefined && service.buildContext.length <= 200) properties.build = service.buildContext;
  return properties;
}

export function classify(service: ComposeService, files: ReadonlyMap<string, string>, folders: readonly string[]): Omit<Placed, "id" | "members"> {
  const item = classifyComponent(service, files, folders);
  const source = origin(service);
  return Object.keys(source).length > 0 ? { ...item, properties: { ...item.properties, ...source } } : item;
}

function classifyComponent(service: ComposeService, files: ReadonlyMap<string, string>, folders: readonly string[]): Omit<Placed, "id" | "members"> {
  const { image, variable } = resolveImage(service.image ?? "");
  const last = imageName(image);
  // The image says what runs; a service built here and named after a known technology (a
  // "clickhouse" service built from ./clickhouse) is that technology with local config.
  const builtName = service.buildContext !== undefined ? (service.buildContext.split("/").pop() ?? "").toLowerCase() : "";
  const modeled =
    (image ? modeledImage(image) : null) ??
    (service.buildContext !== undefined ? (modeledImage(service.name.toLowerCase()) ?? (builtName ? modeledImage(builtName) : null)) : null);
  const base = { service: service.name, publishesPorts: service.publishesPorts };
  const evidence = [
    service.image ? `${service.file}: service "${service.name}" runs the "${service.image}" image` : `${service.file}: service "${service.name}" is built from ${service.buildContext ? `./${service.buildContext}` : "the repository root"}`,
  ];

  if (modeled) {
    return { ...base, type: modeled.type, ...(modeled.implementation ? { implementation: modeled.implementation } : {}), label: modeled.label, kind: kindOf(modeled.type), evidence };
  }

  // An image named after the service (e.g. "acme/shop-config-server" for "config-server") is
  // better named by the service.
  const ownImage = last !== "" && squash(service.name).length >= 4 && squash(last).endsWith(squash(service.name));
  const technology = (variable ? variableName(variable) : KNOWN_NAMES[last]) ?? titleCase(ownImage || !last ? service.name : last);
  const nameKey = `${service.name} ${last} ${variable ?? ""}`;
  if (isOperationsTool(nameKey)) {
    // Placed and costed like the server it runs on; not on the request path. Named after the
    // product when it is a known one (Zipkin), otherwise after the service.
    const actsAs: ActsAsType = "server";
    const opsFolder = codeFolder(service, image, folders);
    // The product's name (Zipkin), unless the image is the project's own (acme/demo:1.0-load-generator).
    const ownOpsImage = squash(service.name).length >= 4 && squash(image).includes(squash(service.name));
    const opsName = variable || ownOpsImage || !last ? titleCase(service.name) : (KNOWN_NAMES[last] ?? titleCase(last));
    return {
      ...base,
      type: "custom",
      label: titleCase(service.name).slice(0, 60),
      properties: { technology: opsName.slice(0, 60), actsAs },
      kind: "ops",
      evidence,
      ...(opsFolder === undefined ? {} : { folder: opsFolder }),
    };
  }

  const folder = codeFolder(service, image, folders);
  if (folder !== undefined || BUILD_IMAGES.has(last) || variable) {
    // The repository's own code (built here, named after one of its folders, or an image
    // the project publishes itself).
    const folderName = folder ? folder.split("/").pop()! : "";
    const hint = variable ? variableName(variable) : folderName ? (KNOWN_NAMES[folderName.toLowerCase()] ?? titleCase(folderName)) : titleCase(service.name);
    const what = ownCode(service.name, hint, folder === undefined ? new Map() : filesUnder(files, folder));
    return {
      ...base,
      type: what.type,
      ...(what.implementation ? { implementation: what.implementation } : {}),
      ...(what.properties ? { properties: what.properties } : {}),
      label: titleCase(service.name).slice(0, 60),
      kind: kindOf(roleOfPlaced(what)),
      evidence,
      own: true,
      ...(folder === undefined ? {} : { folder }),
    };
  }

  const actsAs = guessActsAs(`${service.name} ${last}`);
  return { ...base, type: "custom", label: technology.slice(0, 60), properties: { technology, actsAs }, kind: kindOf(actsAs), evidence };
}

// ---- The design ----

export type ComposeDesign = {
  graph: GraphDocument;
  detected: { nodeId: string; label: string; type: ArchitectureNodeType; implementation?: string; evidence: string[] }[];
  customTechnologies: CustomTechnology[];
};

// How many services sharing one image (e.g. a project's many queue consumers) become a
// single component with that many instances.
const GROUP_AT = 3;

// `requireOwnCode` (default true, for repositories): null when no service runs the project's
// own code. False for a compose file given on its own, where infrastructure is the point.
// One compose file, with the .env file next to it that fills in its variables.
function withEnv(files: ReadonlyMap<string, string>, path: string): Map<string, string> {
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const envPath = folder ? `${folder}/.env` : ".env";
  return new Map([[path, files.get(path) as string], ...(files.has(envPath) ? [[envPath, files.get(envPath) as string] as [string, string]] : [])]);
}

// Compose files for CI, tests or examples are not the system.
const NOT_THE_SYSTEM = /(^|[.-])(ci|test|tests|e2e|debug|override|sample|example|examples)([.-]|$)/i;
const runningCount = (services: readonly ComposeService[]) =>
  services.filter((service) => service.profiles.length === 0 && !ONE_SHOT.test(service.name.toLowerCase())).length;

// The one compose file that describes the system. Projects often keep variants
// (docker-compose.postgres.yml, docker-compose.mariadb.yml): the one running the most services
// wins (Kutt's main file runs only the app on SQLite; its Postgres variant adds the database
// and Redis); ties go to a production file, then the main file, then PostgreSQL's (ARCHITECH's
// default database), then the name.
export function chooseComposeFile(files: ReadonlyMap<string, string>): string | null {
  const paths = [...files.keys()].filter(isComposeFile);
  const shallowest = Math.min(...paths.map((path) => path.split("/").length));
  const candidates = paths.filter((path) => path.split("/").length === shallowest);
  const usable = candidates.filter((path) => !NOT_THE_SYSTEM.test((path.split("/").pop() ?? path).replace(/\.ya?ml$/, "")));
  const scored = (usable.length > 0 ? usable : candidates).map((path) => {
    const name = (path.split("/").pop() ?? path).toLowerCase();
    return {
      path,
      count: runningCount(readComposeServices(withEnv(files, path))),
      prod: /prod/.test(name) ? 1 : 0,
      main: /^(docker-)?compose\.ya?ml$/.test(name) ? 1 : 0,
      postgres: /postgres/.test(name) ? 1 : 0,
    };
  });
  scored.sort((a, b) => b.count - a.count || b.prod - a.prod || b.main - a.main || b.postgres - a.postgres || a.path.localeCompare(b.path));
  return scored[0] && scored[0].count > 0 ? scored[0].path : null;
}

export function composeDesign(
  files: ReadonlyMap<string, string>,
  folders: readonly string[] = [],
  { requireOwnCode = true }: { requireOwnCode?: boolean } = {},
): ComposeDesign | null {
  const chosen = chooseComposeFile(files);
  if (!chosen) return null;
  const all = readComposeServices(withEnv(files, chosen));
  // Optional profiles (seed data, debugging tools) and one-shot jobs are not the running system.
  const running = all.filter((service) => service.profiles.length === 0 && !ONE_SHOT.test(service.name.toLowerCase()));
  if (running.length === 0) return null;
  const serviceNames = new Set(running.map((service) => service.name));

  // Classify, then group repeated workers that run the same image.
  const classified = running.map((service) => ({ service, item: classify(service, files, folders) }));
  // A compose file that only starts databases and tools for local development (the app runs
  // outside it) does not describe the system: the libraries the code uses do better.
  if (requireOwnCode && !classified.some(({ item }) => item.own)) return null;
  const groups = new Map<string, typeof classified>();
  for (const entry of classified) {
    const key = roleOfPlaced(entry.item) === "worker" && entry.service.image ? `worker:${entry.service.image}` : `one:${entry.service.name}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const placed: Placed[] = [];
  const nodeOfService = new Map<string, Placed>();
  const usedIds = new Set<string>(["client"]);
  const uniqueId = (base: string) => {
    let id = slug(base);
    for (let n = 2; usedIds.has(id); n++) id = `${slug(base)}-${n}`;
    usedIds.add(id);
    return id;
  };
  for (const [key, entries] of groups) {
    if (key.startsWith("worker:") && entries.length >= GROUP_AT) {
      const first = entries[0]!.item;
      const { image, variable } = resolveImage(entries[0]!.service.image ?? "");
      const technology = first.properties?.technology;
      const name =
        typeof technology === "string" ? technology.replace(/ worker$/, "") : variable ? variableName(variable) : titleCase(imageName(image));
      const item: Placed = {
        ...first,
        id: uniqueId(`${name}-workers`),
        label: `${name} workers`.slice(0, 60),
        properties: { ...first.properties, replicas: entries.length },
        evidence: [`${first.evidence[0]!.split(":")[0]}: ${entries.length} services run this image as workers (${entries.map((e) => e.service.name).slice(0, 6).join(", ")}${entries.length > 6 ? ", ..." : ""})`],
        publishesPorts: entries.some((entry) => entry.item.publishesPorts),
        members: entries.map((entry) => entry.service.name),
      };
      placed.push(item);
      for (const entry of entries) nodeOfService.set(entry.service.name, item);
    } else {
      for (const entry of entries) {
        const item: Placed = { ...entry.item, id: uniqueId(entry.service.name), members: [entry.service.name] };
        placed.push(item);
        nodeOfService.set(entry.service.name, item);
      }
    }
  }

  // ---- Alternatives: one of each is placed ----
  const mergeInto = (keep: Placed, drop: readonly Placed[], note: string) => {
    for (const item of drop) {
      placed.splice(placed.indexOf(item), 1);
      for (const member of item.members) nodeOfService.set(member, keep);
      keep.members = [...keep.members, ...item.members];
    }
    keep.publishesPorts ||= drop.some((item) => item.publishesPorts);
    keep.evidence = [...keep.evidence, note];
  };
  const dependedOn = (item: Placed) => running.some((service) => !item.members.includes(service.name) && service.dependsOn.some((name) => item.members.includes(name)));
  // Several relational databases (a test matrix of PostgreSQL, MySQL, MariaDB, SQL Server):
  // the app uses one of them.
  const relational = placed.filter((item) => isRelational(item.type, item.implementation));
  if (new Set(relational.map((item) => item.implementation ?? "postgresql")).size > 1) {
    const keep = [...relational].sort((a, b) => relationalRank(a.implementation) - relationalRank(b.implementation))[0]!;
    const drop = relational.filter((item) => (item.implementation ?? "postgresql") !== (keep.implementation ?? "postgresql"));
    mergeInto(keep, drop, `${chosen}: also sets up ${[...new Set(drop.map((item) => item.label))].join(", ")} as alternatives; one database is placed`);
  }
  // Several servers built from the same code (Shlink runs its PHP app three ways): one app.
  const byFolder = new Map<string, Placed[]>();
  for (const item of placed) {
    if (item.own && item.folder !== undefined && roleOfPlaced(item) === "server") byFolder.set(item.folder, [...(byFolder.get(item.folder) ?? []), item]);
  }
  for (const [, items] of byFolder) {
    if (items.length < 2) continue;
    const keep = items.find(dependedOn) ?? items[0]!;
    const drop = items.filter((item) => item !== keep);
    mergeInto(keep, drop, `${chosen}: ${drop.flatMap((item) => item.members).join(", ")} run the same code another way (alternatives of ${keep.members[0]})`);
  }

  // ---- Connections ----
  const edges: { source: string; target: string }[] = [];
  const connect = (source: Placed | { id: string }, target: Placed | { id: string }) => {
    if (source.id === target.id || edges.some((edge) => edge.source === source.id && edge.target === target.id)) return;
    edges.push({ source: source.id, target: target.id });
  };
  const mentions = (value: string, name: string) =>
    new RegExp(`(^|[^A-Za-z0-9_.-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([:/]|$)`).test(value);

  for (const { service } of classified) {
    const from = nodeOfService.get(service.name)!;
    const targets = new Set(service.dependsOn.filter((name) => serviceNames.has(name)));
    for (const name of serviceNames) {
      if (name !== service.name && service.environment.some((value) => mentions(value, name))) targets.add(name);
    }
    for (const name of targets) {
      const to = nodeOfService.get(name)!;
      if (from === to || from.kind === "ops" || to.kind === "ops") continue;
      const fromRole = roleOfPlaced(from);
      const toRole = roleOfPlaced(to);
      if (toRole === "queue" && fromRole === "worker") connect(to, from); // the queue feeds the worker
      else if (from.kind === "data" && to.kind !== "data") continue; // a store does not call services
      else connect(from, to);
    }
  }

  // Databases and caches the code uses that compose does not run (managed services).
  const appNodes = placed.filter((item) => item.kind === "app" || item.kind === "proxy");
  const extra: Placed[] = [];
  for (const component of detectStack(files)) {
    if (!DATA_TYPES.has(component.type)) continue;
    // One relational database: the code's other drivers are alternatives.
    if (isRelational(component.type, component.implementation) && placed.some((item) => isRelational(item.type, item.implementation))) continue;
    // Only a test or operations tool uses it (a load generator's libraries): not the system's.
    const owners = placed.filter((item) => item.folder !== undefined && item.folder !== "" && component.evidence.some((line) => line.startsWith(`${item.folder}/`)));
    if (owners.length > 0 && owners.every((owner) => owner.kind === "ops")) continue;
    const present = placed.some(
      (item) => roleOfPlaced(item) === component.type && (component.implementation === undefined || item.implementation === undefined || item.implementation === component.implementation),
    );
    if (present) continue;
    const item: Placed = {
      id: uniqueId(component.label),
      service: component.label,
      type: component.type,
      ...(component.implementation ? { implementation: component.implementation } : {}),
      label: component.label,
      kind: "data",
      evidence: component.evidence,
      publishesPorts: false,
      members: [],
    };
    extra.push(item);
    const users = appNodes.filter((app) => app.folder !== undefined && component.evidence.some((line) => (app.folder === "" ? !line.split(" ")[0]!.includes("/") : line.startsWith(`${app.folder}/`))));
    const servers = appNodes.filter((app) => app.kind === "app" && roleOfPlaced(app) !== "web-app");
    for (const user of users.length > 0 ? users : servers) connect(user, item);
  }
  placed.push(...extra);

  // Where users come in: services that publish ports, through a gateway or proxy if any does.
  const client = { id: "client" };
  const published = placed.filter((item) => item.publishesPorts && (item.kind === "app" || item.kind === "proxy"));
  const proxies = published.filter((item) => item.kind === "proxy");
  const webApps = published.filter((item) => roleOfPlaced(item) === "web-app");
  const incoming = (item: Placed) => edges.some((edge) => edge.target === item.id);
  let entry = proxies.length > 0 ? proxies : webApps.length > 0 ? webApps : published;
  if (entry.length === 0) entry = placed.filter((item) => (item.kind === "app" || item.kind === "proxy") && roleOfPlaced(item) !== "worker" && !incoming(item));
  for (const item of entry) connect(client, item);
  // Services nothing calls directly are usually found through service discovery and reached
  // through the gateway.
  if (proxies.length > 0) {
    for (const item of placed) {
      if (item.kind !== "app" || roleOfPlaced(item) === "worker" || incoming(item) || entry.includes(item)) continue;
      // A service that only talks to a queue consumes it (Robot Shop's dispatch): the queue feeds it.
      const queues = edges.filter((edge) => edge.source === item.id).map((edge) => placed.find((other) => other.id === edge.target)).filter((other) => other && roleOfPlaced(other) === "queue");
      if (queues.length > 0) {
        for (const queue of queues) {
          edges.splice(edges.findIndex((edge) => edge.source === item.id && edge.target === queue!.id), 1);
          connect(queue!, item);
        }
        continue;
      }
      connect(proxies[0]!, item);
    }
  }

  // ---- Layout: request order left to right; operations tools in a row underneath ----
  const columns = new Map<number, Placed[]>();
  const ops = placed.filter((item) => item.kind === "ops");
  for (const item of placed) {
    if (item.kind === "ops") continue;
    const column = COLUMN_OF[roleOfPlaced(item)] ?? 4;
    columns.set(column, [...(columns.get(column) ?? []), item]);
  }
  const tallest = Math.max(1, ...[...columns.values()].map((members) => members.length));
  const position = new Map<string, { x: number; y: number }>([["client", { x: 0, y: ((tallest - 1) * ROW_HEIGHT) / 2 }]]);
  for (const [column, members] of columns) {
    const offset = ((tallest - members.length) * ROW_HEIGHT) / 2;
    members.forEach((member, row) => position.set(member.id, { x: column * COLUMN_WIDTH, y: offset + row * ROW_HEIGHT }));
  }
  ops.forEach((item, index) => position.set(item.id, { x: (1 + index) * COLUMN_WIDTH * 0.8, y: tallest * ROW_HEIGHT + ROW_HEIGHT }));

  const graph: GraphDocument = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: [
      { id: "client", type: "architecture", position: position.get("client")!, data: { type: "client", label: "Users" } },
      ...placed.map((item) => ({
        id: item.id,
        type: "architecture" as const,
        position: position.get(item.id)!,
        data: {
          type: item.type,
          label: item.label,
          ...(item.implementation ? { implementation: item.implementation } : {}),
          ...(item.properties ? { properties: item.properties } : {}),
        },
      })),
    ],
    edges: edges.map((edge) => ({ id: `${edge.source}->${edge.target}`, ...edge })),
  };

  // The custom technologies placed, also offered in the sidebar to drag in again.
  const sidebar = new Map<string, CustomTechnology>();
  for (const item of placed) {
    const technology = item.properties?.technology;
    if (item.type !== "custom" || typeof technology !== "string") continue;
    const id = slug(technology);
    if (sidebar.has(id)) continue;
    sidebar.set(id, { id, name: technology.slice(0, 60), evidence: item.evidence.slice(0, 5).map((line) => line.slice(0, 200)), ...(typeof item.properties?.actsAs === "string" ? { actsAs: item.properties.actsAs as ActsAsType } : {}) });
  }

  return {
    graph,
    detected: placed.map((item) => ({ nodeId: item.id, label: item.label, type: item.type, ...(item.implementation ? { implementation: item.implementation } : {}), evidence: item.evidence })),
    customTechnologies: [...sidebar.values()].slice(0, 30),
  };
}

export type { DetectedComponent };
