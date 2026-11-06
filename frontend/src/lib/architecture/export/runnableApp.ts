import { resolveImplementation } from "../componentLibrary.ts";
import { measuredNode } from "../customComponents.ts";
import { configureNode } from "../evaluation/capabilities.ts";
import type { ArchitectureNodeType } from "../types.ts";

// Turns a design into a runnable app: a docker-compose project in which every part of the
// request path (client page, CDN, DNS, load balancer, gateway, auth, API servers) is a real
// container in the order the design connects them, and the data parts behind the API (database,
// cache, queue and worker, search, object storage) give the app its features. The app itself is
// generic (export-templates/runnable-app): accounts if the design has auth, items saved in the
// database, cached lists, background processing, search and file attachments, with a "How it
// works" panel that lights up the design's own components for every request.
//
// Pure: the design and the template files in, the project's files out.

type Node = {
  id: string;
  position?: { x: number; y: number };
  data: { type: ArchitectureNodeType; label?: string; implementation?: string; properties?: Record<string, unknown> };
};
type Edge = { source: string; target: string };
export type Design = { title: string; nodes: readonly Node[]; edges: readonly Edge[] };

export const MAX_API_REPLICAS = 4;
// Each app gets its own private network range, picked from the design, so several generated
// apps can run side by side (Docker refuses two networks with the same range). 10.100-249.x.0/24
// stays clear of Docker's own 172.17+ ranges and of common home and VPN networks.
export function subnetFor(design: Design): string {
  let hash = 0x811c9dc5;
  for (const char of `${design.title}|${design.nodes.map((node) => node.id).sort().join(",")}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `10.${100 + (hash % 150)}.${(hash >>> 8) % 256}`;
}
const DNS_ZONE = "app.internal";
const IMAGES = {
  nginx: "nginx:1.27-alpine",
  coredns: "coredns/coredns:1.11.3",
  postgres: "postgres:16-alpine",
  redis: "redis:7-alpine",
  meilisearch: "getmeili/meilisearch:v1.10",
  minio: "minio/minio:RELEASE.2024-10-13T13-34-11Z",
  mc: "minio/mc:RELEASE.2024-10-08T09-37-26Z",
};

// What actually runs for each technology: the closest free container, said plainly when it is a
// stand-in.
const RUNS_AS: Partial<Record<ArchitectureNodeType, string>> = {
  database: "PostgreSQL",
  cache: "Redis",
  queue: "Redis (list)",
  search: "Meilisearch",
  "object-storage": "MinIO (S3-compatible)",
  "load-balancer": "NGINX",
  "api-gateway": "NGINX",
  cdn: "NGINX (caching proxy)",
  dns: "CoreDNS",
  auth: "Node.js auth service",
  server: "Node.js API server",
  worker: "Node.js worker",
  "web-app": "NGINX serving the page",
};

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "part";

export type HopKind = "proxy" | "dns" | "auth" | "pass" | "server";
export type PathHop = {
  node: string;
  label: string;
  kind: HopKind;
  container?: string;
  does?: string;
  // DNS: the name looked up, and the container that looked it up.
  name?: string;
  resolvedBy?: string;
  cdn?: boolean;
  static?: boolean;
};
export type RunnablePlan = {
  title: string;
  path: PathHop[];
  server: { node: string; label: string; containers: string[] };
  data: {
    database: { node: string; label: string } | null;
    cache: { node: string; label: string } | null;
    queue: { node: string; label: string } | null;
    worker: { node: string; label: string } | null;
    search: { node: string; label: string } | null;
    storage: { node: string; label: string } | null;
  };
  auth: { mode: "on-path" | "service" | "in-api" | "none"; node: string | null; database: string | null };
  notes: string[];
};

// ---- Planning ----

export function planRunnableApp(design: Design): RunnablePlan {
  const nodes = new Map(design.nodes.map((node) => [node.id, node]));
  const roleOf = (id: string): ArchitectureNodeType => measuredNode(nodes.get(id) as never).data.type;
  const labelOf = (id: string) => nodes.get(id)?.data.label?.trim() || roleOf(id);
  const out = (id: string) => design.edges.filter((edge) => edge.source === id && nodes.has(edge.target)).map((edge) => edge.target);
  const notes: string[] = [];

  // The request path: the shortest route from the client (or the web app) to an API server.
  const starts = design.nodes.filter((node) => roleOf(node.id) === "client").map((node) => node.id);
  if (starts.length === 0) starts.push(...design.nodes.filter((node) => roleOf(node.id) === "web-app").map((node) => node.id));
  let route: string[] | null = null;
  const queue: string[][] = starts.map((id) => [id]);
  const seen = new Set(starts);
  while (queue.length > 0 && !route) {
    const current = queue.shift()!;
    const last = current.at(-1)!;
    if (roleOf(last) === "server" && current.length > 0) {
      route = current;
      break;
    }
    // Prefer the web app when there is a choice (the app is a web page).
    const next = out(last).sort((a, b) => Number(roleOf(b) === "web-app") - Number(roleOf(a) === "web-app"));
    for (const id of next) {
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push([...current, id]);
    }
  }
  const anyServer = design.nodes.find((node) => roleOf(node.id) === "server")?.id;
  if (!route) {
    route = [...(starts[0] ? [starts[0]] : []), ...(anyServer ? [anyServer] : [])];
    notes.push(
      anyServer
        ? "The client is not connected to an API server in the design, so the page talks to it directly."
        : "The design has no API server, so one is added to run the app's features.",
    );
  }
  const serverNode = route.find((id) => roleOf(id) === "server") ?? "__api";

  // Containers on the path, with their names and roles.
  const path: PathHop[] = [];
  const browser = route[0] && roleOf(route[0]) === "client" ? route[0] : "__browser";
  path.push({ node: browser, label: browser === "__browser" ? "Your browser" : labelOf(browser), kind: "pass", does: "Your browser" });
  const used = new Set<string>();
  const containerName = (base: string) => {
    let name = slug(base);
    for (let n = 2; used.has(name) || name === "dns-server" || name === "db"; n++) name = `${slug(base)}-${n}`;
    used.add(name);
    return name;
  };
  const middle = route.slice(route[0] === browser ? 1 : 0).filter((id) => id !== serverNode);
  // The page has to come from somewhere: without a web app on the path, a web server is added
  // in front, and it does the DNS lookups browsers would do with your computer's DNS.
  const hasWebApp = middle.some((id) => roleOf(id) === "web-app");
  if (!hasWebApp) {
    path.push({ node: "__web", label: "Web page", kind: "proxy", container: containerName("web"), static: true, does: "The web server that serves this page sent the API call on" });
    notes.push("The design has no web app on the request path, so a small web server (\"Web page\") serves the page in front of it.");
  }
  for (const id of middle) {
    const role = roleOf(id);
    const label = labelOf(id);
    if (role === "web-app") path.push({ node: id, label, kind: "proxy", container: containerName(label), static: true, does: "The web app's server sent the API call on" });
    else if (role === "cdn") path.push({ node: id, label, kind: "proxy", container: containerName(label), cdn: true, does: "The CDN passed the API call through (it caches pages, not your data)" });
    else if (role === "load-balancer") path.push({ node: id, label, kind: "proxy", container: containerName(label), does: "The load balancer picked the next server, taking turns" });
    else if (role === "api-gateway") path.push({ node: id, label, kind: "proxy", container: containerName(label), does: "The gateway routed the request" });
    else if (role === "dns") path.push({ node: id, label, kind: "dns" });
    else if (role === "auth") path.push({ node: id, label, kind: "auth", container: containerName(label) });
    else if (role === "api") path.push({ node: id, label, kind: "pass", does: `Requests use ${resolveImplementation("api", nodes.get(id)?.data.implementation).name} style calls (JSON over HTTP here).` });
    else {
      path.push({ node: id, label, kind: "pass", does: "Part of the design, not run as its own container in the app." });
      notes.push(`"${label}" is on the request path but is not run as its own container.`);
    }
  }
  // Consecutive DNS entries: only the last one is looked up.
  const replicas = Math.min(MAX_API_REPLICAS, Math.max(1, anyServer || serverNode !== "__api" ? configureNode(nodes.get(serverNode) as never).instances : 1));
  if (serverNode !== "__api" && configureNode(nodes.get(serverNode) as never).instances > MAX_API_REPLICAS) {
    notes.push(`The design runs ${configureNode(nodes.get(serverNode) as never).instances} API servers; the app runs ${MAX_API_REPLICAS} so it fits on a laptop.`);
  }
  const serverLabel = serverNode === "__api" ? "API server" : labelOf(serverNode);
  const serverBase = slug(serverLabel) === "api-server" ? "api" : slug(serverLabel);
  const serverContainers = Array.from({ length: replicas }, (_, index) => {
    const name = `${serverBase}-${index + 1}`;
    used.add(name);
    return name;
  });
  path.push({ node: serverNode, label: serverLabel, kind: "server" });

  // DNS lookups are made by the container before the DNS entry, for the container after it.
  for (let index = 0; index < path.length; index++) {
    const hop = path[index]!;
    if (hop.kind !== "dns") continue;
    const before = [...path.slice(0, index)].reverse().find((candidate) => candidate.container);
    const after = path.slice(index + 1).find((candidate) => candidate.kind !== "dns" && candidate.kind !== "pass");
    hop.resolvedBy = before?.container;
    hop.name = `${after?.kind === "server" ? serverBase : (after?.container ?? "api")}.${DNS_ZONE}`;
  }

  // The data parts behind the API server: what it connects to, through caches and queues.
  const behind = new Set<string>();
  const stack = serverNode === "__api" ? [] : [...out(serverNode)];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (behind.has(id) || id === serverNode) continue;
    const role = roleOf(id);
    if (!["database", "cache", "queue", "search", "object-storage", "auth", "worker"].includes(role)) continue;
    behind.add(id);
    stack.push(...out(id));
  }
  const first = (role: ArchitectureNodeType, pool: Iterable<string> = behind) => [...pool].find((id) => roleOf(id) === role) ?? null;
  const part = (id: string | null) => (id ? { node: id, label: labelOf(id) } : null);
  const database = first("database");
  const queueNode = first("queue");
  const workerNode = queueNode ? (out(queueNode).find((id) => roleOf(id) === "worker") ?? null) : null;
  if (queueNode && !workerNode) notes.push("The design's queue has no worker connected, so processed jobs wait on the queue.");
  if (!database) notes.push("The design's API server has no database, so items live in each API server's memory and are lost when it restarts.");
  const extraDatabases = [...behind].filter((id) => roleOf(id) === "database" && id !== database);
  if (extraDatabases.length > 0) notes.push(`The app uses "${labelOf(database!)}"; ${extraDatabases.map((id) => `"${labelOf(id)}"`).join(", ")} ${extraDatabases.length === 1 ? "is" : "are"} shown but not used.`);

  // Authentication: in front of the API, beside it, inside it (API only) or not at all.
  const onPathAuth = path.find((hop) => hop.kind === "auth")?.node ?? null;
  const sideAuth = first("auth") ?? design.nodes.find((node) => roleOf(node.id) === "auth" && node.id !== onPathAuth)?.id ?? null;
  const authNode = onPathAuth ?? sideAuth;
  const authDatabase = authNode ? (out(authNode).find((id) => roleOf(id) === "database") ?? database) : database;
  const auth: RunnablePlan["auth"] = onPathAuth
    ? { mode: "on-path", node: onPathAuth, database: authDatabase }
    : sideAuth
      ? { mode: "service", node: sideAuth, database: authDatabase }
      : { mode: "none", node: null, database: null };
  if (auth.mode === "none") notes.push("The design has no authentication, so the app has no accounts: everyone shares the same items.");

  return {
    title: design.title.trim() || "My app",
    path,
    server: { node: serverNode, label: serverLabel, containers: serverContainers },
    data: {
      database: part(database),
      cache: part(first("cache")),
      queue: part(queueNode),
      worker: part(workerNode),
      search: part(first("search")),
      storage: part(first("object-storage")),
    },
    auth,
    notes,
  };
}

// ---- Files ----

export type RunnableApp = { plan: RunnablePlan; files: Record<string, string> };

export function runnableAppFiles(design: Design, templates: Readonly<Record<string, string>>): RunnableApp {
  const plan = planRunnableApp(design);
  const SUBNET = subnetFor(design);
  const nodes = new Map(design.nodes.map((node) => [node.id, node]));
  const technology = (id: string | null, role: ArchitectureNodeType) => {
    const node = id ? nodes.get(id) : undefined;
    if (!node) return RUNS_AS[role] ?? role;
    const named =
      node.data.type === "custom" ? String(node.data.properties?.technology ?? "Custom") : resolveImplementation(node.data.type, node.data.implementation).name;
    const runs = RUNS_AS[role];
    return runs && !runs.toLowerCase().startsWith(named.toLowerCase().split(" ")[0]!) ? `${named} (runs as ${runs} here)` : named;
  };

  // Addresses: fixed, so the DNS server can answer for them.
  let next = 10;
  const ips = new Map<string, string>();
  const ipOf = (container: string) => {
    if (!ips.has(container)) ips.set(container, `${SUBNET}.${next++}`);
    return ips.get(container)!;
  };
  const DNS_IP = `${SUBNET}.53`;
  const containers = plan.path.filter((hop) => hop.container).map((hop) => hop.container!);
  for (const name of [...containers, ...plan.server.containers]) ipOf(name);
  const dataContainers: string[] = [];
  const dbContainers = new Map<string, string>();
  for (const id of [plan.data.database?.node, plan.auth.database].filter((id): id is string => Boolean(id))) {
    if (!dbContainers.has(id)) dbContainers.set(id, dbContainers.size === 0 ? "db" : `db-${dbContainers.size + 1}`);
  }
  for (const name of dbContainers.values()) dataContainers.push(name);
  if (plan.data.cache) dataContainers.push("cache");
  if (plan.data.queue) dataContainers.push("queue");
  if (plan.data.worker) dataContainers.push("worker");
  if (plan.data.search) dataContainers.push("search");
  if (plan.data.storage) dataContainers.push("storage");
  if (plan.auth.mode === "service") dataContainers.push("auth");
  for (const name of dataContainers) ipOf(name);
  const usesDns = plan.path.some((hop) => hop.kind === "dns");

  // Where each container on the path sends requests next.
  type Next = { host: string; port: number; label: string; dns?: { server: string; node: string } ; upstream?: string[] };
  const nextOf = new Map<string, Next>();
  plan.path.forEach((hop, index) => {
    if (!hop.container) return;
    let dnsHop: PathHop | undefined;
    for (const candidate of plan.path.slice(index + 1)) {
      if (candidate.kind === "dns") {
        dnsHop = candidate;
        continue;
      }
      if (candidate.kind === "pass") continue;
      const toServers = candidate.kind === "server";
      nextOf.set(hop.container, {
        host: dnsHop ? dnsHop.name! : toServers ? plan.server.containers[0]! : candidate.container!,
        port: toServers ? 3000 : 80,
        label: candidate.label,
        ...(dnsHop ? { dns: { server: DNS_IP, node: dnsHop.node } } : {}),
        ...(toServers && !dnsHop ? { upstream: plan.server.containers } : {}),
      });
      return;
    }
  });

  // ---- app.config.json (read by the services and the page) ----
  const describe = (node: string, role: ArchitectureNodeType) => technology(node.startsWith("__") ? null : node, role);
  const roleOfHop = (hop: PathHop): ArchitectureNodeType =>
    hop.kind === "server" ? "server" : hop.kind === "dns" ? "dns" : hop.kind === "auth" ? "auth" : hop.static ? "web-app" : hop.cdn ? "cdn" : hop.node.startsWith("__") ? "web-app" : (measuredNode(nodes.get(hop.node) as never).data.type);
  type Part = { node: string; label: string; flow: boolean; what: string; sub?: boolean };
  const components: Part[] = [
    ...plan.path.map((hop, index) => ({
      node: hop.node,
      label: hop.label,
      flow: index > 0,
      what:
        hop.kind === "server"
          ? `${describe(hop.node, "server")} · ${plan.server.containers.length} running (${plan.server.containers.join(", ")})`
          : hop.node === "__browser"
            ? "Where you use the app"
            : hop.node === "__web"
              ? "Serves this page (added: the design has no web app)"
              : hop.kind === "pass"
                ? (hop.does ?? "")
                : describe(hop.node, roleOfHop(hop)),
    })),
    ...(
      [
        [plan.data.database, "database"],
        [plan.auth.mode === "service" ? { node: plan.auth.node!, label: nodes.get(plan.auth.node!)?.data.label ?? "Auth" } : null, "auth"],
        [plan.data.cache, "cache"],
        [plan.data.queue, "queue"],
        [plan.data.worker, "worker"],
        [plan.data.search, "search"],
        [plan.data.storage, "object-storage"],
      ] as const
    )
      .filter(([part]) => part)
      .map(([part, role]) => ({ node: part!.node, label: part!.label, flow: false, sub: true, what: describe(part!.node, role) })),
  ];
  if (plan.auth.database && plan.auth.database !== plan.data.database?.node) {
    components.push({ node: plan.auth.database, label: nodes.get(plan.auth.database)?.data.label ?? "Auth database", flow: false, sub: true, what: describe(plan.auth.database, "database") });
  }
  const addresses = Object.fromEntries([...ips].map(([container, ip]) => [ip, container]));
  const config = {
    title: plan.title,
    path: plan.path.map(({ node, label, kind, container, does, name, resolvedBy, cdn }) => ({
      node, label, kind, ...(container ? { container } : {}), ...(does ? { does } : {}), ...(name ? { name } : {}), ...(resolvedBy ? { resolvedBy } : {}), ...(cdn ? { cdn } : {}),
    })),
    server: plan.server,
    data: plan.data,
    auth: plan.auth,
    features: {
      auth: plan.auth.mode !== "none",
      queue: Boolean(plan.data.queue),
      search: Boolean(plan.data.search),
      files: Boolean(plan.data.storage),
    },
    hops: Object.fromEntries(plan.path.filter((hop) => hop.kind === "auth").map((hop) => [hop.container!, { next: nextOf.get(hop.container!) }])),
    components,
    design: drawing(design, plan),
    addresses,
    notes: plan.notes,
  };

  // ---- Proxies (NGINX) ----
  const files: Record<string, string> = {};
  for (const hop of plan.path) {
    if (hop.kind !== "proxy") continue;
    const target = nextOf.get(hop.container!);
    const lines: string[] = [];
    if (hop.cdn) lines.push(`proxy_cache_path /tmp/cdn levels=1:2 keys_zone=pages:10m max_size=100m inactive=10m;`, "");
    if (target?.upstream) {
      lines.push(`upstream api_servers {`, ...target.upstream.map((name) => `    server ${name}:3000;`), `}`, "");
    }
    const pass = target?.dns
      ? [`resolver ${target.dns.server} valid=5s ipv6=off;`, `set $next_part ${target.host};`, `proxy_pass http://$next_part:${target.port};`]
      : target?.upstream
        ? [`proxy_pass http://api_servers;`]
        : target
          ? [`proxy_pass http://${target.host}:${target.port};`]
          : [`return 502;`];
    const forward = [
      ...pass,
      `proxy_set_header Host $host;`,
      `# Where this part sent the request: the page shows it in "How it works".`,
      `add_header X-Trace-${hop.container} $upstream_addr always;`,
    ];
    lines.push(`# ${hop.label} (${hop.static ? "serves the page" : hop.cdn ? "CDN" : "proxy"}), generated by ARCHITECH.`, `server {`, `    listen 80;`, `    client_max_body_size 6m;`, "");
    if (hop.static) {
      lines.push(
        `    root /usr/share/nginx/html;`,
        `    # The design's settings live outside the (read-only) page folder; the page asks for them here.`,
        `    location = /app.config.json {`,
        `        alias /config/app.config.json;`,
        `        add_header Cache-Control no-store;`,
        `    }`,
        `    location / {`,
        `        try_files $uri /index.html;`,
        `    }`,
        `    location /api/ {`,
        ...forward.map((line) => `        ${line}`),
        `    }`,
      );
    } else if (hop.cdn) {
      lines.push(
        `    location /api/ {`,
        ...forward.map((line) => `        ${line}`),
        `    }`,
        `    # Pages and files are cached here for a minute.`,
        `    location / {`,
        `        proxy_cache pages;`,
        `        proxy_cache_valid 200 1m;`,
        `        add_header X-Cache-Status $upstream_cache_status always;`,
        ...forward.map((line) => `        ${line}`),
        `    }`,
      );
    } else {
      lines.push(`    location / {`, ...forward.map((line) => `        ${line}`), `    }`);
    }
    lines.push(`}`, "");
    files[`proxies/${hop.container}.conf`] = lines.join("\n");
  }

  // ---- DNS (CoreDNS) ----
  if (usesDns) {
    const records = new Map<string, string[]>();
    for (const hop of plan.path) {
      if (hop.kind !== "dns" || !hop.name) continue;
      const after = plan.path.slice(plan.path.indexOf(hop) + 1).find((candidate) => candidate.kind !== "dns" && candidate.kind !== "pass");
      const targets = after?.kind === "server" ? plan.server.containers : after?.container ? [after.container] : [];
      records.set(hop.name, targets.map((name) => ipOf(name)));
    }
    files["dns/Corefile"] = [
      `# The design's DNS: answers for the parts of the app, generated by ARCHITECH.`,
      `${DNS_ZONE}:53 {`,
      `    hosts {`,
      ...[...records].flatMap(([name, addresses]) => addresses.map((address) => `        ${address} ${name}`)),
      `    }`,
      `    log`,
      `}`,
      "",
    ].join("\n");
  }

  // ---- docker-compose.yml ----
  const entry = plan.path.find((hop) => hop.container)!.container!;
  const y: string[] = [
    `# "${plan.title.replace(/[\r\n]/g, " ")}": the design running as an app, generated by ARCHITECH.`,
    `# Start: docker compose up --build   Then open http://localhost:8080`,
    `# (to use another port, change the left number of "8080:80" below).`,
    ...(plan.notes.length > 0 ? ["#", "# Notes:", ...plan.notes.map((note) => `#   - ${note}`)] : []),
    "",
    "networks:",
    "  app:",
    "    ipam:",
    "      config:",
    `        - subnet: ${SUBNET}.0/24`,
    "",
    "services:",
  ];
  const service = (name: string, label: string, body: string[]) => {
    y.push(`  # ${label}`, `  ${name}:`, ...body.map((line) => `    ${line}`), "    networks:", "      app:", `        ipv4_address: ${ipOf(name)}`, "");
  };
  const dbUrl = (id: string | null) => (id && dbContainers.has(id) ? `postgresql://app:app@${dbContainers.get(id)}:5432/app` : "");
  const healthyDbs = (ids: (string | null)[]) => [...new Set(ids.filter((id): id is string => Boolean(id) && dbContainers.has(id!)).map((id) => dbContainers.get(id)!))];
  const dependsOn = (names: string[], healthy: string[] = []) =>
    names.length + healthy.length === 0 ? [] : ["depends_on:", ...names.map((name) => `  ${name}: { condition: service_started }`), ...healthy.map((name) => `  ${name}: { condition: service_healthy }`)];
  const configMount = "- ./app.config.json:/config/app.config.json:ro";

  plan.path.forEach((hop, index) => {
    if (!hop.container) return;
    const target = nextOf.get(hop.container);
    const after = target?.upstream ?? (target && !target.dns ? [target.host] : []);
    const afterNames = after.filter((name) => ips.has(name));
    const needs = [...afterNames, ...(target?.dns ? ["dns-server"] : [])];
    const ports = index === plan.path.findIndex((candidate) => candidate.container) ? [`ports:`, `  - "8080:80"   # http://localhost:8080`] : [];
    const label = `${hop.label}${hop.node.startsWith("__") ? "" : ` (${describe(hop.node, roleOfHop(hop))})`}`;
    if (hop.kind === "proxy") {
      service(hop.container, label, [
        `image: ${IMAGES.nginx}`,
        ...ports,
        "volumes:",
        `  - ./proxies/${hop.container}.conf:/etc/nginx/conf.d/default.conf:ro`,
        ...(hop.static ? ["  - ./web:/usr/share/nginx/html:ro", "  - ./app.config.json:/config/app.config.json:ro"] : []),
        ...dependsOn(needs),
      ]);
    } else if (hop.kind === "auth") {
      service(hop.container, label, [
        "build: ./services",
        `command: ["node", "auth.js"]`,
        ...ports,
        "environment:",
        `  CONTAINER: ${hop.container}`,
        `  PORT: "80"`,
        ...(dbUrl(plan.auth.database) ? [`  DATABASE_URL: ${dbUrl(plan.auth.database)}`] : []),
        "volumes:",
        `  ${configMount}`,
        ...dependsOn(needs, healthyDbs([plan.auth.database])),
      ]);
    }
  });
  if (usesDns) {
    ips.set("dns-server", DNS_IP);
    service("dns-server", "DNS (CoreDNS)", [`image: ${IMAGES.coredns}`, `command: ["-conf", "/etc/coredns/Corefile"]`, "volumes:", "  - ./dns/Corefile:/etc/coredns/Corefile:ro"]);
  }
  const apiEnv = [
    ...(plan.data.database ? [`  DATABASE_URL: ${dbUrl(plan.data.database.node)}`] : []),
    ...(plan.data.cache ? [`  CACHE_URL: redis://cache:6379`] : []),
    ...(plan.data.queue ? [`  QUEUE_URL: redis://queue:6379`] : []),
    ...(plan.data.search ? [`  SEARCH_URL: http://search:7700`, `  SEARCH_KEY: development-search-key`] : []),
    ...(plan.data.storage ? [`  STORAGE_URL: http://storage:9000`] : []),
    ...(plan.auth.mode === "service" ? [`  AUTH_URL: http://auth:80`] : []),
  ];
  const apiNeeds = [
    ...(plan.data.cache ? ["cache"] : []),
    ...(plan.data.queue ? ["queue"] : []),
    ...(plan.data.search ? ["search"] : []),
    ...(plan.data.storage ? ["storage"] : []),
    ...(plan.auth.mode === "service" ? ["auth"] : []),
  ];
  for (const name of plan.server.containers) {
    service(name, `${plan.server.label} (${describe(plan.server.node, "server")}), ${name}`, [
      "build: ./services",
      `command: ["node", "api.js"]`,
      ...(entry === name ? [`ports:`, `  - "8080:3000"`] : []),
      "environment:",
      `  CONTAINER: ${name}`,
      ...apiEnv,
      "volumes:",
      `  ${configMount}`,
      ...dependsOn(apiNeeds, healthyDbs([plan.data.database?.node ?? null, plan.auth.mode === "in-api" ? plan.auth.database : null])),
    ]);
  }
  if (plan.auth.mode === "service") {
    service("auth", `${nodes.get(plan.auth.node!)?.data.label ?? "Auth"} (${describe(plan.auth.node!, "auth")})`, [
      "build: ./services",
      `command: ["node", "auth.js"]`,
      "environment:",
      "  CONTAINER: auth",
      ...(dbUrl(plan.auth.database) ? [`  DATABASE_URL: ${dbUrl(plan.auth.database)}`] : []),
      "volumes:",
      `  ${configMount}`,
      ...dependsOn([], healthyDbs([plan.auth.database])),
    ]);
  }
  for (const [id, name] of dbContainers) {
    service(name, `${nodes.get(id)?.data.label ?? "Database"} (${describe(id, "database")})`, [
      `image: ${IMAGES.postgres}`,
      "environment:",
      "  POSTGRES_DB: app",
      "  POSTGRES_USER: app",
      "  POSTGRES_PASSWORD: app",
      "volumes:",
      "  - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro",
      `  - ${name}-data:/var/lib/postgresql/data`,
      "healthcheck:",
      `  test: ["CMD-SHELL", "pg_isready -U app -d app"]`,
      "  interval: 2s",
      "  timeout: 3s",
      "  retries: 30",
    ]);
  }
  if (plan.data.cache) service("cache", `${plan.data.cache.label} (${describe(plan.data.cache.node, "cache")})`, [`image: ${IMAGES.redis}`]);
  if (plan.data.queue) service("queue", `${plan.data.queue.label} (${describe(plan.data.queue.node, "queue")})`, [`image: ${IMAGES.redis}`]);
  if (plan.data.worker) {
    service("worker", `${plan.data.worker.label} (${describe(plan.data.worker.node, "worker")})`, [
      "build: ./services",
      `command: ["node", "worker.js"]`,
      "environment:",
      "  CONTAINER: worker",
      ...(plan.data.database ? [`  DATABASE_URL: ${dbUrl(plan.data.database.node)}`] : []),
      `  QUEUE_URL: redis://queue:6379`,
      ...(plan.data.cache ? [`  CACHE_URL: redis://cache:6379`] : []),
      "volumes:",
      `  ${configMount}`,
      ...dependsOn(["queue", ...(plan.data.cache ? ["cache"] : [])], healthyDbs([plan.data.database?.node ?? null])),
    ]);
  }
  if (plan.data.search) {
    service("search", `${plan.data.search.label} (${describe(plan.data.search.node, "search")})`, [
      `image: ${IMAGES.meilisearch}`,
      "environment:",
      "  MEILI_MASTER_KEY: development-search-key",
      "  MEILI_ENV: development",
      `  MEILI_NO_ANALYTICS: "true"`,
    ]);
  }
  if (plan.data.storage) {
    service("storage", `${plan.data.storage.label} (${describe(plan.data.storage.node, "object-storage")})`, [
      `image: ${IMAGES.minio}`,
      `command: ["server", "/data"]`,
      "environment:",
      "  MINIO_ROOT_USER: minio",
      "  MINIO_ROOT_PASSWORD: minio-secret",
      "volumes:",
      "  - storage-data:/data",
    ]);
    y.push(
      "  # Creates the storage bucket the app keeps files in, then exits.",
      "  storage-setup:",
      `    image: ${IMAGES.mc}`,
      "    depends_on: [storage]",
      "    entrypoint:",
      "      - sh",
      "      - -c",
      `      - until mc alias set local http://storage:9000 minio minio-secret; do sleep 1; done; mc mb -p local/files && mc anonymous set public local/files`,
      "    networks: [app]",
      "",
    );
  }
  const volumes = [...[...dbContainers.values()].map((name) => `${name}-data`), ...(plan.data.storage ? ["storage-data"] : [])];
  if (volumes.length > 0) y.push("volumes:", ...volumes.map((volume) => `  ${volume}:`), "");

  files["docker-compose.yml"] = y.join("\n");
  files["app.config.json"] = `${JSON.stringify(config, null, 2)}\n`;
  if (dbContainers.size > 0) files["db/init.sql"] = INIT_SQL;
  files["README.md"] = readme(plan, entry, SUBNET);
  for (const [path, content] of Object.entries(templates)) files[path] = content;
  return { plan, files };
}

// ---- The design as drawn on the canvas, for the app's map of it ----

export type Drawing = {
  nodes: { id: string; label: string; type: string; x: number; y: number; added?: boolean }[];
  edges: { source: string; target: string }[];
};

// The canvas layout, plus the parts the app added (the page's web server, an API server),
// placed between their neighbours on the request path with their connections redrawn.
export function drawing(design: Design, plan: RunnablePlan): Drawing {
  const nodes: Drawing["nodes"] = design.nodes.map((node, index) => ({
    id: node.id,
    label: node.data.label?.trim() || node.data.type,
    type: node.data.type === "custom" ? String(node.data.properties?.actsAs ?? "custom") : node.data.type,
    x: Number.isFinite(node.position?.x) ? node.position!.x : index * 220,
    y: Number.isFinite(node.position?.y) ? node.position!.y : 0,
  }));
  let edges: Drawing["edges"] = design.edges.filter((edge) => nodes.some((node) => node.id === edge.source) && nodes.some((node) => node.id === edge.target)).map(({ source, target }) => ({ source, target }));
  const at = (id: string) => nodes.find((node) => node.id === id);
  const path = plan.path.map((hop) => hop.node);
  const added = [...path.filter((id) => id.startsWith("__")), ...(plan.server.node === "__api" && !path.includes("__api") ? ["__api"] : [])];
  for (const id of added) {
    const index = path.indexOf(id);
    const before = [...path.slice(0, index)].reverse().map(at).find(Boolean);
    const after = path.slice(index + 1).map(at).find(Boolean);
    const x = before && after ? (before.x + after.x) / 2 : before ? before.x + 220 : after ? after.x - 220 : 0;
    const y = before && after ? (before.y + after.y) / 2 + 70 : (before ?? after)?.y ?? 0;
    const hop = plan.path.find((candidate) => candidate.node === id);
    nodes.push({ id, label: hop?.label ?? plan.server.label, type: id === "__api" ? "server" : id === "__browser" ? "client" : "web-app", x, y, added: true });
    if (before && after) edges = edges.filter((edge) => !(edge.source === before.id && edge.target === after.id));
    if (before) edges.push({ source: before.id, target: id });
    if (after) edges.push({ source: id, target: after.id });
  }
  return { nodes, edges };
}

const INIT_SQL = `-- The app's tables, generated by ARCHITECH.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,             -- scrypt, "salt:hash"; never the password itself
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,             -- sha-256 of the session cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id           SERIAL PRIMARY KEY,
  owner_id     INTEGER,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'new',
  word_count   INTEGER,
  processed_by TEXT,
  processed_at TIMESTAMPTZ,
  file_key     TEXT,
  file_name    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_owner ON items (owner_id, id DESC);
`;

function readme(plan: RunnablePlan, entry: string, subnet: string): string {
  const features = [
    plan.auth.mode !== "none" ? "- **Accounts:** create an account, sign in and out." : "- **No accounts:** the design has no authentication, so everyone shares the same items.",
    `- **Items:** add, edit and delete your items${plan.data.database ? `, saved in ${plan.data.database.label}` : " (kept in memory: the design has no database)"}.`,
    ...(plan.data.cache ? [`- **Cache:** your item list is served from ${plan.data.cache.label} when it can be.`] : []),
    ...(plan.data.queue ? [`- **Process:** puts a job on ${plan.data.queue.label}${plan.data.worker ? ` and ${plan.data.worker.label} counts the item's words in the background` : ""}.`] : []),
    ...(plan.data.search ? [`- **Search:** through ${plan.data.search.label}.`] : []),
    ...(plan.data.storage ? [`- **Files:** attach a file to an item, kept in ${plan.data.storage.label}.`] : []),
  ];
  return `# ${plan.title}

Your ARCHITECH design, running as an app. Every part of the request path is its own container,
in the order your design connects them:

\`\`\`
${plan.path.map((hop) => hop.label).join(" → ")}
\`\`\`

## Run it (free, on your computer)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/).

\`\`\`
docker compose up --build
\`\`\`

Open http://localhost:8080 (served by \`${entry}\`). Click **How it works** to watch each request
light up the parts of your design. Stop with Ctrl+C; \`docker compose down -v\` also deletes the data.

Port 8080 in use? In \`docker-compose.yml\`, change \`"8080:80"\` to e.g. \`"3001:80"\` and open
http://localhost:3001.

"Pool overlaps with other one on this address space"? Another app is using this app's network
range (\`${subnet}.0/24\`): stop it with \`docker compose down\` in its folder, or run
\`docker network prune\` to remove networks nothing is using, then start again.

## Share it (free)

While it runs:

\`\`\`
brew install cloudflared        # or see developers.cloudflare.com
cloudflared tunnel --url http://localhost:8080
\`\`\`

It prints a public \`https://….trycloudflare.com\` link that works while your computer and the
tunnel are running.

## What the app does

${features.join("\n")}

${plan.notes.length > 0 ? `## Notes\n\n${plan.notes.map((note) => `- ${note}`).join("\n")}\n` : ""}
This is a learning app generated from a design: development passwords, no HTTPS. Do not put real
secrets in it.
`;
}
