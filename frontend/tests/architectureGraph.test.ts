import assert from "node:assert/strict";
import test from "node:test";

import {
  canReachAny,
  createDirectedGraph,
  reachableFrom,
} from "../src/screens/workspace/architectureGraph.ts";

test("reachableFrom ignores orphaned components", () => {
  const graph = createDirectedGraph(
    ["client", "gateway", "service", "db", "redis"],
    [
      { from: "client", to: "gateway" },
      { from: "gateway", to: "service" },
      { from: "service", to: "db" },
    ],
  );

  assert.deepEqual(
    [...reachableFrom(graph, ["client"])].sort(),
    ["client", "db", "gateway", "service"],
  );
});

test("canReachAny distinguishes useful cache placement from a dead-end cache", () => {
  const useful = createDirectedGraph(
    ["client", "service", "cache", "db"],
    [
      { from: "client", to: "service" },
      { from: "service", to: "cache" },
      { from: "cache", to: "db" },
    ],
  );
  const deadEnd = createDirectedGraph(
    ["client", "service", "cache", "db"],
    [
      { from: "client", to: "service" },
      { from: "service", to: "db" },
      { from: "db", to: "cache" },
    ],
  );

  assert.equal(canReachAny(useful, "cache", new Set(["db"])), true);
  assert.equal(canReachAny(deadEnd, "cache", new Set(["db"])), false);
});
