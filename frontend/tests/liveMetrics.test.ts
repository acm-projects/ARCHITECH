import assert from "node:assert/strict";
import test from "node:test";

import { createEvaluationCache, liveChanges, summarize } from "../src/lib/architecture/evaluation/liveMetrics.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";

// Live metrics: re-evaluating while the design is edited, memoized by fingerprint.

const node = (id: string, type: string, extra: Record<string, unknown> = {}, position = { x: 0, y: 0 }) => ({
  id, type: "architecture", position, data: { type, label: id, ...extra },
});
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });
const design = () => ({
  nodes: [node("client-1", "client"), node("server-1", "server"), node("database-1", "database")],
  edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
});
const traffic = { requestsPerSecond: 1_000 };

test("the same design is evaluated once; moving, renaming or reordering does not re-evaluate", () => {
  const cache = createEvaluationCache();
  const first = cache.get(design(), traffic);
  assert.equal(cache.evaluations, 1);

  const moved = design();
  moved.nodes[1].position = { x: 400, y: 120 };
  moved.nodes[1].data.label = "Orders API";
  moved.nodes.reverse();
  const again = cache.get(moved, traffic);
  assert.equal(cache.evaluations, 1, "positions, names and order are not part of the fingerprint");
  assert.equal(again, first);

  const scaled = design();
  (scaled.nodes[1].data as Record<string, unknown>).properties = { replicas: 3 };
  assert.notEqual(cache.get(scaled, traffic).fingerprint, first.fingerprint);
  assert.equal(cache.evaluations, 2);
  cache.get(design(), traffic);
  assert.equal(cache.evaluations, 2, "going back (undo) reuses the earlier result");
  cache.get(design(), { requestsPerSecond: 5_000 });
  assert.equal(cache.evaluations, 3, "traffic is part of the identity");
});

test("the cache keeps only the most recently used designs", () => {
  const cache = createEvaluationCache(2);
  const withReplicas = (replicas: number) => {
    const d = design();
    (d.nodes[1].data as Record<string, unknown>).properties = { replicas };
    return d;
  };
  cache.get(withReplicas(1), traffic);
  cache.get(withReplicas(2), traffic);
  cache.get(withReplicas(1), traffic); // used again: now the newest
  cache.get(withReplicas(3), traffic); // evicts replicas 2
  assert.equal(cache.size, 2);
  const before = cache.evaluations;
  cache.get(withReplicas(1), traffic);
  assert.equal(cache.evaluations, before, "still cached");
  cache.get(withReplicas(2), traffic);
  assert.equal(cache.evaluations, before + 1, "was evicted");
});

test("the summary carries the headline numbers and the main problem", () => {
  const evaluation = evaluateArchitecture({ graph: design() as never, traffic });
  const summary = summarize(evaluation);
  assert.equal(summary.ready, true);
  assert.equal(summary.score, evaluation.overallScore);
  assert.equal(summary.p95LatencyMs, evaluation.metrics.p95LatencyMs);
  assert.equal(summary.monthlyCost, evaluation.metrics.estimatedMonthlyCost);
  assert.equal(summary.limitingNodeId, evaluation.limitingNodeId);
  assert.ok(summary.topIssue, "a lone server and database have findings");
  const highest = evaluation.findings.some((finding) => finding.severity === "high") ? "high" : evaluation.findings[0].severity;
  assert.equal(summary.topIssue!.severity, highest);

  const empty = summarize(evaluateArchitecture({ graph: { nodes: [node("server-1", "server")], edges: [] } as never }));
  assert.equal(empty.ready, false, "nothing is reachable from a client yet");
});

test("adding a replica and a cache moves the numbers the right way", () => {
  const base = evaluateArchitecture({ graph: design() as never, traffic });
  const better = design();
  (better.nodes[1].data as Record<string, unknown>).properties = { replicas: 3 };
  const after = evaluateArchitecture({ graph: better as never, traffic });
  const changes = liveChanges(base, after);
  assert.equal(changes.monthlyCost, "regressed", "more servers cost more");
  assert.notEqual(changes.uptimePercent, "regressed", "redundancy never lowers uptime");
  assert.deepEqual(liveChanges(base, base), {
    score: "unchanged", capacityRps: "unchanged", p95LatencyMs: "unchanged", monthlyCost: "unchanged", uptimePercent: "unchanged",
  });
});

test("live evaluation stays fast enough to run after every edit", () => {
  // A big design: 200 servers behind a load balancer, each with a cache, sharing a database.
  const nodes = [node("client-1", "client"), node("lb-1", "load-balancer"), node("db-1", "database")];
  const edges = [edge("client-1", "lb-1")];
  for (let i = 0; i < 100; i += 1) {
    nodes.push(node(`s-${i}`, "server"), node(`c-${i}`, "cache"));
    edges.push(edge("lb-1", `s-${i}`), edge(`s-${i}`, `c-${i}`), edge(`s-${i}`, "db-1"));
  }
  const cache = createEvaluationCache();
  const started = performance.now();
  cache.get({ nodes, edges }, traffic);
  const cold = performance.now() - started;
  const warmStart = performance.now();
  for (let i = 0; i < 50; i += 1) cache.get({ nodes, edges }, traffic);
  const warm = (performance.now() - warmStart) / 50;
  assert.ok(cold < 150, `first evaluation took ${cold.toFixed(1)} ms`);
  assert.ok(warm < cold, `a cached lookup (${warm.toFixed(2)} ms) is cheaper than evaluating (${cold.toFixed(1)} ms)`);
});

test("what-if: every technology for a component, measured in the whole design", async () => {
  const { compareTechnologiesInDesign } = await import("../src/lib/architecture/evaluation/whatIf.ts");
  const cache = createEvaluationCache();
  const d = design();
  (d.nodes[2].data as Record<string, unknown>).implementation = "mongodb";
  const whatIf = compareTechnologiesInDesign(d, traffic, "database-1", cache)!;
  assert.ok(whatIf.ready);
  const ids = whatIf.options.map((option) => option.implementation.id);
  assert.ok(ids.includes("postgresql") && ids.includes("mongodb"), ids.join());
  assert.deepEqual(whatIf.options.filter((o) => o.current).map((o) => o.implementation.id), ["mongodb"]);
  // The current option is exactly the live design's numbers.
  const live = cache.get(d, traffic).summary;
  assert.deepEqual(whatIf.options.find((o) => o.current)!.summary, live);
  // Different technologies give different whole-design numbers.
  const costs = new Set(whatIf.options.map((o) => `${o.summary.monthlyCost}/${o.summary.p95LatencyMs}/${o.summary.uptimePercent}`));
  assert.ok(costs.size > 1, "technologies change the design's metrics");
  const evaluations = cache.evaluations;
  compareTechnologiesInDesign(d, traffic, "database-1", cache);
  assert.equal(cache.evaluations, evaluations, "reopening the card is served from the cache");

  const caches = compareTechnologiesInDesign(design(), traffic, "server-1", cache);
  assert.ok(caches && caches.options.length >= 1);
  assert.equal(compareTechnologiesInDesign(design(), traffic, "ghost", cache), null);
});
