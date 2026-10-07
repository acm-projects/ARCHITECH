import assert from "node:assert/strict";
import test from "node:test";

import { analyzeGraph } from "../src/lib/architecture/analysis.ts";
import { SIMULATION_PROFILES, configureNode } from "../src/lib/architecture/evaluation/capabilities.ts";
import {
  evaluateArchitecture,
  sanitizeTraffic,
  DEFAULT_TRAFFIC,
  type ArchitectureEvaluation,
} from "../src/lib/architecture/evaluation/evaluate.ts";
import { SCORE_WEIGHTS } from "../src/lib/architecture/evaluation/scoring.ts";
import { roleOf } from "../src/lib/architecture/analysis.ts";
import { COMPONENT_CATALOG } from "../src/components/workspace/componentCatalog.ts";

// ---- Helpers ----

type N = { id: string; data: { type: string; label: string; properties?: Record<string, unknown> } };
const n = (id: string, type: string, properties?: Record<string, unknown>, label = id): N => ({
  id,
  data: { type, label, ...(properties ? { properties } : {}) },
});
const e = (source: string, target: string) => ({ source, target });
const graphOf = (nodes: N[], edges: { source: string; target: string }[]) => ({ nodes, edges });
const run = (graph: unknown, traffic: Record<string, unknown> = {}) =>
  evaluateArchitecture({ graph: graph as never, traffic });

const simple = () =>
  graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s"), e("s", "d")]);

// Plenty of servers, so the database is what limits the design.
const dbBound = (dbProps?: Record<string, unknown>) =>
  graphOf(
    [n("c", "client"), n("s", "server", { replicas: 6 }), n("d", "database", dbProps)],
    [e("c", "s"), e("s", "d")],
  );

const withCache = (g = dbBound()) =>
  graphOf([...g.nodes, n("k", "cache")], [...g.edges, e("s", "k")]);

const redundant = () =>
  graphOf(
    [
      n("c", "client"),
      n("lb", "load-balancer", { replicas: 2 }),
      n("s", "server", { replicas: 3 }),
      n("d", "database", { replicas: 1 }),
    ],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );

const node = (result: ArchitectureEvaluation, id: string) => result.nodes.find((x) => x.nodeId === id);
const finding = (result: ArchitectureEvaluation, id: string) => result.findings.find((f) => f.id === id);

function everyNumberIsFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(everyNumberIsFinite);
  if (typeof value === "object" && value !== null) return Object.values(value).every(everyNumberIsFinite);
  return true;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ---- Traffic ----

test("missing traffic gets documented defaults", () => {
  const { traffic, adjusted } = sanitizeTraffic(undefined);
  assert.deepEqual(traffic, DEFAULT_TRAFFIC);
  assert.deepEqual(adjusted, []);
  assert.deepEqual(sanitizeTraffic(null).traffic, DEFAULT_TRAFFIC);
  assert.deepEqual(sanitizeTraffic("nonsense").traffic, DEFAULT_TRAFFIC);
});

test("negative traffic is clamped to zero and reported", () => {
  const { traffic, adjusted } = sanitizeTraffic({ requestsPerSecond: -500, datasetGb: -1, readRatio: -20 });
  assert.equal(traffic.requestsPerSecond, 0);
  assert.equal(traffic.datasetGb, 0);
  assert.equal(traffic.readRatio, 0);
  assert.deepEqual(adjusted.sort(), ["datasetGb", "readRatio", "requestsPerSecond"]);
});

test("NaN and non-numbers fall back to defaults, Infinity is capped, and all are reported", () => {
  const { traffic, adjusted } = sanitizeTraffic({
    requestsPerSecond: Number.POSITIVE_INFINITY,
    datasetGb: Number.NaN,
    readRatio: "80",
    networkLatencyMs: Number.NEGATIVE_INFINITY,
    concurrentUsers: Number.NaN,
  });
  assert.equal(traffic.requestsPerSecond, 10_000_000);
  assert.equal(traffic.datasetGb, DEFAULT_TRAFFIC.datasetGb);
  assert.equal(traffic.readRatio, DEFAULT_TRAFFIC.readRatio);
  assert.equal(traffic.networkLatencyMs, 0);
  assert.ok(Object.values(traffic).every(Number.isFinite));
  assert.equal(adjusted.length, 5);
});

test("extreme values are clamped to the limits", () => {
  const { traffic } = sanitizeTraffic({ readRatio: 500, requestsPerSecond: 1e15, networkLatencyMs: 1e9 });
  assert.equal(traffic.readRatio, 100);
  assert.equal(traffic.requestsPerSecond, 10_000_000);
  assert.equal(traffic.networkLatencyMs, 5_000);
});

test("requests per second and concurrent users fill in for each other", () => {
  assert.equal(sanitizeTraffic({ concurrentUsers: 10_000 }).traffic.requestsPerSecond, 2_000);
  assert.equal(sanitizeTraffic({ requestsPerSecond: 500 }).traffic.concurrentUsers, 2_500);
  const both = sanitizeTraffic({ requestsPerSecond: 500, concurrentUsers: 7 }).traffic;
  assert.deepEqual([both.requestsPerSecond, both.concurrentUsers], [500, 7]);
});

test("negative and NaN traffic never break an evaluation", () => {
  for (const traffic of [
    { requestsPerSecond: -100 },
    { requestsPerSecond: Number.NaN, datasetGb: Number.NaN },
    { requestsPerSecond: Number.POSITIVE_INFINITY },
    { readRatio: Number.NaN, concurrentUsers: -5 },
  ]) {
    const result = run(simple(), traffic);
    assert.equal(everyNumberIsFinite(result), true);
    assert.ok(result.adjustedInputs.length > 0);
  }
  assert.equal(run(simple(), { requestsPerSecond: -100 }).metrics.requestedRps, 0);
});

// ---- Capabilities ----

test("every component in the visual catalog has a simulation profile, and no extras", () => {
  assert.deepEqual(Object.keys(SIMULATION_PROFILES).sort(), Object.keys(COMPONENT_CATALOG).sort());
});

test("node configuration is read from properties with safe defaults", () => {
  const cfg = (type: string, properties?: Record<string, unknown>) => configureNode(n("x", type, properties) as never);
  assert.equal(cfg("server").instances, 1);
  assert.equal(cfg("server", { replicas: 4 }).instances, 4);
  assert.equal(cfg("database").instances, 1);
  assert.equal(cfg("database", { replicas: 2 }).instances, 3);
  assert.equal(cfg("server", { replicas: 2.9 }).instances, 2);
  assert.equal(cfg("server", { replicas: 0 }).instances, 1);
  assert.equal(cfg("server", { replicas: -3 }).instances, 1);
  assert.equal(cfg("server", { replicas: 1e9 }).instances, 1000);
  assert.equal(cfg("cache").hitRate, 0.7);
  assert.equal(cfg("cache", { cacheHitRate: 0.95 }).hitRate, 0.95);
  assert.equal(cfg("cache", { cacheHitRate: 7 }).hitRate, 1);
  assert.equal(cfg("server").role, roleOf("server"));
});

test("a malformed replica value is treated as missing and never throws", () => {
  const baseline = run(simple(), { requestsPerSecond: 1500 });
  for (const bad of ["abc", Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}, [], true, "3"]) {
    const g = graphOf([n("c", "client"), n("s", "server", { replicas: bad }), n("d", "database", { replicas: bad })], [e("c", "s"), e("s", "d")]);
    const result = run(g, { requestsPerSecond: 1500 });
    assert.deepEqual(result.metrics, baseline.metrics);
    assert.equal(result.overallScore, baseline.overallScore);
  }
});

test("malformed capacity and hit-rate values are ignored", () => {
  const baseline = run(withCache(), { requestsPerSecond: 8000 });
  const g = graphOf(
    withCache().nodes.map((x) => (x.id === "k" ? n("k", "cache", { cacheHitRate: "high", capacity: -5 }) : x)),
    withCache().edges,
  );
  assert.deepEqual(run(g, { requestsPerSecond: 8000 }).metrics, baseline.metrics);
});

// ---- Basic architectures ----

test("an empty architecture is not ready and scores zero", () => {
  const result = run(graphOf([], []));
  assert.equal(result.ready, false);
  assert.equal(result.overallScore, 0);
  assert.deepEqual(result.scores, { scalability: 0, reliability: 0, performance: 0, costEfficiency: 0 });
  assert.equal(result.health.status, "incomplete");
  assert.deepEqual(result.findings.map((f) => f.id), ["no-entry-point"]);
  assert.deepEqual(result.bottlenecks, []);
  assert.equal(result.metrics.estimatedMonthlyCost, 0);
  assert.equal(result.criticalPath.length, 0);
});

test("a single isolated node is not ready", () => {
  for (const type of ["server", "client", "database"]) {
    const result = run(graphOf([n("only", type)], []));
    assert.equal(result.ready, false);
    assert.equal(result.health.status, "incomplete");
    assert.equal(finding(result, "no-entry-point")?.severity, "high");
    assert.equal(result.nodes[0].reachable, false);
  }
});

test("a client connected only to another client reaches nothing", () => {
  const result = run(graphOf([n("a", "client"), n("b", "client")], [e("a", "b")]));
  assert.equal(result.ready, false);
});

test("client -> server -> database is evaluated along its real path", () => {
  const result = run(simple(), { requestsPerSecond: 1000 });
  assert.equal(result.ready, true);
  assert.deepEqual(result.criticalPath, ["c", "s", "d"]);
  assert.equal(result.metrics.requestedRps, 1000);
  assert.equal(result.metrics.effectiveRps, 1000);
  assert.equal(result.metrics.capacityRps, 2500);
  assert.equal(result.limitingNodeId, "s");
  assert.deepEqual(result.bottlenecks, []);
  assert.ok(result.nodes.every((x) => x.reachable));
  assert.equal(result.metrics.estimatedMonthlyCost, 42 + 90 + 10);
});

// ---- Capacity and bottlenecks ----

test("a load balancer with several servers adds capacity and availability", () => {
  const single = run(simple(), { requestsPerSecond: 2000 });
  const balanced = run(
    graphOf(
      [n("c", "client"), n("lb", "load-balancer"), n("s1", "server"), n("s2", "server"), n("s3", "server"), n("d", "database", { replicas: 2 })],
      [e("c", "lb"), e("lb", "s1"), e("lb", "s2"), e("lb", "s3"), e("s1", "d"), e("s2", "d"), e("s3", "d")],
    ),
    { requestsPerSecond: 2000 },
  );
  assert.ok((balanced.metrics.capacityRps ?? 0) > (single.metrics.capacityRps ?? 0));
  assert.ok(balanced.metrics.availability > single.metrics.availability);
  assert.equal(finding(balanced, "saturated-s1"), undefined);
  for (const id of ["s1", "s2", "s3"]) {
    assert.ok(Math.abs((node(balanced, id)?.demandRps ?? 0) - 2000 / 3) < 1);
  }
});

test("a single database is the bottleneck, and the bottleneck names that node", () => {
  const result = run(dbBound(), { requestsPerSecond: 8000, readRatio: 80 });
  assert.deepEqual(result.bottleneckNodeIds, ["d"]);
  assert.equal(result.limitingNodeId, "d");
  assert.equal(result.bottlenecks[0].state, "saturated");
  assert.ok(result.metrics.effectiveRps < result.metrics.requestedRps);
  // 5000 units/s, scaled by dataset size, over 2 * 20% writes + 80% reads per request.
  assert.ok(Math.abs(result.metrics.effectiveRps - 3985.5) < 0.5);
  assert.equal(finding(result, "saturated-d")?.severity, "high");
});

test("bottleneck ids always refer to real nodes, whatever they are called", () => {
  const g = graphOf(
    [n("web client", "client"), n("api::v2", "server", { replicas: 6 }), n("store/primary", "database")],
    [e("web client", "api::v2"), e("api::v2", "store/primary")],
  );
  const result = run(g, { requestsPerSecond: 9000 });
  assert.deepEqual(result.bottleneckNodeIds, ["store/primary"]);
  const ids = new Set(g.nodes.map((x) => x.id));
  for (const id of [...result.bottleneckNodeIds, ...result.criticalPath, result.limitingNodeId ?? ""]) {
    assert.ok(ids.has(id));
  }
  for (const f of result.findings) f.nodeIds.forEach((id) => assert.ok(ids.has(id)));
});

test("nothing is reported as a bottleneck far below capacity", () => {
  const result = run(simple(), { requestsPerSecond: 200 });
  assert.deepEqual(result.bottlenecks, []);
  assert.deepEqual(result.bottleneckNodeIds, []);
  assert.ok(result.limitingNodeId);
});

test("a database near capacity is reported as near-capacity, not saturated", () => {
  const result = run(dbBound(), { requestsPerSecond: 3400, readRatio: 80 });
  assert.equal(result.bottlenecks[0]?.nodeId, "d");
  assert.equal(result.bottlenecks[0]?.state, "near-capacity");
  assert.equal(result.metrics.effectiveRps, 3400);
});

test("read replicas raise capacity of a read-heavy design", () => {
  const plain = run(dbBound(), { requestsPerSecond: 8000 });
  const replicated = run(dbBound({ replicas: 3 }), { requestsPerSecond: 8000 });
  assert.ok(replicated.metrics.effectiveRps > plain.metrics.effectiveRps * 1.5);
  assert.ok(Math.abs(replicated.metrics.effectiveRps - 7971) < 1);
});

test("read replicas do little for a write-heavy load", () => {
  const plain = run(dbBound(), { requestsPerSecond: 8000, readRatio: 10 });
  const replicated = run(dbBound({ replicas: 3 }), { requestsPerSecond: 8000, readRatio: 10 });
  assert.ok(replicated.metrics.effectiveRps < plain.metrics.effectiveRps * 1.2);
});

test("a cache raises capacity a lot for a read-heavy load", () => {
  const without = run(dbBound(), { requestsPerSecond: 8000, readRatio: 90 });
  const cached = run(withCache(), { requestsPerSecond: 8000, readRatio: 90 });
  assert.ok(cached.metrics.effectiveRps > without.metrics.effectiveRps * 1.5);
  assert.ok((node(cached, "d")?.utilization ?? 1) < (node(without, "d")?.utilization ?? 0));
  assert.equal(finding(cached, "cache-opportunity"), undefined);
  assert.ok(finding(without, "cache-opportunity"));
});

test("a cache gives little or no benefit to a write-heavy load", () => {
  const without = run(dbBound(), { requestsPerSecond: 8000, readRatio: 10 });
  const cached = run(withCache(), { requestsPerSecond: 8000, readRatio: 10 });
  assert.ok(cached.metrics.effectiveRps < without.metrics.effectiveRps * 1.1);
  assert.ok(finding(cached, "cache-low-benefit-k"));
});

test("a better cache hit rate helps more", () => {
  const rate = (cacheHitRate: number) =>
    run(
      graphOf(withCache().nodes.map((x) => (x.id === "k" ? n("k", "cache", { cacheHitRate }) : x)), withCache().edges),
      { requestsPerSecond: 8000, readRatio: 90 },
    ).metrics.effectiveRps;
  assert.ok(rate(0.95) > rate(0.5));
  assert.ok(rate(0.5) > rate(0));
});

test("a read-through cache between the service and the database also offloads reads", () => {
  const g = graphOf(
    [n("c", "client"), n("s", "server", { replicas: 6 }), n("k", "cache"), n("d", "database")],
    [e("c", "s"), e("s", "k"), e("k", "d")],
  );
  const without = run(dbBound(), { requestsPerSecond: 8000, readRatio: 90 });
  const through = run(g, { requestsPerSecond: 8000, readRatio: 90 });
  assert.ok(through.metrics.effectiveRps > without.metrics.effectiveRps * 1.5);
  assert.ok((node(through, "d")?.demandRps ?? 0) > 0);
});

test("a queue lets a write-heavy design carry more, and its consumers do not cap synchronous capacity", () => {
  const queued = graphOf(
    [n("c", "client"), n("s", "server", { replicas: 6 }), n("d", "database"), n("q", "queue", { replicas: 2 }), n("w", "worker", { replicas: 10 })],
    [e("c", "s"), e("s", "d"), e("s", "q"), e("q", "w"), e("w", "d")],
  );
  const traffic = { requestsPerSecond: 8000, readRatio: 10 };
  const direct = run(dbBound(), traffic);
  const buffered = run(queued, traffic);
  assert.ok(buffered.metrics.effectiveRps > direct.metrics.effectiveRps);
  assert.ok((node(buffered, "w")?.demandRps ?? 0) > 0);
  assert.equal(buffered.bottleneckNodeIds.includes("w"), false);
  // Behind the queue the load is the smoothed 60% of the peak writes.
  assert.ok(Math.abs((node(buffered, "w")?.demandRps ?? 0) - 8000 * 0.9 * 0.6) < 1);
});

test("an undersized consumer behind a queue is reported as a growing backlog", () => {
  const g = graphOf(
    [n("c", "client"), n("s", "server", { replicas: 6 }), n("d", "database", { replicas: 3 }), n("q", "queue", { replicas: 3 }), n("w", "worker")],
    [e("c", "s"), e("s", "d"), e("s", "q"), e("q", "w"), e("w", "d")],
  );
  const result = run(g, { requestsPerSecond: 6000, readRatio: 20 });
  assert.equal(finding(result, "backlog-w")?.severity, "high");
  assert.equal(finding(result, "saturated-w"), undefined);
  assert.ok(result.scores.scalability < run(g, { requestsPerSecond: 600, readRatio: 20 }).scores.scalability);
});

test("a queue with no consumer is an architecture finding", () => {
  const g = graphOf([n("c", "client"), n("s", "server"), n("q", "queue")], [e("c", "s"), e("s", "q")]);
  const result = run(g, { readRatio: 0, requestsPerSecond: 500 });
  assert.equal(finding(result, "queue-no-consumer-q")?.category, "architecture");
});

test("the replicas property raises capacity", () => {
  const capacity = (replicas?: number) =>
    run(
      graphOf([n("c", "client"), n("s", "server", replicas ? { replicas } : undefined), n("d", "database", { replicas: 50 })], [e("c", "s"), e("s", "d")]),
      { requestsPerSecond: 100 },
    ).metrics.capacityRps ?? 0;
  assert.equal(capacity(), 2500);
  assert.equal(capacity(2), 5000);
  assert.equal(capacity(4), 10000);
  assert.ok(capacity(8) > capacity(4));
});

test("the capacity property replaces the default and costs proportionally", () => {
  const withCapacity = (capacity: number) =>
    run(graphOf([n("c", "client"), n("s", "server", { capacity }), n("d", "database", { replicas: 50 })], [e("c", "s"), e("s", "d")]), { requestsPerSecond: 100 });
  const big = withCapacity(3500);
  assert.equal(big.metrics.capacityRps, 3500);
  assert.ok(big.metrics.estimatedMonthlyCost > withCapacity(2500).metrics.estimatedMonthlyCost);
});

test("several databases share the load", () => {
  const one = run(dbBound(), { requestsPerSecond: 8000 });
  const two = run(
    graphOf([...dbBound().nodes, n("d2", "database")], [...dbBound().edges, e("s", "d2")]),
    { requestsPerSecond: 8000 },
  );
  assert.ok(two.metrics.effectiveRps > one.metrics.effectiveRps * 1.8);
  assert.ok(Math.abs((node(two, "d")?.demandRps ?? 0) - (node(two, "d2")?.demandRps ?? 1)) < 1e-6);
});

test("concurrent users can limit a connection-bound tier", () => {
  const few = run(simple(), { requestsPerSecond: 500, concurrentUsers: 1_000 });
  const many = run(simple(), { requestsPerSecond: 500, concurrentUsers: 400_000 });
  assert.equal(few.bottlenecks.length, 0);
  assert.equal(many.bottleneckNodeIds[0], "s");
  assert.ok(many.metrics.effectiveRps < 500);
});

// ---- Topology ----

test("a disconnected component is unreachable, costs money and is reported", () => {
  const g = graphOf([...simple().nodes, n("x", "cache"), n("y", "server")], simple().edges);
  const result = run(g, { requestsPerSecond: 1000 });
  assert.equal(node(result, "x")?.reachable, false);
  assert.equal(node(result, "y")?.reachable, false);
  assert.deepEqual(finding(result, "idle-components")?.nodeIds.sort(), ["x", "y"]);
  assert.equal(finding(result, "idle-components")?.category, "cost");
  assert.equal(result.metrics.capacityRps, run(simple(), { requestsPerSecond: 1000 }).metrics.capacityRps);
});

test("a database that no request can reach is reported", () => {
  const g = graphOf(simple().nodes, [e("c", "s")]);
  const result = run(g, { requestsPerSecond: 1000 });
  assert.equal(node(result, "d")?.reachable, false);
  assert.equal(finding(result, "unreachable-data-d")?.category, "architecture");
  assert.ok(result.scoring.architecturePenalty > 0);
  assert.ok(finding(result, "no-data-store"));
});

test("clients connected to something that is not a backend are flagged", () => {
  const g = graphOf([n("c", "client"), n("lb", "load-balancer")], [e("c", "lb")]);
  const result = run(g);
  assert.equal(result.ready, true);
  assert.equal(finding(result, "no-backend")?.severity, "high");
  assert.ok(result.scoring.architecturePenalty >= 8);
});

test("a client with no connection is reported next to a working one", () => {
  const g = graphOf([...simple().nodes, n("c2", "web-app")], simple().edges);
  assert.ok(finding(run(g), "entry-disconnected-c2"));
});

test("independent paths each carry their share", () => {
  const chain = (suffix: string): [N[], ReturnType<typeof e>[]] => [
    [n(`s${suffix}`, "server"), n(`d${suffix}`, "database", { replicas: 5 })],
    [e(`s${suffix}`, `d${suffix}`)],
  ];
  const [n1, e1] = chain("1");
  const [n2, e2] = chain("2");
  const parallel = graphOf([n("c", "client"), ...n1, ...n2], [e("c", "s1"), e("c", "s2"), ...e1, ...e2]);
  const single = graphOf([n("c", "client"), ...n1], [e("c", "s1"), ...e1]);
  const result = run(parallel, { requestsPerSecond: 1000 });
  assert.equal(result.metrics.capacityRps, 2 * (run(single, { requestsPerSecond: 1000 }).metrics.capacityRps ?? 0));
  assert.ok(Math.abs((node(result, "s1")?.demandRps ?? 0) - 500) < 1e-6);
  assert.ok(result.nodes.every((x) => x.reachable));
});

test("several client types share the load", () => {
  const g = graphOf(
    [n("web", "web-app"), n("mobile", "mobile-app"), n("s", "server"), n("d", "database")],
    [e("web", "s"), e("mobile", "s"), e("s", "d")],
  );
  const result = run(g, { requestsPerSecond: 1000 });
  assert.equal(node(result, "s")?.demandRps, 1000);
});

test("unnecessary components make the design cost more and score worse on cost", () => {
  const lean = run(simple(), { requestsPerSecond: 1000 });
  const padded = run(
    graphOf([...simple().nodes, n("a", "server"), n("b", "server"), n("c2", "search"), n("d2", "database")], simple().edges),
    { requestsPerSecond: 1000 },
  );
  assert.ok(padded.metrics.estimatedMonthlyCost > lean.metrics.estimatedMonthlyCost + 200);
  assert.ok(padded.scores.costEfficiency < lean.scores.costEfficiency);
  assert.ok(padded.overallScore < lean.overallScore);
  assert.equal(padded.metrics.capacityRps, lean.metrics.capacityRps);
});

test("components the traffic never reaches never improve the scores", () => {
  const base = run(simple(), { requestsPerSecond: 3000 });
  for (const type of ["cache", "load-balancer", "queue", "cdn", "server", "database", "api-gateway"]) {
    const result = run(graphOf([...simple().nodes, n("extra", type)], simple().edges), { requestsPerSecond: 3000 });
    assert.ok(result.scores.scalability <= base.scores.scalability, type);
    assert.ok(result.scores.reliability <= base.scores.reliability, type);
    assert.ok(result.scores.costEfficiency <= base.scores.costEfficiency, type);
    assert.ok(result.overallScore <= base.overallScore, type);
  }
});

test("cycles do not hang or break the evaluation", () => {
  const g = graphOf(
    [n("c", "client"), n("a", "server"), n("b", "server"), n("d", "database")],
    [e("c", "a"), e("a", "b"), e("b", "a"), e("b", "d"), e("d", "a")],
  );
  const result = run(g, { requestsPerSecond: 1000 });
  assert.equal(result.ready, true);
  assert.equal(everyNumberIsFinite(result), true);
});

test("component names and positions never change the result", () => {
  const plain = run(simple(), { requestsPerSecond: 3000 });
  const renamed = run(
    graphOf(
      simple().nodes.map((x, i) => ({ ...x, data: { ...x.data, label: `Database ${i}` }, position: { x: i * 999, y: -i } })),
      simple().edges,
    ),
    { requestsPerSecond: 3000 },
  );
  assert.equal(renamed.overallScore, plain.overallScore);
  assert.deepEqual(renamed.scores, plain.scores);
  assert.deepEqual(renamed.metrics, plain.metrics);
  assert.deepEqual(renamed.bottleneckNodeIds, plain.bottleneckNodeIds);
});

test("the same graph in a different node order gives the same scores", () => {
  const g = redundant();
  const shuffled = graphOf([...g.nodes].reverse(), [...g.edges].reverse());
  const a = run(g, { requestsPerSecond: 3000 });
  const b = run(shuffled, { requestsPerSecond: 3000 });
  assert.deepEqual(a.scores, b.scores);
  assert.deepEqual(a.metrics, b.metrics);
});

// ---- Latency ----

test("latency rises as the design is pushed past its capacity", () => {
  const p95 = (requestsPerSecond: number) => run(simple(), { requestsPerSecond }).metrics.p95LatencyMs;
  const sweep = [100, 500, 1500, 2500, 5000, 20_000].map(p95);
  for (let i = 1; i < sweep.length; i += 1) assert.ok(sweep[i] >= sweep[i - 1], `${sweep}`);
  assert.ok(sweep[5] > sweep[0] * 3);
});

test("a longer path is slower", () => {
  const short = run(simple(), { requestsPerSecond: 500 });
  const long = run(
    graphOf(
      [n("c", "client"), n("g", "api-gateway"), n("lb", "load-balancer"), n("s", "server"), n("a", "server"), n("d", "database")],
      [e("c", "g"), e("g", "lb"), e("lb", "s"), e("s", "a"), e("a", "d")],
    ),
    { requestsPerSecond: 500 },
  );
  assert.ok(long.metrics.p95LatencyMs > short.metrics.p95LatencyMs);
  assert.ok(long.criticalPath.length > short.criticalPath.length);
});

test("a cache takes the database out of the p95 path for a read-heavy load", () => {
  const traffic = { requestsPerSecond: 500, readRatio: 99 };
  const hitRate = { cacheHitRate: 0.99 };
  const without = run(dbBound(), traffic);
  const cached = run(
    graphOf(withCache().nodes.map((x) => (x.id === "k" ? n("k", "cache", hitRate) : x)), withCache().edges),
    { ...traffic, readRatio: 99.9 },
  );
  assert.ok(without.criticalPath.includes("d"));
  assert.equal(cached.criticalPath.includes("d"), false);
  assert.ok(cached.metrics.p95LatencyMs < without.metrics.p95LatencyMs);
});

test("a queue ends the synchronous path", () => {
  const g = graphOf(
    [n("c", "client"), n("s", "server"), n("q", "queue"), n("w", "worker"), n("d", "database")],
    [e("c", "s"), e("s", "q"), e("q", "w"), e("w", "d")],
  );
  const result = run(g, { readRatio: 0, requestsPerSecond: 200 });
  assert.deepEqual(result.criticalPath, ["c", "s", "q"]);
});

test("client network latency is part of p95", () => {
  const near = run(simple(), { requestsPerSecond: 500, networkLatencyMs: 0 });
  const far = run(simple(), { requestsPerSecond: 500, networkLatencyMs: 400 });
  assert.ok(Math.abs(far.metrics.p95LatencyMs - near.metrics.p95LatencyMs - 200) < 0.2);
});

// ---- Availability and cost ----

test("redundancy improves availability", () => {
  const traffic = { requestsPerSecond: 1000 };
  const single = run(simple(), traffic).metrics.availability;
  const replicatedServer = run(
    graphOf([n("c", "client"), n("s", "server", { replicas: 3 }), n("d", "database")], simple().edges),
    traffic,
  ).metrics.availability;
  const replicatedBoth = run(
    graphOf([n("c", "client"), n("s", "server", { replicas: 3 }), n("d", "database", { replicas: 2 })], simple().edges),
    traffic,
  ).metrics.availability;
  assert.equal(single, 99.8);
  assert.ok(replicatedServer > single);
  assert.ok(replicatedBoth > replicatedServer);
  assert.ok(run(redundant(), traffic).scores.reliability > run(simple(), traffic).scores.reliability);
});

test("a single point of failure is reported unless it runs redundantly", () => {
  const single = run(simple(), { requestsPerSecond: 500 });
  assert.ok(finding(single, "spof-s"));
  const balanced = run(redundant(), { requestsPerSecond: 500 });
  assert.equal(balanced.findings.some((f) => f.id.startsWith("spof-")), false);
});

test("the shared analysis can be told which nodes are redundant", () => {
  const input = {
    nodes: [n("c", "client"), n("s", "server"), n("d", "database")] as never[],
    edges: [e("c", "s"), e("s", "d")],
  };
  const traffic = { requestsPerSecond: 0, datasetGb: 0, readRatio: 50, networkLatencyMs: 0 };
  assert.ok(analyzeGraph(input as never, traffic).findings.some((f) => f.id === "spof-s"));
  const quiet = analyzeGraph(input as never, traffic, { redundantNodeIds: new Set(["s"]) });
  assert.equal(quiet.findings.some((f) => f.id === "spof-s"), false);
});

test("availability falls when the design cannot serve the load", () => {
  const ok = run(simple(), { requestsPerSecond: 1000 }).metrics.availability;
  const overloaded = run(simple(), { requestsPerSecond: 10_000 }).metrics.availability;
  assert.ok(overloaded < ok / 2);
});

test("cost rises with replicas and with dataset size", () => {
  const cost = (replicas: number, datasetGb = 100) =>
    run(graphOf([n("c", "client"), n("s", "server", { replicas }), n("d", "database", { replicas })], simple().edges), { datasetGb }).metrics
      .estimatedMonthlyCost;
  assert.ok(cost(2) > cost(1));
  assert.ok(cost(5) > cost(2));
  assert.ok(cost(1, 5_000) > cost(1, 100));
  // One server plus a database with one read replica.
  assert.equal(cost(1, 0), 42 + 2 * 90);
});

test("every component adds its own cost, including ones nothing reaches", () => {
  const result = run(simple(), { datasetGb: 0 });
  assert.equal(
    result.metrics.estimatedMonthlyCost,
    result.nodes.reduce((sum, x) => sum + x.monthlyCost, 0),
  );
});

// ---- Findings and recommendations ----

test("findings have stable, unique ids that name their node", () => {
  const traffic = { requestsPerSecond: 8000 };
  const a = run(dbBound(), traffic);
  const b = run(dbBound(), traffic);
  assert.deepEqual(a.findings.map((f) => f.id), b.findings.map((f) => f.id));
  assert.equal(new Set(a.findings.map((f) => f.id)).size, a.findings.length);
  assert.ok(finding(a, "saturated-d"));
  assert.ok(finding(a, "database-redundancy-d"));
  assert.ok(finding(a, "cache-opportunity"));
});

test("findings have a consistent shape", () => {
  const categories = ["scalability", "reliability", "performance", "cost", "architecture"];
  const severities = ["high", "medium", "low"];
  for (const g of [simple(), dbBound(), withCache(), redundant(), graphOf([n("c", "client"), n("lb", "load-balancer")], [e("c", "lb")])]) {
    for (const f of run(g, { requestsPerSecond: 9000 }).findings) {
      assert.ok(categories.includes(f.category));
      assert.ok(severities.includes(f.severity));
      assert.ok(f.title && f.message && f.recommendation);
      assert.ok(Array.isArray(f.nodeIds));
    }
  }
});

test("findings are ordered most severe first", () => {
  const order = { high: 0, medium: 1, low: 2 } as const;
  const ranks = run(simple(), { requestsPerSecond: 9000 }).findings.map((f) => order[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y));
});

test("every recommendation traces to a finding, one per finding, in the same order", () => {
  const result = run(simple(), { requestsPerSecond: 9000 });
  assert.equal(result.recommendations.length, result.findings.length);
  result.recommendations.forEach((recommendation, index) => {
    const source = result.findings[index];
    assert.equal(recommendation.findingId, source.id);
    assert.equal(recommendation.text, source.recommendation);
    assert.deepEqual(recommendation.nodeIds, source.nodeIds);
    assert.equal(recommendation.severity, source.severity);
  });
  assert.equal(new Set(result.recommendations.map((r) => r.id)).size, result.recommendations.length);
});

test("advice depends on the problem: write-heavy databases are not told to add replicas", () => {
  const read = run(dbBound(), { requestsPerSecond: 8000, readRatio: 90 });
  const write = run(dbBound(), { requestsPerSecond: 8000, readRatio: 10 });
  assert.match(finding(read, "saturated-d")?.recommendation ?? "", /replica|cache/i);
  assert.match(finding(write, "saturated-d")?.recommendation ?? "", /queue|split/i);
});

test("an overloaded design is told which component to scale", () => {
  const result = run(simple(), { requestsPerSecond: 9000 });
  assert.match(finding(result, "saturated-s")?.recommendation ?? "", /instances|replicas/i);
});

test("slow designs get a latency finding that names the path", () => {
  const result = run(simple(), { requestsPerSecond: 5000, networkLatencyMs: 300 });
  const slow = finding(result, "slow-requests");
  assert.ok(slow);
  assert.equal(slow.category, "performance");
  assert.ok(slow.nodeIds.includes("s"));
});

test("an over-provisioned design is flagged as a cost finding", () => {
  const g = graphOf([n("c", "client"), n("s", "server", { replicas: 20 }), n("d", "database", { replicas: 3 })], simple().edges);
  assert.equal(finding(run(g, { requestsPerSecond: 200 }), "overprovisioned-s")?.category, "cost");
});

// ---- Scores ----

test("all scores are whole numbers from 0 to 100 across many scenarios", () => {
  const graphs = [simple(), dbBound(), withCache(), redundant(), graphOf([], []), graphOf([n("a", "server")], [])];
  const loads = [0, 1, 100, 1_000, 10_000, 1_000_000, 10_000_000];
  for (const g of graphs) {
    for (const requestsPerSecond of loads) {
      for (const readRatio of [0, 50, 100]) {
        const result = run(g, { requestsPerSecond, readRatio, datasetGb: requestsPerSecond / 10, networkLatencyMs: readRatio * 20 });
        for (const score of [result.overallScore, ...Object.values(result.scores)]) {
          assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `${score}`);
        }
        assert.equal(everyNumberIsFinite(result), true);
      }
    }
  }
});

test("the overall score is the weighted average of the category scores minus the architecture penalty", () => {
  for (const g of [simple(), redundant(), graphOf(simple().nodes, [e("c", "s")]), graphOf([n("c", "client"), n("lb", "load-balancer")], [e("c", "lb")])]) {
    const result = run(g, { requestsPerSecond: 3000 });
    const { scores, scoring } = result;
    const weighted =
      scores.scalability * SCORE_WEIGHTS.scalability +
      scores.reliability * SCORE_WEIGHTS.reliability +
      scores.performance * SCORE_WEIGHTS.performance +
      scores.costEfficiency * SCORE_WEIGHTS.costEfficiency;
    assert.equal(result.overallScore, Math.max(0, Math.round(weighted - scoring.architecturePenalty)));
    assert.deepEqual(scoring.weights, SCORE_WEIGHTS);
  }
  assert.ok(Math.abs(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("a design that handles the load scores higher than one that cannot", () => {
  const traffic = { requestsPerSecond: 6000 };
  const weak = run(simple(), traffic);
  const strong = run(redundant(), traffic);
  assert.ok(strong.scores.scalability > weak.scores.scalability);
  assert.ok(strong.overallScore > weak.overallScore);
});

test("scalability falls as load grows against a fixed design", () => {
  const score = (requestsPerSecond: number) => run(simple(), { requestsPerSecond }).scores.scalability;
  assert.equal(score(500), 100);
  assert.ok(score(2000) < score(500));
  assert.ok(score(5000) < score(2000));
  assert.ok(score(50_000) < score(5000));
});

test("performance score falls as latency rises", () => {
  const score = (networkLatencyMs: number) => run(simple(), { requestsPerSecond: 500, networkLatencyMs }).scores.performance;
  assert.ok(score(0) >= score(500));
  assert.ok(score(500) > score(5000));
});

// ---- Health ----

test("a well-sized redundant design is healthy", () => {
  const result = run(redundant(), { requestsPerSecond: 3000, readRatio: 70 });
  assert.equal(result.health.status, "healthy");
  assert.deepEqual(result.health.reasons, []);
});

test("a design close to its limits, or with single instances, is a warning", () => {
  const nearLimit = run(redundant(), { requestsPerSecond: 5000 });
  assert.equal(nearLimit.health.status, "warning");
  assert.ok(nearLimit.health.reasons.length > 0);

  const singles = run(simple(), { requestsPerSecond: 1000 });
  assert.equal(singles.health.status, "warning");
  assert.match(singles.health.reasons.join(" "), /Availability/);
});

test("an overloaded design is critical and says why", () => {
  const result = run(simple(), { requestsPerSecond: 20_000 });
  assert.equal(result.health.status, "critical");
  assert.match(result.health.reasons[0], /capacity/);
});

test("very slow responses or very low availability are critical on their own", () => {
  assert.equal(run(simple(), { requestsPerSecond: 100, networkLatencyMs: 5000 }).health.status, "critical");
  const chain = graphOf(
    [n("c", "client"), n("a", "api-gateway"), n("s", "server"), n("t", "auth"), n("d", "database")],
    [e("c", "a"), e("a", "s"), e("s", "t"), e("s", "d")],
  );
  assert.notEqual(run(chain, { requestsPerSecond: 100 }).health.status, "incomplete");
});

test("health is incomplete when nothing is reachable", () => {
  assert.equal(run(graphOf([n("a", "server")], [])).health.status, "incomplete");
});

// ---- Robustness ----

test("identical inputs give identical results", () => {
  const input = { graph: redundant(), traffic: { requestsPerSecond: 4321, readRatio: 63 } };
  assert.deepEqual(evaluateArchitecture(input as never), evaluateArchitecture(input as never));
  assert.equal(JSON.stringify(evaluateArchitecture(input as never)), JSON.stringify(evaluateArchitecture(input as never)));
});

test("the input is never modified", () => {
  const input = deepFreeze({
    graph: graphOf(
      [n("c", "client"), n("s", "server", { replicas: 2 }), n("d", "database"), n("x", "cache")],
      [e("c", "s"), e("s", "d"), e("s", "x"), e("s", "ghost")],
    ),
    traffic: { requestsPerSecond: 7000, readRatio: 85 },
  });
  const before = JSON.stringify(input);
  assert.doesNotThrow(() => evaluateArchitecture(input as never));
  assert.equal(JSON.stringify(input), before);
});

test("the result is plain serializable data", () => {
  const result = run(redundant(), { requestsPerSecond: 3000 });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(result.modelVersion, 1);
});

test("garbage input does not throw", () => {
  const inputs: unknown[] = [
    undefined,
    null,
    {},
    { graph: null },
    { graph: { nodes: "x", edges: 5 } },
    { graph: { nodes: [null, 1, {}, { id: 1 }, { id: "a", data: null }, { id: "a", data: { type: "spaceship" } }], edges: [null, {}, { source: 1 }] } },
    { graph: simple(), traffic: "fast" },
  ];
  for (const input of inputs) {
    const result = evaluateArchitecture(input as never);
    assert.equal(everyNumberIsFinite(result), true);
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  }
});

test("unknown component types and edges to missing nodes are ignored", () => {
  const g = graphOf(
    [...simple().nodes, n("odd", "teleporter")],
    [...simple().edges, e("s", "odd"), e("s", "missing"), e("missing", "d"), e("s", "s")],
  );
  assert.deepEqual(run(g, { requestsPerSecond: 800 }).metrics, run(simple(), { requestsPerSecond: 800 }).metrics);
});

test("a very large graph is evaluated quickly and without errors", () => {
  const nodes: N[] = [n("c", "client"), n("lb", "load-balancer", { replicas: 50 }), n("db", "database", { replicas: 20 })];
  const edges = [e("c", "lb")];
  for (let i = 0; i < 1_500; i += 1) {
    nodes.push(n(`s${i}`, "server", { replicas: 2 }));
    edges.push(e("lb", `s${i}`), e(`s${i}`, "db"));
  }
  for (let i = 0; i < 500; i += 1) nodes.push(n(`idle${i}`, "cache"));

  const started = Date.now();
  const result = run(graphOf(nodes, edges), { requestsPerSecond: 1_000_000 });
  assert.ok(Date.now() - started < 5_000);
  assert.equal(result.ready, true);
  assert.equal(result.nodes.length, nodes.length);
  assert.equal(everyNumberIsFinite(result), true);
  assert.ok(result.findings.length > 0);
});

test("a very deep chain does not overflow the stack", () => {
  const nodes: N[] = [n("c", "client")];
  const edges: { source: string; target: string }[] = [];
  for (let i = 0; i < 5_000; i += 1) {
    nodes.push(n(`h${i}`, "server"));
    edges.push(e(i === 0 ? "c" : `h${i - 1}`, `h${i}`));
  }
  const result = run(graphOf(nodes, edges), { requestsPerSecond: 100 });
  assert.equal(result.ready, true);
  assert.ok(result.findings.some((f) => f.id === "long-request-path"));
});

test("a client that fans out to many components still gets a latency", () => {
  const nodes: N[] = [n("c", "client")];
  const edges: { source: string; target: string }[] = [];
  for (let i = 0; i < 60; i += 1) {
    nodes.push(n(`s${i}`, "server"));
    edges.push(e("c", `s${i}`));
  }
  const result = run(graphOf(nodes, edges), { requestsPerSecond: 600, networkLatencyMs: 800 });
  assert.ok(result.metrics.p95LatencyMs > 400);
  assert.doesNotThrow(() => result.findings.map((f) => f.title));
});
