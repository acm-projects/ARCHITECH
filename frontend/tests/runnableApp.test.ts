import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

import { planRunnableApp, runnableAppFiles, subnetFor } from "../src/lib/architecture/export/runnableApp.ts";
import { crc32, createZip } from "../src/lib/zip.ts";

const n = (id: string, type: string, label: string, extra: Record<string, unknown> = {}) => ({ id, data: { type, label, ...extra } }) as never;
const edges = (...pairs: [string, string][]) => pairs.map(([source, target]) => ({ source, target }));

function templates(dir = "export-templates/runnable-app", prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(files, templates(full, `${prefix}${name}/`));
    else files[`${prefix}${name}`] = readFileSync(full, "utf8");
  }
  return files;
}

// Client web face -> Auth -> DNS -> Load balancer -> API server (2) -> Database
const signIn = {
  title: "Sign-in demo",
  nodes: [n("c", "client", "Client web face"), n("a", "auth", "Auth"), n("d", "dns", "DNS"), n("l", "load-balancer", "Load balancer"), n("s", "server", "API server", { properties: { replicas: 2 } }), n("db", "database", "Database")],
  edges: edges(["c", "a"], ["a", "d"], ["d", "l"], ["l", "s"], ["s", "db"]),
};

const shop = {
  title: "Shop",
  nodes: [
    n("c", "client", "Users"), n("w", "web-app", "Storefront"), n("cdn", "cdn", "CDN"), n("l", "load-balancer", "LB"),
    n("s", "server", "Orders API", { properties: { replicas: 9 } }), n("au", "auth", "Login"), n("k", "cache", "Redis"),
    n("db", "database", "Orders DB", { implementation: "mongodb" }), n("q", "queue", "Jobs"), n("wk", "worker", "Worker"),
    n("se", "search", "Search"), n("st", "object-storage", "Files"),
  ],
  edges: edges(["c", "w"], ["w", "cdn"], ["cdn", "l"], ["l", "s"], ["s", "au"], ["s", "k"], ["k", "db"], ["s", "q"], ["q", "wk"], ["wk", "db"], ["s", "se"], ["s", "st"]),
};

test("the request path is the design's own, in its order, with DNS answering for the next part", () => {
  const plan = planRunnableApp(signIn);
  assert.deepEqual(
    plan.path.map((hop) => [hop.label, hop.kind, hop.container ?? null]),
    [
      ["Client web face", "pass", null],
      ["Web page", "proxy", "web"],
      ["Auth", "auth", "auth"],
      ["DNS", "dns", null],
      ["Load balancer", "proxy", "load-balancer"],
      ["API server", "server", null],
    ],
  );
  const dns = plan.path.find((hop) => hop.kind === "dns")!;
  assert.equal(dns.resolvedBy, "auth", "the part before DNS looks up the part after it");
  assert.equal(dns.name, "load-balancer.app.internal");
  assert.deepEqual(plan.server.containers, ["api-1", "api-2"], "as many API servers as the design's replicas");
  assert.deepEqual(plan.auth, { mode: "on-path", node: "a", database: "db" });
  assert.match(plan.notes.join(" "), /no web app on the request path/);

  const { files } = runnableAppFiles(signIn, {});
  const subnet = subnetFor(signIn);
  assert.match(subnet, /^10\.(1\d\d|2[0-4]\d)\.\d{1,3}$/);
  assert.ok(files["dns/Corefile"]!.includes(`${subnet}.12 load-balancer.app.internal`));
  const compose = parse(files["docker-compose.yml"]!);
  assert.deepEqual(Object.keys(compose.services).sort(), ["api-1", "api-2", "auth", "db", "dns-server", "load-balancer", "web"]);
  assert.equal(compose.services["dns-server"].networks.app.ipv4_address, `${subnet}.53`);
  assert.deepEqual(compose.networks.app.ipam.config, [{ subnet: `${subnet}.0/24` }]);
  assert.deepEqual(compose.services.web.ports, ["8080:80   # http://localhost:8080"].map((port) => port.split(" ")[0]));
  const config = JSON.parse(files["app.config.json"]!);
  assert.deepEqual(config.hops.auth.next, { host: "load-balancer.app.internal", port: 80, label: "Load balancer", dns: { server: `${subnet}.53`, node: "d" } });
  assert.deepEqual(config.features, { auth: true, queue: false, search: false, files: false });
  assert.match(files["proxies/load-balancer.conf"]!, /upstream api_servers \{\n    server api-1:3000;\n    server api-2:3000;\n\}/);
});

test("data parts behind the API give the app its features; stand-ins are named", () => {
  const plan = planRunnableApp(shop);
  assert.equal(plan.auth.mode, "service", "auth beside the API: the API asks it");
  assert.deepEqual(Object.fromEntries(Object.entries(plan.data).map(([key, part]) => [key, part?.label ?? null])), {
    database: "Orders DB", cache: "Redis", queue: "Jobs", worker: "Worker", search: "Search", storage: "Files",
  });
  assert.equal(plan.server.containers.length, 4, "capped so it runs on a laptop");
  assert.match(plan.notes.join(" "), /runs 9 API servers; the app runs 4/);

  const { files } = runnableAppFiles(shop, templates());
  const compose = parse(files["docker-compose.yml"]!);
  assert.deepEqual(Object.keys(compose.services).sort(), [
    "auth", "cache", "cdn", "db", "lb", "orders-api-1", "orders-api-2", "orders-api-3", "orders-api-4", "queue", "search", "storage", "storage-setup", "storefront", "worker",
  ]);
  assert.deepEqual(compose.services.storefront.ports, ["8080:80"]);
  assert.equal(compose.services["orders-api-1"].environment.AUTH_URL, "http://auth:80");
  assert.equal(compose.services.worker.environment.QUEUE_URL, "redis://queue:6379");
  assert.match(files["proxies/cdn.conf"]!, /proxy_cache pages;/);
  const config = JSON.parse(files["app.config.json"]!);
  assert.deepEqual(config.features, { auth: true, queue: true, search: true, files: true });
  const what = Object.fromEntries(config.components.map((part: { label: string; what: string }) => [part.label, part.what]));
  assert.equal(what["Orders DB"], "MongoDB (runs as PostgreSQL here)");
  assert.equal(what.Jobs, "RabbitMQ (runs as Redis (list) here)");
  // The app's code and page are part of the project.
  for (const file of ["services/api.js", "services/auth.js", "services/worker.js", "services/Dockerfile", "web/index.html", "db/init.sql", "README.md"]) assert.ok(files[file], file);
});

test("the page gets the design's drawing, with the parts the app added placed on the path", () => {
  const placed = { ...signIn, nodes: signIn.nodes.map((node, index) => ({ ...(node as object), position: { x: index * 200, y: 0 } }) as never) };
  const { files } = runnableAppFiles(placed, { "web/index.html": "<html>", "web/archie.svg": "<svg/>" });
  const { design } = JSON.parse(files["app.config.json"]!);
  const web = design.nodes.find((node: { id: string }) => node.id === "__web");
  assert.deepEqual(web, { id: "__web", label: "Web page", type: "web-app", x: 100, y: 70, added: true }, "between the client and auth, a little below");
  assert.deepEqual(design.nodes.find((node: { id: string }) => node.id === "db"), { id: "db", label: "Database", type: "database", x: 1000, y: 0 });
  const links = design.edges.map((edge: { source: string; target: string }) => `${edge.source}>${edge.target}`);
  assert.ok(links.includes("c>__web") && links.includes("__web>a"), "the path goes through the added web server");
  assert.ok(!links.includes("c>a"), "the direct client-to-auth line is replaced");
  assert.equal(files["web/archie.svg"], "<svg/>", "Archie ships with the page");
  const compose = parse(files["docker-compose.yml"]!);
  assert.ok(compose.services.web.volumes.includes("./web:/usr/share/nginx/html:ro"), "the whole web folder is served");
  assert.ok(compose.services.web.volumes.includes("./app.config.json:/config/app.config.json:ro"), "the settings are mounted outside the read-only page folder");
  assert.ok(!compose.services.web.volumes.some((volume: string) => volume.includes(":/usr/share/nginx/html/")), "nothing is mounted inside the read-only page folder (Docker cannot create the mount point)");
  assert.match(files["proxies/web.conf"]!, /location = \/app\.config\.json \{\n\s+alias \/config\/app\.config\.json;/);
});

test("different designs get different network ranges, so their apps can run side by side", () => {
  assert.notEqual(subnetFor(signIn), subnetFor(shop));
  assert.equal(subnetFor(signIn), subnetFor({ ...signIn }), "the same design always gets the same range");
});

test("a design missing parts still runs, and says what was added or left out", () => {
  const plan = planRunnableApp({ title: "", nodes: [n("c", "client", "Users"), n("q", "queue", "Q")], edges: [] });
  assert.equal(plan.title, "My app");
  assert.equal(plan.server.node, "__api");
  assert.deepEqual(plan.auth, { mode: "none", node: null, database: null });
  assert.match(plan.notes.join("\n"), /no API server, so one is added/);
  assert.match(plan.notes.join("\n"), /no authentication/);
  assert.match(plan.notes.join("\n"), /no database, so items live in each API server's memory/);
  const compose = parse(runnableAppFiles({ title: "x", nodes: [n("c", "client", "Users")], edges: [] }, {}).files["docker-compose.yml"]!);
  assert.deepEqual(Object.keys(compose.services).sort(), ["api-1", "web"]);
});

test("the zip opens with standard tools", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  const zip = createZip([{ path: "app/README.md", content: "# hi\n" }, { path: "app/a/b.txt", content: "ünïcode" }], new Date(2026, 9, 22, 12, 0, 0));
  const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
  writeFileSync(path.join(dir, "app.zip"), zip);
  const listing = execFileSync("python3", ["-c", "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('|'.join(n + '=' + z.read(n).decode() for n in z.namelist()))", path.join(dir, "app.zip")]).toString().trim();
  assert.equal(listing, "app/README.md=# hi\n|app/a/b.txt=ünïcode");
});
