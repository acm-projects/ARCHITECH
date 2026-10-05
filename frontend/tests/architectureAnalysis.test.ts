import assert from "node:assert/strict";
import test from "node:test";

import { analyzeArchitecture } from "../src/screens/workspace/architectureAnalysis.ts";

const baseInput = {
  names: ["Web Client", "API Gateway", "Checkout Service", "Message Queue", "PostgreSQL"],
  deletedNodes: [] as string[],
  deletedEdges: [] as string[],
  addedComponents: [],
  userConnections: [],
  nodeProperties: {},
  traffic: 5_000,
  dataset: 100,
  readRatio: 60,
  networkLatency: 40,
  effectiveTraffic: 5_000,
  p95Latency: 70,
  monthlyCost: 300,
  bottleneckId: "service" as const,
};

test("analysis stays quiet until enough topology is connected", () => {
  const result = analyzeArchitecture({
    ...baseInput,
    deletedNodes: ["service", "queue", "db"],
  });

  assert.equal(result.ready, false);
  assert.equal(result.edgeCount, 1);
  assert.deepEqual(result.findings, []);
});

test("analysis flags direct client-to-database connections", () => {
  const result = analyzeArchitecture({
    ...baseInput,
    userConnections: [{ from: "client", to: "db" }],
  });

  const finding = result.findings.find(
    (item) => item.id === "connection-0",
  );

  assert.equal(finding?.category, "Questionable connection");
  assert.deepEqual(finding?.nodeIds, ["client", "db"]);
});

test("analysis surfaces a cache opportunity for read-heavy traffic", () => {
  const result = analyzeArchitecture({
    ...baseInput,
    readRatio: 85,
  });

  const finding = result.findings.find(
    (item) => item.id === "cache-opportunity",
  );

  assert.equal(finding?.category, "Cache opportunity");
  assert.equal(finding?.severity, "medium");
});

test("analysis reports orphaned components that do not participate in the graph", () => {
  const result = analyzeArchitecture({
    ...baseInput,
    addedComponents: [{ id: "cache-1", name: "Redis" }],
  });

  const finding = result.findings.find(
    (item) => item.id === "orphaned-components",
  );

  assert.equal(finding?.category, "Topology");
  assert.deepEqual(finding?.nodeIds, ["cache-1"]);
});

test("analysis catches high write load without a queue", () => {
  const result = analyzeArchitecture({
    ...baseInput,
    deletedNodes: ["queue"],
    userConnections: [{ from: "service", to: "db" }],
    readRatio: 30,
    effectiveTraffic: 10_000,
  });

  const finding = result.findings.find(
    (item) => item.id === "write-scaling-risk",
  );

  assert.equal(finding?.category, "Scaling risk");
  assert.ok(finding?.nodeIds.includes("db"));
  assert.ok(finding?.nodeIds.includes("service"));
});
