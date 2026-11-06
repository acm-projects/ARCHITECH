import assert from "node:assert/strict";
import test from "node:test";

import {
  countConnectedNodes,
  getReachableNodes,
  hasDirectConnection,
  hasPath,
  type EvalNode,
} from "../src/components/challenge/evaluation/graph.ts";

const n = (id: string, type: EvalNode["data"]["type"]): EvalNode => ({
  id,
  data: { type },
});
const e = (source: string, target: string) => ({ source, target });

test("graph helpers", () => {
  const edges = [e("a", "b"), e("b", "c")];
  assert.ok(hasDirectConnection(edges, "a", "b"));
  assert.ok(!hasDirectConnection(edges, "b", "a"));
  assert.ok(hasPath(edges, "a", "c"));
  assert.ok(!hasPath(edges, "c", "a"));
  assert.deepEqual([...getReachableNodes(edges, "a")].sort(), ["b", "c"]);
  // Cycles terminate.
  assert.ok(hasPath([e("a", "b"), e("b", "a")], "a", "a"));
  assert.equal(
    countConnectedNodes([n("a", "client"), n("b", "server"), n("z", "cache")], edges),
    2,
  );
});
