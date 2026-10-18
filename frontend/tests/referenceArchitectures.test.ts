import assert from "node:assert/strict";
import test from "node:test";

import type { ArchitectureEvaluation } from "../src/lib/architecture/evaluation/contract.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import type { ArchitectureNodeType, NodeProperties } from "../src/lib/architecture/types.ts";

// Reference architectures: the classic designs a system-design course walks through, from a
// single server to a delivery app. Each one is pinned two ways:
//   1. Expected numbers within a tolerance (score, p95, capacity, cost, uptime), so a change
//      to the engine that moves a well-known design is noticed and has to be deliberate.
//   2. The lessons between designs (a load balancer adds uptime, a cache adds read capacity,
//      a CDN takes static files off the servers, a queue absorbs writes), which must hold
//      whatever the exact numbers become.
// Known modelling gaps are recorded as `todo` tests: they report the gap without failing the
// suite, and start passing once it is fixed.

const n = (id: string, type: ArchitectureNodeType, properties?: NodeProperties) => ({
  id,
  data: { type, label: id, ...(properties ? { properties } : {}) },
});
const e = (source: string, target: string) => ({ source, target });
type Graph = { nodes: ReturnType<typeof n>[]; edges: ReturnType<typeof e>[] };
const run = (graph: Graph, traffic: Record<string, number> = {}): ArchitectureEvaluation =>
  evaluateArchitecture({ graph: graph as never, traffic });

// ---- The designs ----

const monolith: Graph = {
  nodes: [n("c", "client"), n("s", "server"), n("d", "database")],
  edges: [e("c", "s"), e("s", "d")],
};
const threeTier: Graph = {
  nodes: [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 3 }), n("d", "database", { replicas: 1 })],
  edges: [e("c", "lb"), e("lb", "s"), e("s", "d")],
};
const threeTierCache: Graph = {
  nodes: [...threeTier.nodes, n("k", "cache", { replicas: 2 })],
  edges: [...threeTier.edges, e("s", "k")],
};
const withCdn: Graph = {
  nodes: [...threeTierCache.nodes, n("cdn", "cdn"), n("o", "object-storage", { replicas: 2 })],
  edges: [...threeTierCache.edges, e("c", "cdn"), e("cdn", "o")],
};
const writeQueue: Graph = {
  nodes: [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 4 }), n("q", "queue", { replicas: 2 }), n("w", "worker", { replicas: 6 }), n("d", "database", { replicas: 1 })],
  edges: [e("c", "lb"), e("lb", "s"), e("s", "q"), e("q", "w"), e("w", "d"), e("s", "d")],
};
const urlShortener: Graph = {
  nodes: [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 8 }), n("k", "cache", { replicas: 2 }), n("d", "database", { replicas: 2 })],
  edges: [e("c", "lb"), e("lb", "s"), e("s", "k"), e("s", "d")],
};
const delivery: Graph = {
  nodes: [
    n("c", "client"), n("m", "mobile-app"), n("cdn", "cdn"), n("o", "object-storage", { replicas: 2 }),
    n("g", "api-gateway", { replicas: 2 }), n("a", "auth", { replicas: 2 }), n("orders", "server", { replicas: 6 }),
    n("search", "search", { replicas: 3 }), n("k", "cache", { replicas: 3 }), n("q", "queue", { replicas: 2 }),
    n("w", "worker", { replicas: 6 }), n("d", "database", { replicas: 3 }),
  ],
  edges: [
    e("c", "cdn"), e("cdn", "o"), e("c", "g"), e("m", "g"), e("g", "orders"), e("orders", "a"),
    e("orders", "search"), e("orders", "k"), e("orders", "d"), e("orders", "q"), e("q", "w"), e("w", "d"),
  ],
};
const URL_SHORTENER_TRAFFIC = { requestsPerSecond: 11_500, readRatio: 91, datasetGb: 200, networkLatencyMs: 40, staticShare: 0 };
const WRITE_HEAVY = { requestsPerSecond: 8_000, readRatio: 30 };

// ---- 1. Expected numbers ----

type Expected = { score: number; p95: number; capacity: number; cost: number; uptime: number };
// Score within 3 points, p95/capacity/cost within 10%, uptime within 0.05 points.
function expectNear(name: string, result: ArchitectureEvaluation, expected: Expected) {
  const within = (actual: number, target: number, tolerance: number, what: string) =>
    assert.ok(Math.abs(actual - target) <= tolerance, `${name}: ${what} is ${actual}, expected about ${target}`);
  within(result.overallScore, expected.score, 3, "score");
  within(result.metrics.p95LatencyMs, expected.p95, expected.p95 * 0.1, "p95 (ms)");
  within(result.metrics.capacityRps ?? 0, expected.capacity, expected.capacity * 0.1, "capacity (req/s)");
  within(result.metrics.estimatedMonthlyCost, expected.cost, expected.cost * 0.1, "monthly cost ($)");
  within(result.metrics.uptimeAvailability, expected.uptime, 0.05, "uptime (%)");
}

test("reference numbers at the default traffic (1,000 req/s, 60% static files)", () => {
  expectNear("monolith", run(monolith), { score: 90, p95: 67, capacity: 2_500, cost: 142, uptime: 99.86 });
  expectNear("three-tier", run(threeTier), { score: 85, p95: 72.5, capacity: 7_500, cost: 412, uptime: 100 });
  expectNear("three-tier + cache", run(threeTierCache), { score: 85, p95: 72.5, capacity: 7_500, cost: 462, uptime: 100 });
  expectNear("+ CDN and object storage", run(withCdn), { score: 85, p95: 72.5, capacity: 18_750, cost: 544, uptime: 100 });
  expectNear("delivery app", run(delivery), { score: 85, p95: 82.5, capacity: 11_250, cost: 1_541, uptime: 100 });
});

test("reference numbers at each design's own traffic", () => {
  expectNear("url shortener", run(urlShortener, URL_SHORTENER_TRAFFIC), { score: 92, p95: 75.9, capacity: 16_913, cost: 772, uptime: 100 });
  expectNear("write-heavy with a queue", run(writeQueue, WRITE_HEAVY), { score: 86, p95: 83.5, capacity: 10_000, cost: 778, uptime: 100 });
});

test("every reference design is ready to evaluate and has no structural problems", () => {
  for (const [name, graph] of Object.entries({ monolith, threeTier, threeTierCache, withCdn, writeQueue, urlShortener, delivery })) {
    const result = run(graph);
    assert.equal(result.ready, true, name);
    const structural = result.findings.filter((finding) => finding.category === "architecture");
    assert.deepEqual(structural.map((finding) => finding.id), [], `${name} has structural findings`);
  }
});

// ---- 2. The lessons between designs ----

test("a load balancer with replicas removes the single points of failure", () => {
  const single = run(monolith);
  const redundant = run(threeTier);
  assert.ok(redundant.metrics.uptimeAvailability > single.metrics.uptimeAvailability);
  assert.ok(single.findings.some((finding) => finding.id.startsWith("spof-")));
  assert.ok(!redundant.findings.some((finding) => finding.id.startsWith("spof-")));
  assert.ok(redundant.metrics.capacityRps! > single.metrics.capacityRps!);
});

test("a cache answers repeated reads, so a read-heavy load reaches the database less", () => {
  const load = { requestsPerSecond: 20_000, readRatio: 90, staticShare: 0 };
  const without = run(threeTier, load);
  const withCache = run(threeTierCache, load);
  assert.ok(withCache.metrics.capacityRps! > without.metrics.capacityRps!);
  assert.ok(without.findings.some((finding) => finding.id === "cache-opportunity"));
  assert.ok(!withCache.findings.some((finding) => finding.id === "cache-opportunity"));
});

test("a CDN with object storage takes static files off the servers", () => {
  const without = run(threeTierCache, { requestsPerSecond: 12_000 });
  const withEdge = run(withCdn, { requestsPerSecond: 12_000 });
  assert.ok(withEdge.metrics.capacityRps! > without.metrics.capacityRps!);
  assert.ok(without.findings.some((finding) => finding.id.startsWith("static-on-servers-")));
  assert.ok(!withEdge.findings.some((finding) => finding.id.startsWith("static-on-servers-")));
});

test("a queue absorbs writes: the write-heavy design serves its peak only with the queue", () => {
  const direct: Graph = {
    nodes: writeQueue.nodes.filter((node) => node.id !== "q" && node.id !== "w"),
    edges: [e("c", "lb"), e("lb", "s"), e("s", "d")],
  };
  const queued = run(writeQueue, WRITE_HEAVY);
  const unqueued = run(direct, WRITE_HEAVY);
  assert.ok(queued.metrics.effectiveRps > unqueued.metrics.effectiveRps);
  assert.ok(unqueued.findings.some((finding) => finding.id === "saturated-d"));
});

test("the URL shortener reference meets its challenge load with headroom", () => {
  const result = run(urlShortener, URL_SHORTENER_TRAFFIC);
  assert.equal(result.metrics.effectiveRps, URL_SHORTENER_TRAFFIC.requestsPerSecond);
  assert.ok(result.metrics.capacityRps! >= URL_SHORTENER_TRAFFIC.requestsPerSecond * 1.2);
  assert.ok(result.metrics.p95LatencyMs < 100);
});

test("session lookups on every request make auth the delivery app's limit, JWTs do not", () => {
  // Without search, which is a known gap below and would otherwise be the limit either way.
  const noSearch = (auth: NodeProperties): Graph => ({
    nodes: delivery.nodes
      .filter((node) => node.id !== "search")
      .map((node) => (node.id === "a" ? n("a", "auth", auth) : node)),
    edges: delivery.edges.filter((edge) => edge.target !== "search"),
  });
  // 12,000 API requests a second; two auth instances can check 8,000.
  const load = { requestsPerSecond: 12_000, staticShare: 0 };
  const jwt = run(noSearch({ replicas: 2 }), load);
  const sessions = run(noSearch({ replicas: 2, authCheckRate: 1 }), load);
  assert.ok(sessions.metrics.capacityRps! < jwt.metrics.capacityRps!);
  assert.ok(sessions.findings.some((finding) => finding.id === "saturated-a"));
  assert.ok(!jwt.findings.some((finding) => finding.id === "saturated-a"));
});

// ---- Known modelling gaps (reported, not failing) ----

test("a redundant three-tier design scores at least as well as a single server", {
  todo: "Cost efficiency drops to 0 for redundancy at low load and outweighs reliability (85 vs 90).",
}, () => {
  assert.ok(run(threeTier).overallScore >= run(monolith).overallScore);
});

test("a CDN is not reported as a single point of failure", {
  todo: "A CDN with 1 'instance' is flagged as a single point of failure, but it is a global network.",
}, () => {
  assert.ok(!run(withCdn).findings.some((finding) => finding.id === "spof-cdn"));
});

test("search only receives search requests, not every request a service handles", {
  todo: "Support services other than auth receive 100% of a service's requests; the delivery app's search saturates at 20k req/s.",
}, () => {
  const result = run(delivery, { requestsPerSecond: 20_000 });
  assert.ok(!result.findings.some((finding) => finding.id === "saturated-search"));
});
