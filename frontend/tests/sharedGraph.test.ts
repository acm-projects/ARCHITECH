import assert from "node:assert/strict";
import test from "node:test";

import {
  canReachAny,
  countConnectedNodes,
  createDirectedGraph,
  findLongestPath,
  getReachableNodes,
  hasDirectConnection,
  hasPath,
  reachableFrom,
  type GraphNode,
} from "../src/lib/architecture/graph.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";

const n = (id: string, type: ArchitectureNodeType): GraphNode => ({
  id,
  data: { type },
});
const e = (source: string, target: string) => ({ source, target });
const sorted = (ids: Iterable<string>) => [...ids].sort();

test("reachableFrom ignores orphaned components", () => {
  const graph = createDirectedGraph({
    nodes: [
      n("client", "client"),
      n("gateway", "api-gateway"),
      n("service", "server"),
      n("db", "database"),
      n("redis", "cache"),
    ],
    edges: [e("client", "gateway"), e("gateway", "service"), e("service", "db")],
  });

  assert.deepEqual(sorted(reachableFrom(graph, ["client"])), [
    "client",
    "db",
    "gateway",
    "service",
  ]);
});

test("canReachAny distinguishes useful cache placement from a dead-end cache", () => {
  const nodes = [
    n("client", "client"),
    n("service", "server"),
    n("cache", "cache"),
    n("db", "database"),
  ];
  const useful = createDirectedGraph({
    nodes,
    edges: [e("client", "service"), e("service", "cache"), e("cache", "db")],
  });
  const deadEnd = createDirectedGraph({
    nodes,
    edges: [e("client", "service"), e("service", "db"), e("db", "cache")],
  });

  assert.equal(canReachAny(useful, "cache", new Set(["db"])), true);
  assert.equal(canReachAny(deadEnd, "cache", new Set(["db"])), false);
});

test("works on arbitrary ids and sizes, not a fixed set of core nodes", () => {
  const ids = Array.from({ length: 40 }, (_, index) => `server-${index + 1}`);
  const graph = createDirectedGraph({
    nodes: ids.map((id) => n(id, "server")),
    edges: ids.slice(1).map((id, index) => e(ids[index], id)),
  });
  assert.equal(reachableFrom(graph, ["server-1"]).size, 40);
  assert.equal(reachableFrom(graph, ["server-21"]).size, 20);
});

test("createDirectedGraph drops dangling edges, self-loops and repeats", () => {
  const graph = createDirectedGraph({
    nodes: [n("a", "client"), n("b", "server")],
    edges: [e("a", "b"), e("a", "b"), e("a", "ghost"), e("b", "b"), e("ghost", "a")],
  });
  assert.deepEqual(graph.edges, [e("a", "b")]);
  assert.deepEqual([...(graph.incoming.get("b") ?? [])], ["a"]);
});

test("reachableFrom can treat a node as removed", () => {
  const graph = createDirectedGraph({
    nodes: [n("c", "client"), n("s", "server"), n("d", "database")],
    edges: [e("c", "s"), e("s", "d")],
  });
  assert.deepEqual(sorted(reachableFrom(graph, ["c"], { without: "s" })), ["c"]);
  assert.deepEqual(sorted(reachableFrom(graph, ["s"], { without: "s" })), []);
});

test("a disconnected graph reaches only its own component", () => {
  const graph = createDirectedGraph({
    nodes: [n("c", "client"), n("s", "server"), n("x", "cache"), n("y", "database")],
    edges: [e("c", "s"), e("x", "y")],
  });
  assert.deepEqual(sorted(reachableFrom(graph, ["c"])), ["c", "s"]);
});

test("findLongestPath picks the longest simple path and survives cycles", () => {
  const graph = createDirectedGraph({
    nodes: [
      n("c", "client"),
      n("lb", "load-balancer"),
      n("s1", "server"),
      n("s2", "server"),
      n("d", "database"),
    ],
    edges: [e("c", "lb"), e("lb", "s1"), e("s1", "s2"), e("s2", "s1"), e("s2", "d"), e("s1", "d")],
  });
  assert.deepEqual(findLongestPath(graph, ["c"], new Set(["d"])), ["c", "lb", "s1", "s2", "d"]);
  assert.deepEqual(findLongestPath(graph, ["d"], new Set(["c"])), []);
});

test("findLongestPath stops at its visit budget", () => {
  const graph = createDirectedGraph({
    nodes: [n("c", "client"), n("s", "server"), n("d", "database")],
    edges: [e("c", "s"), e("s", "d")],
  });
  assert.deepEqual(findLongestPath(graph, ["c"], new Set(["d"]), 1), []);
});

// Edge-list helpers, also used by the Challenge evaluator.

test("getReachableNodes follows direction and includes the start only through a cycle", () => {
  const edges = [e("a", "b"), e("b", "c")];
  assert.deepEqual(sorted(getReachableNodes(edges, "a")), ["b", "c"]);
  assert.deepEqual(sorted(getReachableNodes(edges, "c")), []);
  assert.deepEqual(sorted(getReachableNodes([...edges, e("c", "a")], "a")), ["a", "b", "c"]);
});

test("hasDirectConnection and hasPath are directional", () => {
  const edges = [e("a", "b"), e("b", "c")];
  assert.equal(hasDirectConnection(edges, "a", "b"), true);
  assert.equal(hasDirectConnection(edges, "b", "a"), false);
  assert.equal(hasPath(edges, "a", "c"), true);
  assert.equal(hasPath(edges, "c", "a"), false);
});

test("countConnectedNodes counts nodes that have an edge", () => {
  const nodes = [n("a", "client"), n("b", "server"), n("c", "cache")];
  assert.equal(countConnectedNodes(nodes, [e("a", "b")]), 2);
  assert.equal(countConnectedNodes(nodes, []), 0);
});
