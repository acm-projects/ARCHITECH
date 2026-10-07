import assert from "node:assert/strict";
import test from "node:test";

import { generateNodeId } from "../src/lib/architecture/nodeIds.ts";
import {
  MAX_PROPERTY_COUNT,
  MAX_PROPERTY_STRING_LENGTH,
  sanitizeNodeProperties,
} from "../src/lib/architecture/nodeProperties.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  serializeProjectContent,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";
import type { ArchitectureFlowNode } from "../src/components/workspace/nodes/ArchitectureNode";

function fakeStorage(initial?: string): StorageLike {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function makeStore(storage = fakeStorage()) {
  let tick = 0;
  let id = 0;
  return createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: () => `p${++id}`,
  });
}

const node = (id: string, type: ArchitectureFlowNode["data"]["type"], extra = {}) =>
  ({
    id,
    type: "architecture",
    position: { x: 0, y: 0 },
    data: { type, label: id, ...extra },
  }) as ArchitectureFlowNode;

// ---- Node ids ----

test("the first node of a type is numbered 1", () => {
  assert.equal(generateNodeId("server", []), "server-1");
});

test("ids are one more than the highest used by that type", () => {
  assert.equal(generateNodeId("server", ["server-1", "server-4", "client-9"]), "server-5");
});

test("multiple nodes of the same type never share an id", () => {
  const ids: string[] = [];
  for (let i = 0; i < 25; i += 1) ids.push(generateNodeId("cache", ids));
  assert.equal(new Set(ids).size, 25);
});

test("a type never takes numbers from another type that shares a prefix", () => {
  assert.equal(generateNodeId("web", ["web-app-1", "web-app-2"]), "web-1");
  assert.equal(generateNodeId("web-app", ["web-app-1", "web-app-2"]), "web-app-3");
});

test("ids from earlier versions and custom ids never collide", () => {
  const existing = ["server-added-1", "server-added-2", "server-x", "server-"];
  const id = generateNodeId("server", existing);
  assert.equal(existing.includes(id), false);
  assert.equal(id, "server-1");
});

test("reopening a saved project that already has server-added-1 yields a new id", () => {
  const store = makeStore();
  const saved = store.createProject({
    nodes: [node("client-1", "client"), node("server-added-1", "server"), node("server-1", "server")],
    edges: [],
  });

  const reopened = store.getProject(saved.id);
  assert.ok(reopened);
  const loadedIds = reopened.nodes.map((n) => n.id);
  assert.ok(loadedIds.includes("server-added-1"));

  const added = generateNodeId("server", loadedIds);
  assert.equal(loadedIds.includes(added), false);
});

test("reopening a project with server-1..3 continues at server-4", () => {
  const store = makeStore();
  const saved = store.createProject({
    nodes: [node("server-1", "server"), node("server-2", "server"), node("server-3", "server")],
    edges: [],
  });
  const reopened = store.getProject(saved.id);
  const next = generateNodeId("server", reopened?.nodes.map((n) => n.id) ?? []);
  assert.equal(next, "server-4");
});

test("deleting a node then adding another never duplicates a remaining id", () => {
  let ids = ["server-1", "server-2", "server-3"];
  ids = ids.filter((id) => id !== "server-2");
  const added = generateNodeId("server", ids);
  assert.equal(ids.includes(added), false);
  ids = [...ids, added];
  assert.equal(new Set(ids).size, ids.length);

  // Deleting the newest and adding again stays unique against what is left.
  ids = ids.filter((id) => id !== added);
  const again = generateNodeId("server", ids);
  assert.equal(ids.includes(again), false);
});

test("huge numeric suffixes cannot produce an invalid id", () => {
  const id = generateNodeId("server", [`server-${"9".repeat(400)}`]);
  assert.equal(id, "server-1");
});

// ---- Properties validation ----

test("valid properties are kept, in key order", () => {
  const result = sanitizeNodeProperties({ replicas: 3, engine: "postgres", tls: true });
  assert.deepEqual(result, { engine: "postgres", replicas: 3, tls: true });
  assert.deepEqual(Object.keys(result ?? {}), ["engine", "replicas", "tls"]);
});

test("properties that are not a plain object are rejected", () => {
  for (const bad of [null, undefined, 5, "x", true, ["replicas", 3], () => 1]) {
    assert.equal(sanitizeNodeProperties(bad), undefined);
  }
});

test("invalid entries are dropped and valid ones kept", () => {
  const result = sanitizeNodeProperties({
    replicas: 2,
    nan: Number.NaN,
    inf: Number.POSITIVE_INFINITY,
    nested: { a: 1 },
    list: [1],
    nothing: null,
    undef: undefined,
    long: "x".repeat(MAX_PROPERTY_STRING_LENGTH + 1),
    "bad key": 1,
    "1leading": 1,
    ok: "fine",
  });
  assert.deepEqual(result, { ok: "fine", replicas: 2 });
});

test("prototype-polluting keys are rejected", () => {
  const raw = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "replicas": 1}');
  const result = sanitizeNodeProperties(raw);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.hasOwn(result ?? {}, "__proto__"), false);
  assert.equal(result?.replicas, 1);
});

test("an empty or fully invalid properties object becomes undefined", () => {
  assert.equal(sanitizeNodeProperties({}), undefined);
  assert.equal(sanitizeNodeProperties({ a: Number.NaN, b: {} }), undefined);
});

test("at most MAX_PROPERTY_COUNT entries are kept", () => {
  const raw = Object.fromEntries(
    Array.from({ length: MAX_PROPERTY_COUNT + 10 }, (_, i) => [`k${String(i).padStart(3, "0")}`, i]),
  );
  assert.equal(Object.keys(sanitizeNodeProperties(raw) ?? {}).length, MAX_PROPERTY_COUNT);
});

// ---- Properties through the project store ----

test("properties survive create, save, reload, edit and save again", () => {
  const storage = fakeStorage();
  const first = makeStore(storage);
  const created = first.createProject({
    title: "Props",
    nodes: [
      node("server-1", "server", { properties: { replicas: 3, region: "eu-west-1", tls: true } }),
      node("database-1", "database"),
    ],
    edges: [{ id: "e", source: "server-1", target: "database-1" }],
  });
  assert.deepEqual(created.nodes[0].data.properties, {
    region: "eu-west-1",
    replicas: 3,
    tls: true,
  });

  // A new store over the same storage is a reload.
  const second = makeStore(storage);
  const loaded = second.getProject(created.id);
  assert.deepEqual(loaded?.nodes[0].data.properties, created.nodes[0].data.properties);

  // Edit a property, as React Flow's updateNodeData would, and save again.
  const edited = loaded?.nodes.map((n) =>
    n.id === "server-1"
      ? { ...n, data: { ...n.data, properties: { ...n.data.properties, replicas: 5 } } }
      : n,
  );
  second.updateProject(created.id, { nodes: edited });

  const third = makeStore(storage);
  const reloaded = third.getProject(created.id);
  assert.equal(reloaded?.nodes[0].data.properties?.replicas, 5);
  assert.equal(reloaded?.nodes[0].data.properties?.region, "eu-west-1");
  assert.equal(reloaded?.nodes[1].data.properties, undefined);
});

test("a property edit counts as a change for autosave", () => {
  const base = [node("server-1", "server", { properties: { replicas: 1 } })];
  const edited = [node("server-1", "server", { properties: { replicas: 2 } })];
  assert.notEqual(
    serializeProjectContent("t", base, []),
    serializeProjectContent("t", edited, []),
  );
});

test("property key order does not look like a change", () => {
  const a = [node("s", "server", { properties: { a: 1, b: 2 } })];
  const b = [node("s", "server", { properties: { b: 2, a: 1 } })];
  assert.equal(serializeProjectContent("t", a, []), serializeProjectContent("t", b, []));
});

test("a project saved before properties existed still loads unchanged", () => {
  const legacy = {
    version: 1,
    projects: [
      {
        id: "old",
        title: "Old project",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nodes: [
          { id: "client-1", type: "architecture", position: { x: 1, y: 2 }, data: { type: "client", label: "Client" } },
          { id: "server-added-1", type: "architecture", position: { x: 3, y: 4 }, data: { type: "server", label: "API" } },
        ],
        edges: [{ id: "e", source: "client-1", target: "server-added-1" }],
      },
    ],
  };
  const project = makeStore(fakeStorage(JSON.stringify(legacy))).getProject("old");
  assert.equal(project?.nodes.length, 2);
  assert.equal(project?.edges.length, 1);
  assert.deepEqual(project?.nodes[0].data, { type: "client", label: "Client" });
  assert.equal("properties" in (project?.nodes[1].data ?? {}), false);
});

test("malformed properties are sanitized without losing the node", () => {
  const corrupt = {
    version: 1,
    projects: [
      {
        id: "p",
        title: "Corrupt",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nodes: [
          { id: "a", type: "architecture", position: { x: 0, y: 0 }, data: { type: "server", label: "A", properties: "oops" } },
          { id: "b", type: "architecture", position: { x: 0, y: 0 }, data: { type: "server", label: "B", properties: [1, 2] } },
          { id: "c", type: "architecture", position: { x: 0, y: 0 }, data: { type: "server", label: "C", properties: { replicas: 2, bad: { x: 1 }, nan: null } } },
          { id: "d", type: "architecture", position: { x: 0, y: 0 }, data: { type: "server", label: "D", properties: {} } },
        ],
        edges: [],
      },
    ],
  };
  const project = makeStore(fakeStorage(JSON.stringify(corrupt))).getProject("p");
  assert.equal(project?.nodes.length, 4);
  assert.equal(project?.nodes[0].data.properties, undefined);
  assert.equal(project?.nodes[1].data.properties, undefined);
  assert.deepEqual(project?.nodes[2].data.properties, { replicas: 2 });
  assert.equal("properties" in (project?.nodes[3].data ?? {}), false);
});

test("duplicating a project copies properties independently", () => {
  const store = makeStore();
  const original = store.createProject({
    nodes: [node("server-1", "server", { properties: { replicas: 2 } })],
    edges: [],
  });
  const copy = store.duplicateProject(original.id);
  assert.deepEqual(copy?.nodes[0].data.properties, { replicas: 2 });
  assert.notEqual(copy?.nodes[0].data.properties, original.nodes[0].data.properties);
});
