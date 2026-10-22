import assert from "node:assert/strict";
import test from "node:test";

import { buildPropertyViews } from "../src/lib/architecture/componentConfigView.ts";
import { guessActsAs, isOperationsTool, measuredNode } from "../src/lib/architecture/customComponents.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { fingerprintEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import { setComponentProperty, setCustomRole } from "../src/lib/architecture/propertyEditing.ts";
import { validateGraph } from "../src/lib/projects/projectPayload.ts";

const design = (middle: Record<string, unknown>) => ({
  nodes: [
    { id: "c", data: { type: "client", label: "c" } },
    { id: "s", data: { type: "server", label: "s", properties: { replicas: 4 } } },
    { id: "d", position: { x: 0, y: 0 }, data: { label: "d", ...middle } },
  ],
  edges: [{ source: "c", target: "s" }, { source: "s", target: "d" }],
});
const run = (graph: unknown, rps = 2_000) => evaluateArchitecture({ graph: graph as never, traffic: { requestsPerSecond: rps } });

test("a custom component acting like a database with no numbers measures exactly like one", () => {
  const custom = run(design({ type: "custom", properties: { technology: "ClickHouse", actsAs: "database" } }));
  const builtIn = run(design({ type: "database" }));
  assert.deepEqual(custom.metrics, builtIn.metrics);
  const node = custom.nodes.find((n) => n.nodeId === "d")!;
  assert.notEqual(node.capacityRps, null, "it is measured");
  assert.ok(node.monthlyCost > 0, "and costed");
});

test("its own capacity, latency, cost and uptime change the live metrics", () => {
  const base = { type: "custom", properties: { technology: "ClickHouse", actsAs: "database" } };
  const tuned = {
    type: "custom",
    properties: { technology: "ClickHouse", actsAs: "database", capacity: 50, latencyMs: 40, costPerInstance: 900, availability: 0.9 },
  };
  const a = run(design(base));
  const b = run(design(tuned));
  const node = b.nodes.find((n) => n.nodeId === "d")!;
  // One instance at its own price (not scaled by capacity), plus the database's storage.
  assert.ok(node.monthlyCost >= 900 && node.monthlyCost < 1_000, String(node.monthlyCost));
  assert.ok((b.metrics.capacityRps ?? 0) < (a.metrics.capacityRps ?? 0), "lower capacity limits the design");
  assert.ok(b.metrics.estimatedMonthlyCost > a.metrics.estimatedMonthlyCost);
  assert.notEqual(
    fingerprintEvaluationInput({ graph: design(base), traffic: { requestsPerSecond: 2_000 } }),
    fingerprintEvaluationInput({ graph: design(tuned), traffic: { requestsPerSecond: 2_000 } }),
    "the metrics cache sees the change",
  );
});

test("without a role it is still passed through unmeasured", () => {
  const node = measuredNode({ id: "x", data: { type: "custom", properties: { technology: "Zipkin" } } });
  assert.equal(node.data.type, "custom");
  const bogus = measuredNode({ id: "x", data: { type: "custom", properties: { actsAs: "client" } } });
  assert.equal(bogus.data.type, "custom", "only measurable roles");
});

test("settings appear once it acts like something, with that role's defaults", () => {
  assert.deepEqual(buildPropertyViews("custom", { technology: "Kong" }), []);
  const views = buildPropertyViews("custom", { technology: "Kong", actsAs: "api-gateway" });
  assert.deepEqual(views.map((v) => v.key), ["replicas", "capacity", "latencyMs", "costPerInstance", "availability"]);
  assert.ok(views.every((v) => !v.overridden));
});

test("changing the role keeps the name and replicas but drops the old role's numbers", () => {
  const nodes = [
    {
      id: "n",
      position: { x: 0, y: 0 },
      data: { type: "custom" as const, label: "n", properties: { technology: "Kong", actsAs: "api-gateway", replicas: 3, latencyMs: 9 } },
    },
  ];
  const result = setCustomRole(nodes, "n", "server");
  assert.ok(result.ok && result.changed);
  assert.deepEqual(result.nodes[0]!.data.properties, { technology: "Kong", actsAs: "server", replicas: 3 });
  const off = setCustomRole(result.nodes, "n", null);
  assert.ok(off.ok);
  assert.deepEqual(off.nodes[0]!.data.properties, { technology: "Kong" });
  assert.equal(setCustomRole(nodes, "n", "client").ok, false);
});

test("values are checked against the component's own role", () => {
  const nodes = [{ id: "n", position: { x: 0, y: 0 }, data: { type: "custom" as const, label: "n", properties: { actsAs: "server" } as Record<string, string | number | boolean> } }];
  assert.equal(setComponentProperty(nodes, "n", "availability", 1.5).ok, false);
  assert.equal(setComponentProperty(nodes, "n", "costPerInstance", -1).ok, false);
  const ok = setComponentProperty(nodes, "n", "costPerInstance", 120);
  assert.ok(ok.ok);
  assert.equal(ok.nodes[0]!.data.properties?.costPerInstance, 120);
});

test("saved projects accept a custom component's numbers and refuse bad ones", () => {
  const saved = (properties: Record<string, unknown>) => ({
    schemaVersion: 1,
    nodes: [{ id: "d", type: "architecture", position: { x: 0, y: 0 }, data: { label: "d", type: "custom", properties } }],
    edges: [],
  });
  assert.equal(validateGraph(saved({ technology: "X", actsAs: "cache", availability: 0.99 })).ok, true);
  assert.equal(validateGraph(saved({ technology: "X", actsAs: "cache", availability: 3 })).ok, false);
});

test("an unmodeled technology's role is guessed from its name", () => {
  assert.equal(guessActsAs("ClickHouse"), "database");
  assert.equal(guessActsAs("Traefik"), "load-balancer");
  assert.equal(guessActsAs("Kong"), "api-gateway");
  assert.equal(guessActsAs("NATS"), "queue");
  assert.equal(guessActsAs("Keycloak"), "auth");
  assert.equal(guessActsAs("snuba-consumer"), "worker");
  assert.equal(guessActsAs("customers-service"), "server");
  assert.ok(isOperationsTool("Zipkin") && isOperationsTool("discovery-server") && isOperationsTool("grafana"));
  assert.equal(isOperationsTool("api-gateway"), false);
});
