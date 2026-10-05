import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  normalizeProjectState,
} from "../src/lib/projectSchema.ts";

test("migrates legacy string components and adds the current schema version", () => {
  const state = normalizeProjectState({
    addedComponents: ["Redis", { id: "db-2", name: "PostgreSQL" }],
  });

  assert.equal(state.schemaVersion, CURRENT_PROJECT_SCHEMA_VERSION);
  assert.deepEqual(state.addedComponents, [
    { id: "added-0", name: "Redis" },
    { id: "db-2", name: "PostgreSQL" },
  ]);
});

test("drops malformed persisted fields instead of trusting them", () => {
  const state = normalizeProjectState({
    nodeOffsets: {
      valid: { x: 12, y: -8 },
      bad: { x: "nope", y: 2 },
    },
    connections: [
      { from: "a", to: "b", fromPort: "out" },
      { from: 5, to: "b" },
    ],
    nodeProperties: {
      valid: { replicas: 3, enabled: true, runtime: "Node.js" },
      bad: { nested: { nope: true }, infinity: Number.POSITIVE_INFINITY },
    },
  });

  assert.deepEqual(state.nodeOffsets, { valid: { x: 12, y: -8 } });
  assert.deepEqual(state.connections, [{ from: "a", to: "b", fromPort: "out" }]);
  assert.deepEqual(state.nodeProperties.valid, {
    replicas: 3,
    enabled: true,
    runtime: "Node.js",
  });
  assert.deepEqual(state.nodeProperties.bad, {});
});

test("bounds editor values that would otherwise break the workspace", () => {
  const state = normalizeProjectState({
    readRatio: 170,
    zoom: 50,
    notes: -4,
    activeTab: 99,
    tabs: ["Architecture"],
  });

  assert.equal(state.readRatio, 100);
  assert.equal(state.zoom, 1.8);
  assert.equal(state.notes, 0);
  assert.equal(state.activeTab, 0);
});
