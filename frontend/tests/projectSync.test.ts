import assert from "node:assert/strict";
import test from "node:test";

import { createProjectStore, type StorageLike } from "../src/components/projects/projectStore.ts";
import {
  payloadToStoredProject,
  projectToPayload,
  validateGraph,
  validateProjectInput,
  type ProjectPayload,
} from "../src/lib/projects/projectPayload.ts";
import {
  canonicalJson,
  fingerprint,
  planInitialMerge,
  planPendingChanges,
} from "../src/lib/projects/syncPlan.ts";

// ---- Helpers ----

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

let counter = 0;
function project(overrides: Partial<ProjectPayload> = {}): ProjectPayload {
  counter += 1;
  return {
    id: `p-${counter}`,
    title: `Project ${counter}`,
    mode: "learn",
    learnSkipped: false,
    graph: {
      schemaVersion: 1,
      nodes: [
        { id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Client" } },
        { id: "server-1", type: "architecture", position: { x: 200, y: 0 }, data: { type: "server", label: "API", properties: { replicas: 3 } } },
      ],
      edges: [{ id: "client-1->server-1", source: "client-1", target: "server-1" }],
    },
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    lastOpenedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

const withTitle = (p: ProjectPayload, title: string, updatedAt: string): ProjectPayload => ({ ...p, title, updatedAt });
const { id: _ignored, ...inputOf } = project();
const validInput = () => structuredClone(inputOf);

// ---- Validation (graph spec section 5) ----

test("a project made by the app passes server validation unchanged", () => {
  const store = createProjectStore({ getStorage: memoryStorage });
  const created = store.createProject({ title: "Shop" });
  const payload = projectToPayload(created);
  const { id: _id, ...input } = payload;
  const result = validateProjectInput(JSON.parse(JSON.stringify(input)));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.graph, payload.graph);
});

test("graph validation reports the first problem with its path", () => {
  const cases: Array<[string, (g: any) => void, RegExp]> = [
    ["unknown type", (g) => (g.nodes[0].data.type = "firewall"), /nodes\[0\]\.data\.type "firewall" is not a known/],
    ["blank label", (g) => (g.nodes[1].data.label = "   "), /nodes\[1\]\.data\.label must be 1-60/],
    ["duplicate node id", (g) => (g.nodes[1].id = "client-1"), /used by another node/],
    ["dangling edge", (g) => (g.edges[0].target = "nope"), /edges\[0\]\.target must be the id of a node/],
    ["self loop", (g) => (g.edges[0].target = "client-1"), /connects a node to itself/],
    ["repeated connection", (g) => g.edges.push({ ...g.edges[0], id: "other" }), /repeats another edge/],
    ["runtime field", (g) => (g.nodes[0].selected = true), /unknown field "selected"/],
    ["viewport", (g) => (g.viewport = { x: 0, y: 0, zoom: 1 }), /unknown field "viewport"/],
    ["replicas out of range", (g) => (g.nodes[1].data.properties.replicas = 5000), /replicas: Replicas must be at most 1000/],
    ["fractional replicas", (g) => (g.nodes[1].data.properties.replicas = 2.5), /whole number/],
    ["empty properties", (g) => (g.nodes[1].data.properties = {}), /left out instead of empty/],
    ["bad property key", (g) => (g.nodes[1].data.properties["__proto__x"] = 1), /invalid key/],
    ["schema version", (g) => (g.schemaVersion = 2), /schemaVersion must be 1/],
  ];
  for (const [name, mutate, message] of cases) {
    const graph = structuredClone(project().graph) as any;
    mutate(graph);
    const result = validateGraph(graph);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.match(result.error, message, name);
  }
});

test("settings a component does not support are kept, as the spec says", () => {
  const graph = structuredClone(project().graph) as any;
  graph.nodes[0].data.properties = { replicas: 5, note: "edge region", pinned: true };
  assert.equal(validateGraph(graph).ok, true);
});

test("a graph without schemaVersion is treated as version 1", () => {
  const graph = structuredClone(project().graph) as any;
  delete graph.schemaVersion;
  const result = validateGraph(graph);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.schemaVersion, 1);
});

test("project fields are validated", () => {
  const bad: Array<[string, (p: any) => void]> = [
    ["title", (p) => (p.title = "")],
    ["long title", (p) => (p.title = "x".repeat(81))],
    ["mode", (p) => (p.mode = "sandbox")],
    ["date", (p) => (p.updatedAt = "yesterday")],
    ["source", (p) => (p.source = "imported")],
    ["unknown field", (p) => (p.owner = "someone")],
  ];
  for (const [name, mutate] of bad) {
    const input = validInput() as any;
    mutate(input);
    assert.equal(validateProjectInput(input).ok, false, name);
  }
});

test("a payload round-trips through the browser store unchanged", () => {
  const original = project({ source: "duplicate", learnSkipped: true });
  const storage = memoryStorage();
  storage.setItem("architech:projects", JSON.stringify({ version: 1, projects: [payloadToStoredProject(original)] }));
  const store = createProjectStore({ getStorage: () => storage });
  assert.equal(fingerprint(projectToPayload(store.listProjects()[0])), fingerprint(original));
});

// ---- Sync decisions ----

test("canonical JSON ignores key order, as Postgres jsonb reorders keys", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } }), canonicalJson({ a: { c: [1, { e: 2, f: 1 }], d: 2 }, b: 1 }));
});

test("first sync on a new device downloads everything", () => {
  const server = [project(), project()];
  const plan = planInitialMerge([], server, {});
  assert.deepEqual(plan.projects.map((p) => p.id), server.map((p) => p.id));
  assert.deepEqual(plan.upload, []);
  assert.deepEqual(plan.remove, []);
  assert.equal(Object.keys(plan.synced).length, 2);
});

test("projects that only exist in this browser are uploaded (first sync after this feature)", () => {
  const local = [project(), project()];
  const plan = planInitialMerge(local, [], {});
  assert.deepEqual(plan.upload.map((p) => p.id), local.map((p) => p.id));
  assert.equal(plan.projects.length, 2);
});

test("a project deleted on another device is removed here", () => {
  const gone = project();
  const plan = planInitialMerge([gone], [], { [gone.id]: fingerprint(gone) });
  assert.deepEqual(plan.projects, []);
  assert.deepEqual(plan.upload, []);
});

test("a project deleted here while offline is deleted on the server", () => {
  const deleted = project();
  const plan = planInitialMerge([], [deleted], { [deleted.id]: fingerprint(deleted) });
  assert.deepEqual(plan.remove, [deleted.id]);
  assert.deepEqual(plan.projects, []);
});

test("an edit made elsewhere replaces an unchanged local copy", () => {
  const base = project();
  const remote = withTitle(base, "Renamed elsewhere", "2026-10-02T10:00:00.000Z");
  const plan = planInitialMerge([base], [remote], { [base.id]: fingerprint(base) });
  assert.equal(plan.projects[0].title, "Renamed elsewhere");
  assert.deepEqual(plan.upload, []);
});

test("an offline edit here is uploaded", () => {
  const base = project();
  const local = withTitle(base, "Edited offline", "2026-10-02T10:00:00.000Z");
  const plan = planInitialMerge([local], [base], { [base.id]: fingerprint(base) });
  assert.equal(plan.projects[0].title, "Edited offline");
  assert.deepEqual(plan.upload.map((p) => p.title), ["Edited offline"]);
});

test("when both sides changed, the more recent edit wins", () => {
  const base = project();
  const synced = { [base.id]: fingerprint(base) };
  const olderHere = withTitle(base, "here", "2026-10-02T10:00:00.000Z");
  const newerThere = withTitle(base, "there", "2026-10-03T10:00:00.000Z");
  assert.equal(planInitialMerge([olderHere], [newerThere], synced).projects[0].title, "there");
  const newerHere = withTitle(base, "here", "2026-10-04T10:00:00.000Z");
  const plan = planInitialMerge([newerHere], [newerThere], synced);
  assert.equal(plan.projects[0].title, "here");
  assert.equal(plan.upload.length, 1);
});

test("pending changes: edited and new projects upload, removed ones delete", () => {
  const kept = project();
  const edited = project();
  const removed = project();
  const fresh = project();
  const synced = { [kept.id]: fingerprint(kept), [edited.id]: fingerprint(edited), [removed.id]: fingerprint(removed) };
  const plan = planPendingChanges([kept, withTitle(edited, "new title", edited.updatedAt), fresh], synced);
  assert.deepEqual(plan.upload.map((p) => p.id).sort(), [edited.id, fresh.id].sort());
  assert.deepEqual(plan.remove, [removed.id]);
});
