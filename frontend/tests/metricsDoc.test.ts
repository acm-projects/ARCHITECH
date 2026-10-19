import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { COMPONENT_IMPLEMENTATIONS } from "../src/lib/architecture/componentLibrary.ts";
import { ASSUMPTIONS } from "../src/lib/architecture/evaluation/capabilities.ts";
import { renderMetricsDoc } from "../src/lib/architecture/evaluation/metricsDoc.ts";
import { SCORE_WEIGHTS } from "../src/lib/architecture/evaluation/scoring.ts";

// docs/metrics-model.md documents the engine's assumptions; it is generated from the engine.

test("docs/metrics-model.md is up to date with the engine (run npm run docs:metrics)", () => {
  const onDisk = readFileSync(new URL("../../docs/metrics-model.md", import.meta.url), "utf8");
  assert.equal(onDisk, renderMetricsDoc());
});

test("the document covers every technology, the weights and the assumptions", () => {
  const doc = renderMetricsDoc();
  for (const implementation of COMPONENT_IMPLEMENTATIONS.filter((i) => i.componentType !== "custom")) assert.ok(doc.includes(implementation.name), implementation.name);
  for (const name of ["PostgreSQL", "MongoDB", "Redis", "Memcached"]) assert.ok(doc.includes(name));
  const weights = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(weights - 1) < 1e-9, "weights add up to 1");
  assert.match(doc, new RegExp(`${ASSUMPTIONS.latencyKneePercent}% utilization`));
  assert.match(doc, /\| Scalability \| 30% \|/);
});
