import assert from "node:assert/strict";
import test from "node:test";

import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import {
  SIMULATION_DURATION_MS,
  evaluateDesign,
  simulationDuration,
  waitFor,
  withSimulationDelay,
} from "../src/lib/architecture/evaluation/evaluationService.ts";

const graph = {
  nodes: [
    { id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Client" } },
    { id: "server-1", type: "architecture", position: { x: 200, y: 0 }, data: { type: "server", label: "API Server" } },
  ],
  edges: [{ id: "e", source: "client-1", target: "server-1" }],
};

test("each simulation uses a three-second delay", () => {
  assert.equal(SIMULATION_DURATION_MS.min, 3_000);
  assert.equal(SIMULATION_DURATION_MS.max, 3_000);
  for (const random of [0, 0.5, 0.9999]) assert.equal(simulationDuration(() => random), 3_000);
});

test("the delayed run returns the same evaluation, after waiting the chosen time", async () => {
  const waits: number[] = [];
  const delayed = withSimulationDelay(evaluateDesign, () => 6_200, async (ms) => {
    waits.push(ms);
  });
  const result = await delayed({ projectId: null, graph: graph as never, traffic: { requestsPerSecond: 500 } as never });
  assert.deepEqual(waits, [6_200]);
  assert.deepEqual(result, evaluateArchitecture({ graph: graph as never, traffic: { requestsPerSecond: 500 } as never }));
});

test("cancelling a run stops the wait at once", async () => {
  const controller = new AbortController();
  const pending = waitFor(60_000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(waitFor(10, AbortSignal.abort()), { name: "AbortError" });
});
