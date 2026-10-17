import assert from "node:assert/strict";
import test from "node:test";

import { COMPONENT_CATALOG } from "../src/components/workspace/componentCatalog.ts";
import { parseProject } from "../src/components/projects/projectStore.ts";
import { copySelection, pasteClipboard } from "../src/lib/architecture/clipboard.ts";
import {
  COMPONENT_IMPLEMENTATIONS,
  COMPONENT_TYPES,
  defaultImplementationFor,
  implementationById,
  implementationsFor,
  resolveImplementation,
} from "../src/lib/architecture/componentLibrary.ts";
import { getEffectiveProperties, getPropertyDefinitions } from "../src/lib/architecture/componentProperties.ts";
import { SIMULATION_PROFILES, configureNode, profileOf } from "../src/lib/architecture/evaluation/capabilities.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import {
  canonicalEvaluationInput,
  fingerprintEvaluationInput,
} from "../src/lib/architecture/evaluation/fingerprint.ts";
import { snapshotGraph } from "../src/lib/architecture/evaluation/input.ts";
import { createNodeIdAllocator } from "../src/lib/architecture/nodeIds.ts";
import type { ArchitectureNodeType, NodeProperties } from "../src/lib/architecture/types.ts";
import { payloadToStoredProject, projectToPayload, validateGraph } from "../src/lib/projects/projectPayload.ts";

// ---- Helpers ----

type Props = NodeProperties;
const n = (id: string, type: ArchitectureNodeType, implementation?: string, properties?: Props) => ({
  id,
  data: {
    type,
    label: id,
    ...(implementation === undefined ? {} : { implementation }),
    ...(properties ? { properties } : {}),
  },
});
const e = (source: string, target: string) => ({ source, target });
const traffic = { requestsPerSecond: 2_000, concurrentUsers: 5_000, datasetGb: 50, readRatio: 0.8, networkLatencyMs: 40 };

// client -> server -> cache -> database, with the database and cache technologies chosen.
const design = (database?: string, cache?: string, databaseProps?: Props) => ({
  nodes: [
    n("c", "client"),
    n("s", "server", undefined, { replicas: 4 }),
    n("k", "cache", cache),
    n("d", "database", database, databaseProps),
  ],
  edges: [e("c", "s"), e("s", "k"), e("k", "d")],
});
const evaluate = (graph: unknown) => evaluateArchitecture({ graph: graph as never, traffic });

// ---- The library ----

test("every component type has exactly one default implementation and is in the canvas catalog", () => {
  assert.equal(COMPONENT_TYPES.length, Object.keys(COMPONENT_CATALOG).length);
  for (const { name } of COMPONENT_TYPES) {
    assert.ok(Object.hasOwn(COMPONENT_CATALOG, name), name);
    const defaults = implementationsFor(name).filter((implementation) => implementation.isDefault);
    assert.equal(defaults.length, 1, name);
    assert.equal(implementationsFor(name)[0].isDefault, true, `${name}: default listed first`);
  }
  for (const implementation of COMPONENT_IMPLEMENTATIONS) {
    assert.ok(Object.hasOwn(COMPONENT_CATALOG, implementation.componentType), implementation.id);
    assert.equal(implementationById(implementation.id), implementation);
  }
});

test("SIMULATION_PROFILES is the default implementation's numbers", () => {
  assert.equal(Object.keys(SIMULATION_PROFILES).length, COMPONENT_TYPES.length);
  for (const { name } of COMPONENT_TYPES) {
    const profile = SIMULATION_PROFILES[name];
    const implementation = defaultImplementationFor(name);
    assert.equal(profile.capacityPerInstance, implementation.capacityPerInstance, name);
    assert.equal(profile.latencyMs, implementation.latencyMs, name);
    assert.equal(profile.monthlyCostPerInstance, implementation.monthlyCostPerInstance, name);
    assert.equal(profile.availability, implementation.availability, name);
    assert.equal(profile.hitRate, implementation.hitRate ?? undefined, name);
    assert.equal(profile.connectionsPerInstance, implementation.connectionsPerInstance ?? undefined, name);
    assert.equal(profile.defaultInstances, 1);
    assert.equal(profile.minInstances, 1);
  }
});

// ---- The engine uses the chosen technology ----

test("a chosen implementation's numbers reach the engine", () => {
  const mysql = implementationById("mysql")!;
  const config = configureNode(n("d", "database", "mysql"));
  assert.equal(config.capacityPerInstance, mysql.capacityPerInstance);
  assert.equal(config.latencyMs, mysql.latencyMs);
  assert.equal(config.monthlyCost, mysql.monthlyCostPerInstance);

  const memcached = implementationById("memcached")!;
  const cache = configureNode(n("k", "cache", "memcached"));
  assert.equal(cache.hitRate, memcached.hitRate);
  assert.equal(cache.availability, memcached.availability);
});

test("choosing the default explicitly is the same as choosing nothing", () => {
  assert.deepEqual(configureNode(n("d", "database", "postgresql")), configureNode(n("d", "database")));
  assert.equal(profileOf("database", "postgresql"), SIMULATION_PROFILES.database);
  assert.equal(
    fingerprintEvaluationInput({ graph: design("postgresql", "redis"), traffic }),
    fingerprintEvaluationInput({ graph: design(), traffic }),
  );
});

test("unknown or mismatched implementations fall back to the type's default", () => {
  const plain = configureNode(n("d", "database"));
  assert.deepEqual(configureNode(n("d", "database", "no-such-thing")), plain);
  assert.deepEqual(configureNode(n("d", "database", "redis")), plain); // a cache, not a database
  assert.equal(resolveImplementation("database", "redis").id, "postgresql");
  assert.deepEqual(configureNode({ id: "d", data: { type: "database", implementation: 42 as never } }), plain);
});

test("swapping technologies changes the evaluation", () => {
  const base = evaluate(design());
  const swapped = evaluate(design("mongodb", "memcached"));
  assert.notEqual(swapped.metrics.estimatedMonthlyCost, base.metrics.estimatedMonthlyCost);
  assert.notDeepEqual(swapped.metrics, base.metrics);
});

test("the user's capacity and hit rate still win over the implementation's", () => {
  const config = configureNode(n("d", "database", "mongodb", { capacity: 12_000 }));
  assert.equal(config.capacityPerInstance, 12_000);
  // Cost scales relative to the chosen implementation's own capacity.
  const mongodb = implementationById("mongodb")!;
  assert.equal(config.monthlyCost, mongodb.monthlyCostPerInstance * (12_000 / mongodb.capacityPerInstance!));

  const cache = configureNode(n("k", "cache", "memcached", { cacheHitRate: 0.9 }));
  assert.equal(cache.hitRate, 0.9);
});

test("property defaults follow the chosen implementation", () => {
  const capacity = (implementation?: string) =>
    getPropertyDefinitions("database", implementation).find((definition) => definition.key === "capacity")
      ?.defaultValue;
  assert.equal(capacity(), implementationById("postgresql")!.capacityPerInstance);
  assert.equal(capacity("mysql"), implementationById("mysql")!.capacityPerInstance);
  assert.equal(getPropertyDefinitions("database", "nope"), getPropertyDefinitions("database"));
  assert.equal(getEffectiveProperties("cache", undefined, "memcached").cacheHitRate, implementationById("memcached")!.hitRate);
});

// ---- Run Design results go stale when the technology changes ----

test("the fingerprint changes when a non-default implementation is chosen", () => {
  const before = canonicalEvaluationInput({ graph: design(), traffic });
  const after = canonicalEvaluationInput({ graph: design("mysql"), traffic });
  assert.notEqual(after, before);
  assert.ok(after.includes('"mysql"'));
  assert.ok(!before.includes("postgresql"), "defaults add nothing to the canonical text");
  // Entry components count too.
  assert.notEqual(
    canonicalEvaluationInput({ graph: { nodes: [n("w", "web-app", "react-spa")], edges: [] } }),
    canonicalEvaluationInput({ graph: { nodes: [n("w", "web-app")], edges: [] } }),
  );
});

// ---- The choice survives snapshots, save/load, sync and copy/paste ----

test("Run Design snapshots keep the implementation", () => {
  const snapshot = snapshotGraph(design("mysql").nodes, design().edges);
  assert.equal(snapshot.nodes.find((node) => node.id === "d")?.data.implementation, "mysql");
});

const flowNode = (id: string, type: ArchitectureNodeType, implementation?: string, selected = false) => ({
  id,
  type: "architecture",
  position: { x: 0, y: 0 },
  selected,
  data: { type, label: id, ...(implementation ? { implementation } : {}) },
});

test("saving, loading and syncing a project keep a valid implementation and drop an invalid one", () => {
  const stored = {
    id: "p-1",
    title: "Shop",
    mode: "learn",
    learnSkipped: false,
    nodes: [flowNode("d", "database", "mysql"), flowNode("k", "cache", "postgresql")],
    edges: [],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    lastOpenedAt: "2026-10-01T10:00:00.000Z",
  };
  const project = parseProject(JSON.parse(JSON.stringify(stored)));
  assert.ok(project);
  assert.equal(project.nodes[0].data.implementation, "mysql");
  assert.equal(project.nodes[1].data.implementation, undefined, "a database id on a cache is dropped");

  const payload = projectToPayload(project);
  assert.equal(payload.graph.nodes[0].data.implementation, "mysql");
  assert.equal(validateGraph(JSON.parse(JSON.stringify(payload.graph))).ok, true);
  const reloaded = parseProject(payloadToStoredProject(payload));
  assert.equal(reloaded?.nodes[0].data.implementation, "mysql");
});

test("copy and paste keep the implementation", () => {
  const graph = { nodes: [flowNode("d", "database", "mongodb", true)], edges: [] };
  const content = copySelection(graph);
  assert.ok(content);
  const { graph: next } = pasteClipboard(graph, content, createNodeIdAllocator(["d"]));
  assert.equal(next.nodes.length, 2);
  assert.equal(next.nodes[1].data.implementation, "mongodb");
});
