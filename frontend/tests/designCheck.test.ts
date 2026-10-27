import assert from "node:assert/strict";
import test from "node:test";

import { applyFix, checkedFix, downtimePerYear, formatAvailability, planFix, strengthenWeakest, uptimeBreakdown } from "../src/lib/architecture/designCheck.ts";
import { createEvaluationCache } from "../src/lib/architecture/evaluation/liveMetrics.ts";

let column = 0;
const n = (id: string, type: string, label: string, properties?: Record<string, number>) =>
  ({ id, type: "architecture", position: { x: (column += 220), y: 0 }, data: { type, label, ...(properties ? { properties } : {}) } }) as never;
const e = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });
type Design = { nodes: never[]; edges: { id: string; source: string; target: string }[] };

// Users -> LB -> API (1 instance) -> DB
const basic = (): Design => ({
  nodes: [n("client-1", "client", "Users"), n("load-balancer-1", "load-balancer", "LB"), n("server-1", "server", "API", { replicas: 1 }), n("database-1", "database", "DB")],
  edges: [e("client-1", "load-balancer-1"), e("load-balancer-1", "server-1"), e("server-1", "database-1")],
});
const BUSY = { requestsPerSecond: 20_000, readRatio: 90 };

function findingsWithFixes(design: Design, traffic: unknown) {
  const cache = createEvaluationCache();
  const { evaluation } = cache.get(design, traffic);
  return { evaluation, cache, fixes: evaluation.findings.map((finding) => ({ finding, fix: checkedFix(finding, evaluation, design as never, traffic, cache) })) };
}

test("every fix offered removes its problem or raises the score, by the engine's own numbers", () => {
  for (const traffic of [{}, BUSY]) {
    const { fixes } = findingsWithFixes(basic(), traffic);
    assert.ok(fixes.some(({ fix }) => fix), "the basic design has fixable problems");
    for (const { finding, fix } of fixes) {
      if (!fix) continue;
      const after = createEvaluationCache().get(fix.design, traffic);
      const solved = !after.evaluation.findings.some((candidate) => candidate.id === finding.id);
      assert.ok(solved || after.summary.score > fix.before.score, `${finding.id}: ${fix.label}`);
      assert.deepEqual(fix.after, after.summary, "the preview is what applying gives");
    }
  }
});

test("a single point of failure gets a second instance; a database gets a read replica", () => {
  const { fixes } = findingsWithFixes(basic(), {});
  const byId = Object.fromEntries(fixes.map(({ finding, fix }) => [finding.id, fix]));
  assert.equal(byId["low-availability"]?.label, "Run 2 instances of API");
  assert.equal(byId["database-redundancy-database-1"]?.label, "Add a read replica to DB");
  const server = byId["low-availability"]!.design.nodes.find((node) => node.id === "server-1")!;
  assert.deepEqual(server.data.properties, { replicas: 2 });
  assert.ok(byId["low-availability"]!.after.uptimePercent > byId["low-availability"]!.before.uptimePercent);
});

test("an overloaded component gets enough instances to come back under 70%", () => {
  const { fixes } = findingsWithFixes(basic(), BUSY);
  const fix = fixes.find(({ finding }) => finding.id === "saturated-server-1")?.fix;
  assert.ok(fix);
  assert.match(fix.label, /^Run \d+ instances of API$/);
  const after = createEvaluationCache().get(fix.design, BUSY).evaluation;
  const server = after.nodes.find((node) => node.nodeId === "server-1")!;
  assert.ok(server.utilization <= 0.7, `utilization ${server.utilization}`);
  assert.ok(!after.findings.some((finding) => finding.id === "saturated-server-1"));
});

test("a cache goes between the services and the database; workers keep writing directly", () => {
  const design: Design = {
    nodes: [n("client-1", "client", "Users"), n("server-1", "server", "API"), n("queue-1", "queue", "Jobs"), n("worker-1", "worker", "Worker"), n("database-1", "database", "DB")],
    edges: [e("client-1", "server-1"), e("server-1", "database-1"), e("server-1", "queue-1"), e("queue-1", "worker-1"), e("worker-1", "database-1")],
  };
  const { fixes } = findingsWithFixes(design, { readRatio: 90 });
  const fix = fixes.find(({ finding }) => finding.id === "cache-opportunity")?.fix;
  assert.ok(fix);
  assert.equal(fix.label, "Put a cache in front of DB");
  assert.deepEqual(fix.design.edges.map((edge) => edge.id).sort(), ["cache-1->database-1", "client-1->server-1", "queue-1->worker-1", "server-1->cache-1", "server-1->queue-1", "worker-1->database-1"]);
  const cacheNode = fix.design.nodes.find((node) => node.id === "cache-1")!;
  assert.equal(cacheNode.data.type, "cache");
  assert.ok(Number.isFinite(cacheNode.position.x) && Number.isFinite(cacheNode.position.y), "placed on the canvas");
});

test("a client wired straight to the database is sent through an API server", () => {
  const design: Design = {
    nodes: [n("client-1", "client", "Users"), n("database-1", "database", "DB"), n("server-1", "server", "API")],
    edges: [e("client-1", "database-1"), e("client-1", "server-1"), e("server-1", "database-1")],
  };
  const { fixes } = findingsWithFixes(design, {});
  const fix = fixes.find(({ finding }) => finding.id === "connection-client-1->database-1")?.fix;
  assert.ok(fix);
  assert.equal(fix.label, "Send Users through an API server");
  const ids = fix.design.edges.map((edge) => edge.id);
  assert.ok(!ids.includes("client-1->database-1"));
  assert.ok(ids.includes("client-1->server-2") && ids.includes("server-2->database-1"));
});

test("a queue nobody reads gets a worker that saves to the database", () => {
  const design: Design = {
    nodes: [n("client-1", "client", "Users"), n("server-1", "server", "API"), n("queue-1", "queue", "Jobs"), n("database-1", "database", "DB")],
    edges: [e("client-1", "server-1"), e("server-1", "queue-1"), e("server-1", "database-1")],
  };
  const { fixes } = findingsWithFixes(design, {});
  const fix = fixes.find(({ finding }) => finding.id === "queue-no-consumer-queue-1")?.fix;
  assert.ok(fix);
  assert.equal(fix.label, "Add a worker to process Jobs");
  assert.ok(fix.design.edges.some((edge) => edge.id === "queue-1->worker-1"));
  assert.ok(fix.design.edges.some((edge) => edge.id === "worker-1->database-1"));
});

test("findings with no fix that follows from them get none", () => {
  const { fixes } = findingsWithFixes(basic(), BUSY);
  for (const id of ["slow-requests", "static-on-servers-server-1"]) {
    const entry = fixes.find(({ finding }) => finding.id === id);
    if (entry) assert.equal(entry.fix, null, id);
  }
  const { evaluation } = createEvaluationCache().get(basic(), {});
  assert.equal(planFix({ id: "no-such-thing", category: "architecture", severity: "low", title: "", message: "", nodeIds: [], recommendation: "" }, evaluation, basic() as never), null);
});

test("a fix that no longer fits the design is not applied", () => {
  assert.equal(applyFix(basic() as never, { findingId: "x", label: "x", changes: [{ op: "set_setting", node: "gone-1", key: "replicas", value: 2 }] }), null);
});

test("uptime: the main path's parts multiplied, the weakest link, and what a second instance of it gives", () => {
  const design = basic();
  const cache = createEvaluationCache();
  const { evaluation, summary } = cache.get(design, {});
  const uptime = uptimeBreakdown(evaluation, design as never);
  assert.equal(uptime.percent, summary.uptimePercent);
  assert.deepEqual(uptime.path.map((part) => part.name), ["LB", "API", "DB"], "the client is not a part that fails");
  assert.ok(Math.abs(uptime.pathAvailability - uptime.path.reduce((product, part) => product * part.availability, 1)) < 1e-12);
  assert.equal(uptime.weakest?.name, "API");
  const stronger = strengthenWeakest(evaluation, design as never, {}, cache);
  assert.equal(stronger?.label, "Run 2 instances of API");
  assert.ok(stronger!.after.uptimePercent > stronger!.before.uptimePercent);
});

test("parts only some requests use (sign-in, search) are not in the chain every request needs", () => {
  const design: Design = {
    nodes: [n("client-1", "client", "Users"), n("server-1", "server", "API"), n("auth-1", "auth", "Login"), n("search-1", "search", "Search"), n("database-1", "database", "DB")],
    edges: [e("client-1", "server-1"), e("server-1", "auth-1"), e("server-1", "search-1"), e("server-1", "database-1")],
  };
  const { evaluation } = createEvaluationCache().get(design, {});
  const names = uptimeBreakdown(evaluation, design as never).path.map((part) => part.name);
  assert.ok(!names.includes("Login") && !names.includes("Search"), names.join(", "));
  assert.ok(names.includes("API"));
});

test("sign-in on the path is in the chain: every request passes through it", () => {
  const design: Design = {
    nodes: [n("client-1", "client", "Users"), n("auth-1", "auth", "Auth"), n("server-1", "server", "API", { replicas: 2 }), n("database-1", "database", "DB", { replicas: 1 })],
    edges: [e("client-1", "auth-1"), e("auth-1", "server-1"), e("server-1", "database-1")],
  };
  const { evaluation } = createEvaluationCache().get(design, {});
  const uptime = uptimeBreakdown(evaluation, design as never);
  assert.deepEqual(uptime.path.map((part) => part.name), ["Auth", "API", "DB"]);
  assert.equal(uptime.weakest?.name, "Auth");
});

test("a CDN or DNS is never the weakest link to strengthen: they are managed networks", () => {
  const design: Design = {
    nodes: [n("client-1", "client", "Users"), n("cdn-1", "cdn", "CDN"), n("server-1", "server", "API", { replicas: 3 }), n("database-1", "database", "DB", { replicas: 2 })],
    edges: [e("client-1", "cdn-1"), e("cdn-1", "server-1"), e("server-1", "database-1")],
  };
  const { evaluation } = createEvaluationCache().get(design, {});
  const uptime = uptimeBreakdown(evaluation, design as never);
  assert.ok(uptime.path.some((part) => part.name === "CDN"), "it still counts in the chain");
  assert.notEqual(uptime.weakest?.name, "CDN");
});

test("availability shows its nines without rounding up, and the downtime it means", () => {
  assert.equal(formatAvailability(0.999), "99.9%");
  assert.equal(formatAvailability(0.9999), "99.99%");
  assert.equal(formatAvailability(0.999 ** 3), "99.7%");
  assert.equal(formatAvailability(0.99995), "99.995%");
  assert.equal(formatAvailability(0.99), "99%");
  assert.equal(formatAvailability(0.9999999), "99.99999%");
  assert.equal(formatAvailability(1), "100%");
  assert.equal(downtimePerYear(0.999), "≈ 8.8 hours a year");
  assert.equal(downtimePerYear(0.9999), "≈ 53 minutes a year");
  assert.equal(downtimePerYear(0.99), "≈ 4 days a year");
});
