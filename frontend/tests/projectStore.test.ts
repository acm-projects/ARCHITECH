import assert from "node:assert/strict";
import test from "node:test";

import {
  computePreview,
  formatRelativeTime,
} from "../src/components/projects/preview.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  serializeProjectContent,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";

function fakeStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function makeStore(storage = fakeStorage()) {
  let tick = 0;
  let id = 0;
  const store = createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: () => `p${++id}`,
  });
  return { store, storage };
}

test("createProject starts from Client -> API Server -> Database", () => {
  const { store } = makeStore();
  const project = store.createProject();
  assert.equal(project.title, "Untitled Architecture");
  assert.deepEqual(
    project.nodes.map((n) => n.data.type),
    ["client", "server", "database"],
  );
  assert.equal(project.edges.length, 2);
  assert.equal(project.createdAt, project.updatedAt);
});

test("getProject returns the saved project, or null when missing", () => {
  const { store } = makeStore();
  const project = store.createProject();
  assert.deepEqual(store.getProject(project.id), project);
  assert.equal(store.getProject("nope"), null);
});

test("listProjects is sorted by updatedAt, newest first", () => {
  const { store } = makeStore();
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  assert.deepEqual(store.listProjects().map((p) => p.id), [b.id, a.id]);
  store.renameProject(a.id, "A2");
  assert.deepEqual(store.listProjects().map((p) => p.id), [a.id, b.id]);
});

test("the same stored text yields the same list instance", () => {
  const { store } = makeStore();
  store.createProject();
  assert.equal(store.listProjects(), store.listProjects());
});

test("renameProject changes the title and updatedAt, rejects empty titles", () => {
  const { store } = makeStore();
  const project = store.createProject();
  const renamed = store.renameProject(project.id, "  URL Store  ");
  assert.equal(renamed?.title, "URL Store");
  assert.notEqual(renamed?.updatedAt, project.updatedAt);
  assert.equal(renamed?.createdAt, project.createdAt);

  const unchanged = store.renameProject(project.id, "   ");
  assert.equal(unchanged?.title, "URL Store");
  assert.equal(unchanged?.updatedAt, renamed?.updatedAt);
  assert.equal(store.renameProject("missing", "x"), null);
});

test("updating nodes and edges keeps the project identity", () => {
  const { store } = makeStore();
  const project = store.createProject();
  const nodes = project.nodes.slice(0, 2);
  const updated = store.updateProject(project.id, {
    nodes,
    edges: [project.edges[0]],
  });
  assert.equal(updated?.id, project.id);
  assert.equal(updated?.createdAt, project.createdAt);
  assert.equal(updated?.title, project.title);
  assert.equal(updated?.nodes.length, 2);
  assert.equal(updated?.edges.length, 1);
  assert.equal(store.getProject(project.id)?.nodes.length, 2);
});

test("saved content drops UI state and dangling edges", () => {
  const { store } = makeStore();
  const project = store.createProject();
  const noisy = project.nodes.map((n) => ({
    ...n,
    selected: true,
    dragging: true,
    measured: { width: 88, height: 30 },
  }));
  const updated = store.updateProject(project.id, {
    nodes: noisy,
    edges: [...project.edges, { id: "x", source: "client-1", target: "ghost" }],
  });
  assert.equal("selected" in (updated?.nodes[0] ?? {}), false);
  assert.equal("measured" in (updated?.nodes[0] ?? {}), false);
  assert.equal(updated?.edges.length, 2);
});

test("serializeProjectContent ignores selection and measurement", () => {
  const { store } = makeStore();
  const { nodes, edges, title } = store.createProject();
  const noisy = nodes.map((n) => ({ ...n, selected: true }));
  assert.equal(
    serializeProjectContent(title, noisy, edges),
    serializeProjectContent(title, nodes, edges),
  );
});

test("duplicateProject copies the architecture under a new id and timestamps", () => {
  const { store } = makeStore();
  const original = store.createProject({ title: "Shop" });
  const copy = store.duplicateProject(original.id);
  assert.ok(copy);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.title, "Shop Copy");
  assert.deepEqual(copy.nodes, original.nodes);
  assert.deepEqual(copy.edges, original.edges);
  assert.notEqual(copy.createdAt, original.createdAt);
  assert.equal(copy.createdAt, copy.updatedAt);
  assert.equal(store.listProjects().length, 2);
});

test("a duplicate is independent of the original", () => {
  const { store } = makeStore();
  const original = store.createProject();
  const copy = store.duplicateProject(original.id);
  assert.ok(copy);
  store.updateProject(copy.id, { nodes: [], edges: [] });
  store.renameProject(copy.id, "Changed");
  const after = store.getProject(original.id);
  assert.equal(after?.nodes.length, 3);
  assert.equal(after?.title, "Untitled Architecture");
  assert.equal(after?.updatedAt, original.updatedAt);
});

test("deleteProject removes only that project", () => {
  const { store } = makeStore();
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  assert.equal(store.deleteProject(a.id), true);
  assert.deepEqual(store.listProjects().map((p) => p.id), [b.id]);
  assert.equal(store.deleteProject(a.id), false);
});

test("missing projects return null without throwing", () => {
  const { store } = makeStore();
  assert.equal(store.getProject("x"), null);
  assert.equal(store.updateProject("x", { title: "t" }), null);
  assert.equal(store.duplicateProject("x"), null);
  assert.equal(store.deleteProject("x"), false);
});

test("malformed storage does not crash and is backed up before overwrite", () => {
  for (const raw of ["not json", "42", "null", '{"projects": 5}']) {
    const { store, storage } = makeStore(fakeStorage(raw));
    assert.deepEqual(store.listProjects(), []);
    store.createProject();
    assert.equal(store.listProjects().length, 1);
    assert.equal(storage.data.get(`${STORAGE_KEY}:unreadable`), raw);
  }
});

test("one malformed project does not hide or destroy the others", () => {
  const seed = makeStore();
  const good = seed.store.createProject({ title: "Good" });
  const bad = { id: "bad", title: 5 };
  const raw = JSON.stringify({ version: 1, projects: [good, bad] });

  const { store, storage } = makeStore(fakeStorage(raw));
  assert.deepEqual(store.listProjects().map((p) => p.id), [good.id]);

  store.renameProject(good.id, "Renamed");
  const saved = JSON.parse(storage.data.get(STORAGE_KEY) ?? "{}");
  assert.equal(saved.projects.length, 2);
  assert.deepEqual(saved.projects[1], bad);
});

test("invalid nodes and edges inside a project are dropped, not fatal", () => {
  const seed = makeStore();
  const good = seed.store.createProject();
  const broken = {
    ...good,
    nodes: [
      ...good.nodes,
      { id: "bogus", position: { x: 0, y: 0 }, data: { type: "nope", label: "x" } },
      { id: "nan", position: { x: Number.NaN, y: 0 }, data: { type: "cache", label: "x" } },
      "garbage",
    ],
    edges: [...good.edges, { id: "e", source: "bogus", target: "client-1" }, null],
  };
  const { store } = makeStore(fakeStorage(JSON.stringify({ projects: [broken] })));
  const loaded = store.getProject(good.id);
  assert.equal(loaded?.nodes.length, 3);
  assert.equal(loaded?.edges.length, 2);
});

test("storage failures surface as errors", () => {
  const storage = fakeStorage();
  storage.setItem = () => {
    throw new Error("quota");
  };
  const { store } = makeStore(storage);
  assert.throws(() => store.createProject(), /quota/);
});

test("preview scales the graph into the box and skips dangling edges", () => {
  const preview = computePreview(
    [
      { id: "a", data: { type: "client" }, position: { x: 0, y: 0 } },
      { id: "b", data: { type: "server" }, position: { x: 300, y: 0 } },
    ],
    [
      { source: "a", target: "b" },
      { source: "a", target: "missing" },
    ],
  );
  assert.equal(preview.nodes.length, 2);
  assert.equal(preview.lines.length, 1);
  for (const node of preview.nodes) {
    assert.ok(node.x >= 0 && node.x <= 200 && node.y >= 0 && node.y <= 64);
  }
  assert.ok(preview.nodes[1].x > preview.nodes[0].x);
  assert.deepEqual(computePreview([], []), { nodes: [], lines: [] });
});

test("relative time formatting", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  assert.equal(formatRelativeTime("2026-01-10T11:59:50Z", now), "just now");
  assert.equal(formatRelativeTime("2026-01-10T10:00:00Z", now), "2h ago");
  assert.equal(formatRelativeTime("2026-01-07T12:00:00Z", now), "3d ago");
  assert.equal(formatRelativeTime("2025-12-27T12:00:00Z", now), "2w ago");
});
