import assert from "node:assert/strict";
import test from "node:test";
import { LANDING_GRAPH, runLandingSimulation } from "../src/screens/SystemStory/landingSimulation.ts";

test("landing simulation evaluates all five displayed components without changing the example", () => {
  const before = JSON.stringify(LANDING_GRAPH);
  const result = runLandingSimulation(1240);
  assert.equal(result.ready, true);
  assert.equal(result.metrics.requestedRps, 1240);
  assert.ok(result.metrics.effectiveRps > 0);
  assert.ok(result.metrics.p95LatencyMs > 0);
  assert.equal(JSON.stringify(LANDING_GRAPH), before);
  assert.equal(LANDING_GRAPH.nodes.length, 5);
});

test("landing simulation reports saturation when the same topology is overloaded", () => {
  const normal = runLandingSimulation(1240);
  const overloaded = runLandingSimulation(1_000_000);
  assert.ok(overloaded.metrics.effectiveRps < overloaded.metrics.requestedRps);
  assert.ok(overloaded.bottleneckNodeIds.length > 0);
  assert.ok(overloaded.metrics.p95LatencyMs >= normal.metrics.p95LatencyMs);
});

test("landing simulation rejects invalid traffic before evaluation", () => {
  for (const value of [NaN, Infinity, -1, 0, 10_000_001]) {
    assert.throws(() => runLandingSimulation(value), RangeError);
  }
});
