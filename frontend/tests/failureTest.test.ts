import assert from "node:assert/strict";
import test from "node:test";

import { failureImpact } from "../src/lib/architecture/evaluation/failure.ts";
import { createEvaluationCache } from "../src/lib/architecture/evaluation/liveMetrics.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { liveTargets } from "../src/lib/architecture/challenge/targets.ts";
import { urlShortenerDefinition } from "../src/components/challenge/challenges.ts";

// Failure test: one component down, the rest of the design carrying on without it.

const node = (id: string, type: string) => ({ id, type: "architecture", position: { x: 0, y: 0 }, data: { type, label: id } });
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });
const traffic = { requestsPerSecond: 1_000, staticShare: 0 };

const single = () => ({
  nodes: [node("client", "client"), node("api", "server"), node("db", "database")],
  edges: [edge("client", "api"), edge("api", "db")],
});

test("losing the only database takes every request down", () => {
  const impact = failureImpact(single(), traffic, "db", createEvaluationCache());
  assert.ok(impact);
  assert.equal(impact.servedPercent, 0);
  assert.deepEqual(impact.takeover, []);
  assert.equal(impact.remaining, null);
});

test("a replica takes over when the primary database goes down", () => {
  const design = single();
  design.nodes.push(node("replica", "database"));
  design.edges.push(edge("api", "replica"));
  const impact = failureImpact(design, traffic, "db", createEvaluationCache());
  assert.ok(impact);
  assert.equal(impact.servedPercent, 100);
  assert.deepEqual(impact.takeover, ["replica"]);
  assert.ok(impact.remaining && impact.remaining.capacityRps !== 0);
});

test("a second server behind a load balancer keeps requests flowing", () => {
  const design = {
    nodes: [node("client", "client"), node("lb", "load-balancer"), node("api-1", "server"), node("api-2", "server"), node("db", "database")],
    edges: [edge("client", "lb"), edge("lb", "api-1"), edge("lb", "api-2"), edge("api-1", "db"), edge("api-2", "db")],
  };
  const impact = failureImpact(design, traffic, "api-1", createEvaluationCache());
  assert.ok(impact);
  assert.equal(impact.servedPercent, 100);
  assert.deepEqual(impact.takeover, ["api-2"]);
});

test("a cache in front of a lost database still answers the reads it holds", () => {
  const design = {
    nodes: [node("client", "client"), node("api", "server"), node("cache", "cache"), node("db", "database")],
    edges: [edge("client", "api"), edge("api", "cache"), edge("cache", "db")],
  };
  const impact = failureImpact(design, traffic, "db", createEvaluationCache());
  assert.ok(impact);
  assert.ok(impact.servedPercent > 0 && impact.servedPercent < 100, `served ${impact.servedPercent}%`);
});

test("clients and unknown components cannot be failed", () => {
  assert.equal(failureImpact(single(), traffic, "client", createEvaluationCache()), null);
  assert.equal(failureImpact(single(), traffic, "missing", createEvaluationCache()), null);
});

test("challenge targets read the design live with the grader's own checks", () => {
  const evaluation = evaluateArchitecture({ graph: single() as never, traffic: urlShortenerDefinition.traffic });
  const targets = liveTargets(urlShortenerDefinition, evaluation);
  assert.deepEqual(targets.map((target) => target.id), ["capacity", "fast-redirects", "available", "budget"]);
  assert.equal(targets.find((target) => target.id === "capacity")?.met, false, "one server cannot take 11,500 req/s");
  assert.equal(targets.find((target) => target.id === "budget")?.met, true);
});
