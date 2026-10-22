import assert from "node:assert/strict";
import test from "node:test";

import { COMPONENT_TYPES, implementationById, implementationsFor } from "../src/lib/architecture/componentLibrary.ts";
import { ASSUMPTIONS, configureNode } from "../src/lib/architecture/evaluation/capabilities.ts";
import { simulate } from "../src/lib/architecture/evaluation/simulation.ts";
import { setNodeImplementation } from "../src/lib/architecture/implementationEditing.ts";
import {
  compareTechnologiesForNode,
  compareTechnologiesForTraffic,
  formatInstances,
  formatLatency,
  formatMonthlyCost,
  formatRate,
} from "../src/lib/architecture/implementationStats.ts";
import type { ArchitectureNodeType, NodeProperties } from "../src/lib/architecture/types.ts";

const node = (id: string, type: ArchitectureNodeType, implementation?: string, properties?: NodeProperties) => ({
  id,
  position: { x: 0, y: 0 },
  data: {
    type,
    label: id,
    ...(implementation ? { implementation } : {}),
    ...(properties ? { properties } : {}),
  },
});
const traffic = (requestsPerSecond: number, datasetGb = 50) => ({
  requestsPerSecond,
  concurrentUsers: 5_000,
  datasetGb,
  readRatio: 80,
  staticShare: 0,
  networkLatencyMs: 40,
});
const design = (database?: string) => ({
  nodes: [node("c", "client"), node("s", "server", undefined, { replicas: 10 }), node("d", "database", database)],
  edges: [
    { source: "c", target: "s" },
    { source: "s", target: "d" },
  ],
});

// ---- Switching technology ----

test("switching technology keeps replicas and resets capacity and hit rate", () => {
  const nodes = [node("d", "database", undefined, { replicas: 2, capacity: 9_000 }), node("k", "cache", undefined, { cacheHitRate: 0.9 })];
  const toMysql = setNodeImplementation(nodes, "d", "mysql");
  assert.ok(toMysql.ok && toMysql.changed);
  assert.deepEqual(toMysql.nodes[0].data, { type: "database", label: "d", implementation: "mysql", properties: { replicas: 2 } });
  assert.equal(toMysql.nodes[1], nodes[1], "other nodes are untouched");
  assert.equal(nodes[0].data.implementation, undefined, "the input is not changed");

  const toMemcached = setNodeImplementation(nodes, "k", "memcached");
  assert.ok(toMemcached.ok);
  assert.deepEqual(toMemcached.nodes[1].data, { type: "cache", label: "k", implementation: "memcached" });
});

test("choosing the default removes the field; no-ops return the same array", () => {
  const nodes = [node("d", "database", "mysql")];
  const back = setNodeImplementation(nodes, "d", null);
  assert.ok(back.ok && back.changed);
  assert.equal(back.nodes[0].data.implementation, undefined);
  const byId = setNodeImplementation(nodes, "d", "postgresql");
  assert.ok(byId.ok);
  assert.deepEqual(byId.nodes, back.nodes);

  const same = setNodeImplementation(nodes, "d", "mysql");
  assert.ok(same.ok && !same.changed);
  assert.equal(same.nodes, nodes);
  const plain = [node("d", "database", undefined, { capacity: 7_000 })];
  const defaultAgain = setNodeImplementation(plain, "d", "postgresql");
  assert.ok(defaultAgain.ok && !defaultAgain.changed);
  assert.equal(defaultAgain.nodes, plain);
});

test("tidying a stored default id keeps the settings", () => {
  const nodes = [node("d", "database", "postgresql", { capacity: 7_000 })];
  const result = setNodeImplementation(nodes, "d", null);
  assert.ok(result.ok && result.changed);
  assert.deepEqual(result.nodes[0].data.properties, { capacity: 7_000 });
});

test("a technology of another type, or a missing node, is refused", () => {
  const nodes = [node("d", "database")];
  assert.equal(setNodeImplementation(nodes, "d", "redis").ok, false);
  assert.equal(setNodeImplementation(nodes, "d", "nope").ok, false);
  assert.equal(setNodeImplementation(nodes, "x", "mysql").ok, false);
});

// ---- Calculated statistics ----

test("every technology of every type gets an estimate from the traffic settings", () => {
  for (const { name } of COMPONENT_TYPES) {
    const comparison = compareTechnologiesForTraffic(name, traffic(2_000));
    assert.equal(comparison.basis, "traffic");
    assert.deepEqual(
      comparison.options.map((option) => option.implementation.id),
      implementationsFor(name).map((implementation) => implementation.id),
    );
    for (const option of comparison.options) {
      assert.ok(Number.isFinite(option.monthlyCost) && option.monthlyCost >= 0, option.implementation.id);
      assert.ok(Number.isFinite(option.latencyMs), option.implementation.id);
      if (option.implementation.capacityPerInstance === null) assert.equal(option.instancesNeeded, null);
      else {
        assert.ok(option.demandRps > 0, `${name} receives load`);
        assert.ok((option.instancesNeeded ?? 0) >= 1, option.implementation.id);
      }
    }
  }
});

test("the instances needed are the fewest that keep the component under the headroom target", () => {
  const graph = design();
  const comparison = compareTechnologiesForNode(graph, traffic(5_000), "d");
  assert.ok(comparison && comparison.basis === "design");
  // The core databases all keep up; warehouses (Snowflake, BigQuery...) are reported as not enough.
  for (const id of ["postgresql", "mysql", "mongodb"]) assert.ok(comparison.options.find((option) => option.implementation.id === id)?.enough, id);
  for (const option of comparison.options) {
    if (!option.enough) continue;
    const at = (replicas: number) => {
      const swapped = {
        ...graph,
        nodes: graph.nodes.map((candidate) =>
          candidate.id === "d"
            ? node("d", "database", option.implementation.isDefault ? undefined : option.implementation.id, { replicas })
            : candidate,
        ),
      };
      return simulate(swapped, traffic(5_000)).nodes.find((candidate) => candidate.id === "d")!;
    };
    const replicas = option.replicasNeeded!;
    assert.ok(at(replicas).utilization <= ASSUMPTIONS.nearCapacityUtilization, option.implementation.id);
    if (replicas > 0) assert.ok(at(replicas - 1).utilization > ASSUMPTIONS.nearCapacityUtilization, option.implementation.id);
    assert.equal(option.instancesNeeded, replicas + 1);
    assert.equal(option.monthlyCost, at(replicas).config.monthlyCost, "priced exactly as Run Design prices it");
  }
});

test("more load or more data costs more", () => {
  const cost = (rps: number, gb: number) =>
    compareTechnologiesForNode(design(), traffic(rps, gb), "d")!.options.find(
      (option) => option.implementation.id === "postgresql",
    )!;
  assert.ok(cost(5_000, 50).monthlyCost > cost(1_000, 50).monthlyCost);
  assert.ok(cost(5_000, 2_000).monthlyCost > cost(5_000, 50).monthlyCost);
  assert.ok(cost(5_000, 2_000).instancesNeeded! > cost(5_000, 50).instancesNeeded!);
  assert.equal(cost(5_000, 2_000).storageCost, 2_000 * ASSUMPTIONS.databaseCostPerGb);
});

test("technologies compare on their own numbers, and the node's settings are ignored for sizing", () => {
  const graph = design();
  graph.nodes[2] = node("d", "database", "mongodb", { replicas: 0, capacity: 1 });
  const comparison = compareTechnologiesForNode(graph, traffic(5_000), "d")!;
  const mysql = comparison.options.find((option) => option.implementation.id === "mysql")!;
  const postgres = comparison.options.find((option) => option.implementation.id === "postgresql")!;
  assert.ok(mysql.instancesNeeded! <= postgres.instancesNeeded!, "MySQL has more capacity per instance here");
  assert.equal(configureNode(graph.nodes[2]).capacityPerInstance, 1, "the design itself is not changed");
});

test("too many writes for one primary is reported, not hidden", () => {
  const comparison = compareTechnologiesForNode(design(), traffic(20_000, 500), "d")!;
  // The core relational and document databases write through one primary; wide-column stores
  // such as ScyllaDB or Aerospike can take it.
  for (const id of ["postgresql", "mysql", "mongodb"]) assert.equal(comparison.options.find((option) => option.implementation.id === id)?.enough, false, id);
  assert.match(formatInstances(comparison.options[0])!, /^over /);
});

test("an unconnected component falls back to the traffic estimate; a missing one gives null", () => {
  const graph = { nodes: [node("c", "client"), node("d", "database")], edges: [] };
  assert.equal(compareTechnologiesForNode(graph, traffic(2_000), "d")?.basis, "traffic");
  assert.equal(compareTechnologiesForNode(graph, traffic(2_000), "zzz"), null);
});

test("formatting", () => {
  assert.equal(formatRate(5_500), "5,500");
  assert.equal(formatRate(20_000), "20k");
  assert.equal(formatMonthlyCost(1234.4), "$1,234/mo");
  assert.equal(formatLatency(1.5), "1.5 ms");
  assert.equal(formatLatency(4), "4 ms");
  assert.equal(formatLatency(24.4), "24 ms");
  const one = compareTechnologiesForTraffic("cache", traffic(1_000)).options[0];
  assert.equal(formatInstances(one), "1 instance");
  assert.equal(implementationById("redis")?.id, one.implementation.id);
});
