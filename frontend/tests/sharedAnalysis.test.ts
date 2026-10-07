import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeGraph,
  roleOf,
  type TrafficInputs,
} from "../src/lib/architecture/analysis.ts";
import type { GraphNode } from "../src/lib/architecture/graph.ts";
import type {
  ArchitectureNodeType,
  NodeProperties,
} from "../src/lib/architecture/types.ts";

const n = (
  id: string,
  type: ArchitectureNodeType,
  label?: string,
  properties?: NodeProperties,
): GraphNode => ({ id, data: { type, label, properties } });
const e = (source: string, target: string) => ({ source, target });

const traffic: TrafficInputs = {
  requestsPerSecond: 5_000,
  datasetGb: 100,
  readRatio: 60,
  networkLatencyMs: 40,
};

// Client -> Gateway -> Service -> Queue -> Database, like the old fixed core graph, but
// expressed as plain nodes so every case below can reshape it freely.
const core = {
  nodes: [
    n("c", "client", "Web Client"),
    n("g", "api-gateway", "API Gateway"),
    n("s", "server", "Checkout Service"),
    n("q", "queue", "Message Queue"),
    n("d", "database", "PostgreSQL"),
  ],
  edges: [e("c", "g"), e("g", "s"), e("g", "q"), e("q", "d")],
};

const find = (result: ReturnType<typeof analyzeGraph>, id: string) =>
  result.findings.find((finding) => finding.id === id);

test("analysis stays quiet until enough topology is connected", () => {
  const result = analyzeGraph(
    { nodes: core.nodes, edges: [e("c", "g")] },
    traffic,
  );
  assert.equal(result.ready, false);
  assert.equal(result.edgeCount, 1);
  assert.deepEqual(result.findings, []);
});

test("an empty graph is not ready and does not throw", () => {
  const result = analyzeGraph({ nodes: [], edges: [] }, traffic);
  assert.equal(result.ready, false);
  assert.equal(result.nodeCount, 0);
});

test("flags direct client-to-database connections", () => {
  const result = analyzeGraph(
    { nodes: core.nodes, edges: [...core.edges, e("c", "d")] },
    traffic,
  );
  const finding = find(result, "connection-c->d");
  assert.equal(finding?.category, "Questionable connection");
  assert.deepEqual(finding?.nodeIds, ["c", "d"]);
  assert.deepEqual(finding?.components, ["Web Client", "PostgreSQL"]);
});

test("flags a repeated edge as a low-severity connection finding", () => {
  const result = analyzeGraph(
    { nodes: core.nodes, edges: [...core.edges, e("c", "g")] },
    traffic,
  );
  const finding = find(result, "connection-c->g");
  assert.equal(finding?.severity, "low");
  assert.equal(result.edgeCount, 4);
});

test("surfaces a cache opportunity for read-heavy traffic", () => {
  const result = analyzeGraph(core, { ...traffic, readRatio: 85 });
  const finding = find(result, "cache-opportunity");
  assert.equal(finding?.category, "Cache opportunity");
  assert.equal(finding?.severity, "medium");
});

test("a connected cache removes the cache opportunity", () => {
  const result = analyzeGraph(
    {
      nodes: [...core.nodes, n("k", "cache", "Redis")],
      edges: [...core.edges, e("s", "k"), e("k", "d")],
    },
    { ...traffic, readRatio: 85 },
  );
  assert.equal(find(result, "cache-opportunity"), undefined);
});

test("catches high write load without a queue", () => {
  const result = analyzeGraph(
    {
      nodes: core.nodes.filter((node) => node.id !== "q"),
      edges: [e("c", "g"), e("g", "s"), e("s", "d")],
    },
    { ...traffic, readRatio: 30, requestsPerSecond: 10_000 },
  );
  const finding = find(result, "write-scaling-risk");
  assert.equal(finding?.category, "Scaling risk");
  assert.ok(finding?.nodeIds.includes("d"));
  assert.ok(finding?.nodeIds.includes("s"));
});

test("observed effective load, not requested load, drives capacity findings", () => {
  const input = {
    nodes: core.nodes.filter((node) => node.id !== "q"),
    edges: [e("c", "g"), e("g", "s"), e("s", "d")],
  };
  const requested = { ...traffic, readRatio: 30, requestsPerSecond: 10_000 };
  assert.ok(find(analyzeGraph(input, requested), "write-scaling-risk"));

  const throttled = analyzeGraph(input, {
    ...requested,
    observed: { effectiveRps: 4_000, p95LatencyMs: 60, monthlyCost: 200 },
  });
  assert.equal(find(throttled, "write-scaling-risk"), undefined);
});

test("reports components that are not connected (disconnected architecture)", () => {
  const result = analyzeGraph(
    { nodes: [...core.nodes, n("k", "cache", "Redis")], edges: core.edges },
    traffic,
  );
  const finding = find(result, "orphaned-components");
  assert.equal(finding?.category, "Topology");
  assert.deepEqual(finding?.nodeIds, ["k"]);
  assert.equal(result.connectedNodeCount, 5);
  assert.equal(result.nodeCount, 6);
});

test("two separate islands are both counted and the orphans reported", () => {
  const result = analyzeGraph(
    {
      nodes: [
        n("c", "client"),
        n("s", "server"),
        n("d", "database"),
        n("c2", "client"),
        n("s2", "server"),
        n("lone", "cache"),
      ],
      edges: [e("c", "s"), e("s", "d")],
    },
    traffic,
  );
  assert.deepEqual(find(result, "orphaned-components")?.nodeIds, ["c2", "s2", "lone"]);
});

test("multiple components of the same type are handled independently", () => {
  const result = analyzeGraph(
    {
      nodes: [
        n("c", "client"),
        n("lb", "load-balancer"),
        n("s1", "server", "API 1"),
        n("s2", "server", "API 2"),
        n("s3", "server", "API 3"),
        n("d", "database"),
      ],
      edges: [e("c", "lb"), e("lb", "s1"), e("lb", "s2"), e("lb", "s3"), e("s1", "d"), e("s2", "d"), e("s3", "d")],
    },
    { ...traffic, requestsPerSecond: 12_000 },
  );
  // Three servers behind one balancer: capacity is fine, the balancer is the single
  // point of failure, and the repeated type does not collapse into one component.
  assert.equal(find(result, "service-scaling-risk"), undefined);
  assert.equal(find(result, "spof-lb")?.severity, "high");
  assert.equal(result.nodeCount, 6);
});

test("single point of failure names what a node cuts off", () => {
  const result = analyzeGraph(core, traffic);
  const finding = find(result, "spof-g");
  assert.equal(finding?.category, "Single point of failure");
  assert.deepEqual(finding?.nodeIds, ["g", "s", "q", "d"]);
});

test("a single database without replicas is reported, and replicas silence it", () => {
  const without = analyzeGraph(core, traffic);
  assert.ok(find(without, "database-redundancy-d"));

  const withReplicas = analyzeGraph(
    {
      nodes: core.nodes.map((node) =>
        node.id === "d" ? n("d", "database", "PostgreSQL", { replicas: 2 }) : node,
      ),
      edges: core.edges,
    },
    traffic,
  );
  assert.equal(find(withReplicas, "database-redundancy-d"), undefined);
});

test("service replicas from properties count toward capacity", () => {
  const load = { ...traffic, requestsPerSecond: 10_000 };
  const single = analyzeGraph(core, load);
  assert.ok(find(single, "service-scaling-risk"));

  const scaled = analyzeGraph(
    {
      nodes: core.nodes.map((node) =>
        node.id === "s" ? n("s", "server", "Checkout Service", { replicas: 4 }) : node,
      ),
      edges: core.edges,
    },
    load,
  );
  assert.equal(find(scaled, "service-scaling-risk"), undefined);
});

test("the observed bottleneck is reported only when it is connected and under pressure", () => {
  const observed = { effectiveRps: 12_000, p95LatencyMs: 230, monthlyCost: 300, bottleneckNodeId: "s" };
  const hot = analyzeGraph(core, { ...traffic, observed });
  const finding = find(hot, "bottleneck-s");
  assert.equal(finding?.severity, "high");

  const calm = analyzeGraph(core, {
    ...traffic,
    observed: { ...observed, effectiveRps: 1_000, p95LatencyMs: 50 },
  });
  assert.equal(find(calm, "bottleneck-s"), undefined);

  const unknown = analyzeGraph(core, { ...traffic, observed: { ...observed, bottleneckNodeId: "ghost" } });
  assert.equal(unknown.findings.some((f) => f.category === "Bottleneck"), false);
});

test("a long client-to-data path is flagged only under latency or cost pressure", () => {
  const input = {
    nodes: [
      n("c", "client"),
      n("g", "api-gateway"),
      n("s", "server"),
      n("w", "worker"),
      n("d", "database"),
    ],
    edges: [e("c", "g"), e("g", "s"), e("s", "w"), e("w", "d")],
  };
  assert.equal(find(analyzeGraph(input, traffic), "expensive-path"), undefined);

  const slow = find(analyzeGraph(input, { ...traffic, networkLatencyMs: 200 }), "expensive-path");
  assert.equal(slow?.category, "Expensive path");
  assert.deepEqual(slow?.nodeIds, ["c", "g", "s", "w", "d"]);
});

test("components are judged by type, not by what they are called", () => {
  const renamed = analyzeGraph(
    {
      nodes: [
        n("c", "client", "Database"),
        n("g", "api-gateway", "Client"),
        n("d", "database", "Gateway"),
      ],
      edges: [e("c", "g"), e("g", "d")],
    },
    traffic,
  );
  assert.ok(find(renamed, "connection-g->d"));
  assert.equal(find(renamed, "connection-c->g"), undefined);
});

test("every component type maps to a role", () => {
  assert.equal(roleOf("web-app"), "entry");
  assert.equal(roleOf("object-storage"), "storage");
  assert.equal(roleOf("worker"), "compute");
});

test("analysis is deterministic and does not modify its input", () => {
  const input = {
    nodes: [...core.nodes, n("k", "cache")],
    edges: [...core.edges],
  };
  const snapshot = JSON.stringify(input);
  const first = analyzeGraph(input, { ...traffic, readRatio: 85 });
  const second = analyzeGraph(input, { ...traffic, readRatio: 85 });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), snapshot);
});

test("findings are ordered by severity and capped", () => {
  const result = analyzeGraph(core, {
    ...traffic,
    requestsPerSecond: 13_000,
    readRatio: 20,
    datasetGb: 800,
    networkLatencyMs: 300,
  });
  const order = { high: 0, medium: 1, low: 2 } as const;
  const ranks = result.findings.map((finding) => order[finding.severity]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.ok(result.findings.length <= 10);
});

test("non-finite traffic inputs are treated as zero rather than propagating", () => {
  const result = analyzeGraph(core, {
    requestsPerSecond: Number.NaN,
    datasetGb: Number.POSITIVE_INFINITY,
    readRatio: Number.NaN,
    networkLatencyMs: Number.NaN,
  });
  assert.equal(result.ready, true);
  for (const finding of result.findings) assert.ok(!finding.detail.includes("NaN"));
});
