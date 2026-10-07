import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { createAutosaveController } from "../src/components/projects/autosaveController.ts";
import { createProjectActions } from "../src/components/projects/projectActions.ts";
import {
  AUTOSAVE_DEBOUNCE_MS,
  createProjectAutosave,
} from "../src/components/projects/projectAutosave.ts";
import {
  MAX_TITLE_LENGTH,
  ProjectStoreError,
  STORAGE_KEY,
  createProjectStore,
  diffProjectContent,
  type Project,
  type ProjectContent,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";
import type { ArchitectureFlowNode } from "../src/components/workspace/nodes/ArchitectureNode";

// ---- Helpers ----

type FakeStorage = StorageLike & {
  data: Map<string, string>;
  failWrites: boolean;
  failReads: boolean;
  writes: number;
};

function fakeStorage(initial?: unknown): FakeStorage {
  const data = new Map<string, string>();
  if (initial !== undefined) {
    data.set(STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial));
  }
  const storage: FakeStorage = {
    data,
    failWrites: false,
    failReads: false,
    writes: 0,
    getItem: (key) => {
      if (storage.failReads) throw new Error("blocked");
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (storage.failWrites) throw new Error("quota exceeded");
      storage.writes += 1;
      data.set(key, value);
    },
  };
  return storage;
}

function makeStore(storage: StorageLike | null = fakeStorage(), newId?: () => string) {
  let tick = 0;
  let id = 0;
  return createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: newId ?? (() => `p${++id}`),
  });
}

// A reload: a new store over the same storage.
const reopen = (storage: StorageLike) => makeStore(storage);

const node = (
  id: string,
  type: ArchitectureFlowNode["data"]["type"],
  extra: { properties?: Record<string, string | number | boolean> } = {},
  x = 0,
) =>
  ({
    id,
    type: "architecture",
    position: { x, y: 0 },
    data: { type, label: id, ...extra },
  }) as ArchitectureFlowNode;

const contentOf = (project: Project): ProjectContent => ({
  title: project.title,
  nodes: project.nodes,
  edges: project.edges,
});

// Timers the test fires by hand.
function fakeTimers() {
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    set: (callback: () => void) => {
      queue.set(next, callback);
      return next++;
    },
    clear: (handle: unknown) => void queue.delete(handle as number),
    pending: () => queue.size,
    fire: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function silenceConsoleError() {
  return mock.method(console, "error", () => {});
}

// ---- Create ----

test("create persists exactly one project that can be retrieved after a reload", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();

  const reloaded = reopen(storage);
  assert.equal(reloaded.listProjects().length, 1);
  assert.deepEqual(reloaded.getProject(project.id), project);
  assert.deepEqual(
    project.nodes.map((n) => n.data.type),
    ["client", "server", "database"],
  );
});

test("new projects open in learn mode and are blank-source projects", () => {
  const project = makeStore().createProject();
  assert.equal(project.mode, "learn");
  assert.equal(project.source, "blank");
  assert.equal(project.lastOpenedAt, project.createdAt);
  assert.equal(project.updatedAt, project.createdAt);
});

test("a mode can be set at creation, and an invalid one falls back to learn", () => {
  const store = makeStore();
  assert.equal(store.createProject({ mode: "challenge" }).mode, "challenge");
  const bad = store.createProject({ mode: "nope" as never });
  assert.equal(bad.mode, "learn");
});

test("rapid creation never reuses an id, even when the generator repeats itself", () => {
  const ids = ["a", "a", "a", "b", "b", "c"];
  const store = makeStore(fakeStorage(), () => ids.shift() ?? "z");
  const created = [store.createProject(), store.createProject(), store.createProject()];
  assert.deepEqual(created.map((p) => p.id), ["a", "b", "c"]);
  assert.equal(new Set(store.listProjects().map((p) => p.id)).size, 3);
});

test("fifty rapid creations produce fifty distinct projects", () => {
  const store = makeStore();
  for (let i = 0; i < 50; i += 1) store.createProject();
  assert.equal(new Set(store.listProjects().map((p) => p.id)).size, 50);
});

test("a new id never collides with a damaged record that is being preserved", () => {
  const storage = fakeStorage({ version: 1, projects: [{ id: "p1", title: 5 }] });
  const store = makeStore(storage);
  const project = store.createProject();
  assert.notEqual(project.id, "p1");
});

test("a generator that can only repeat ids fails without writing", () => {
  const storage = fakeStorage();
  const store = makeStore(storage, () => "same");
  store.createProject();
  const writes = storage.writes;
  assert.throws(
    () => store.createProject(),
    (error) => error instanceof ProjectStoreError && error.code === "id-exhausted",
  );
  assert.equal(storage.writes, writes);
  assert.equal(store.listProjects().length, 1);
});

test("create failure throws, returns nothing and leaves no partial record", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  storage.failWrites = true;
  assert.throws(
    () => store.createProject(),
    (error) => error instanceof ProjectStoreError && error.code === "write-failed",
  );
  assert.equal(store.listProjects().length, 0);
  assert.equal(storage.data.has(STORAGE_KEY), false);
  assert.equal(reopen(storage).listProjects().length, 0);
});

test("create fails clearly when storage is unavailable", () => {
  const store = makeStore(null);
  assert.throws(
    () => store.createProject(),
    (error) => error instanceof ProjectStoreError && error.code === "storage-unavailable",
  );
});

test("storage that cannot be read is never overwritten", () => {
  const storage = fakeStorage({ version: 1, projects: [] });
  const store = makeStore(storage);
  storage.failReads = true;
  assert.throws(
    () => store.createProject(),
    (error) => error instanceof ProjectStoreError && error.code === "storage-unavailable",
  );
  assert.equal(storage.writes, 0);
});

test("the create action reports failure instead of a project to open", () => {
  const storage = fakeStorage();
  const actions = createProjectActions(makeStore(storage));
  const errors = silenceConsoleError();
  storage.failWrites = true;

  const result = actions.create();
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  assert.equal(errors.mock.callCount(), 1);
  errors.mock.restore();

  storage.failWrites = false;
  const retry = actions.create();
  assert.equal(retry.ok, true);
});

// ---- Loading ----

test("a stored project loads as ready, and the state is stable between reads", () => {
  const storage = fakeStorage();
  const project = makeStore(storage).createProject();
  const store = reopen(storage);
  const state = store.getProjectState(project.id);
  assert.equal(state.status, "ready");
  assert.equal(store.getProjectState(project.id), state);
});

test("a missing project is not-found", () => {
  const store = makeStore();
  store.createProject();
  assert.deepEqual(store.getProjectState("nope"), { status: "not-found" });
});

test("a damaged project record is an error, is never deleted and cannot crash loading", () => {
  const storage = fakeStorage({
    version: 1,
    projects: [
      { id: "broken", title: "", nodes: "x", edges: null, createdAt: "?", updatedAt: "?" },
      "garbage",
      null,
    ],
  });
  const store = makeStore(storage);
  assert.deepEqual(store.getProjectState("broken"), { status: "error", reason: "invalid" });
  assert.deepEqual(store.getProjectState("other"), { status: "not-found" });

  store.createProject();
  const saved = JSON.parse(storage.data.get(STORAGE_KEY) ?? "{}");
  assert.equal(saved.projects.length, 4);
});

test("unreadable storage text is an error, not not-found", () => {
  for (const raw of ["not json", "42", '{"projects": 5}']) {
    const store = makeStore(fakeStorage(raw));
    assert.deepEqual(store.getProjectState("x"), { status: "error", reason: "unreadable" });
  }
});

test("blocked storage is an error", () => {
  assert.deepEqual(makeStore(null).getProjectState("x"), {
    status: "error",
    reason: "storage-unavailable",
  });
  const storage = fakeStorage();
  storage.failReads = true;
  assert.deepEqual(makeStore(storage).getProjectState("x"), {
    status: "error",
    reason: "storage-unavailable",
  });
});

test("a project whose nodes are malformed still loads with only its valid nodes", () => {
  const seed = makeStore();
  const good = seed.createProject();
  const damaged = {
    ...good,
    nodes: [...good.nodes, { id: "x" }, 7, { id: "y", position: { x: "a", y: 1 }, data: {} }],
  };
  const state = makeStore(fakeStorage({ version: 1, projects: [damaged] })).getProjectState(good.id);
  assert.equal(state.status, "ready");
  if (state.status === "ready") assert.equal(state.project.nodes.length, 3);
});

// ---- Autosave ----

function setup() {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, store, timers);
  autosave.update(contentOf(project));
  return { storage, store, project, timers, autosave };
}

test("a graph edit is saved after the debounce, not before", () => {
  const { storage, store, project, timers, autosave } = setup();
  const nodes = [...project.nodes, node("cache-1", "cache", {}, 200)];
  const writes = storage.writes;

  autosave.update({ ...contentOf(project), nodes });
  assert.equal(autosave.getStatus(), "dirty");
  assert.equal(storage.writes, writes);

  timers.fire();
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(store.getProject(project.id)?.nodes.length, 4);
  assert.equal(reopen(storage).getProject(project.id)?.nodes.length, 4);
});

test("the status goes dirty, saving, saved", () => {
  const { project, timers, autosave } = setup();
  const seen: string[] = [];
  autosave.subscribe(() => seen.push(autosave.getStatus()));

  autosave.update({ ...contentOf(project), title: "Renamed" });
  timers.fire();
  assert.deepEqual(seen, ["dirty", "saving", "saved"]);
});

test("a burst of changes writes once, with the latest content", () => {
  const { storage, store, project, timers, autosave } = setup();
  const writes = storage.writes;
  for (let i = 1; i <= 5; i += 1) {
    autosave.update({ ...contentOf(project), title: `Title ${i}` });
  }
  assert.equal(timers.pending(), 1);
  timers.fire();
  assert.equal(storage.writes, writes + 1);
  assert.equal(store.getProject(project.id)?.title, "Title 5");
});

test("a title change is saved", () => {
  const { store, project, timers, autosave } = setup();
  autosave.update({ ...contentOf(project), title: "  Payments  " });
  timers.fire();
  assert.equal(store.getProject(project.id)?.title, "Payments");
});

test("node properties are saved and survive a reload", () => {
  const { storage, project, timers, autosave } = setup();
  const nodes = project.nodes.map((n) =>
    n.id === "server-1" ? { ...n, data: { ...n.data, properties: { replicas: 4, tls: true } } } : n,
  );
  autosave.update({ ...contentOf(project), nodes });
  timers.fire();

  const reloaded = reopen(storage).getProject(project.id);
  assert.deepEqual(reloaded?.nodes.find((n) => n.id === "server-1")?.data.properties, {
    replicas: 4,
    tls: true,
  });
});

test("edge changes are saved", () => {
  const { storage, project, timers, autosave } = setup();
  const edges = project.edges.slice(0, 1);
  autosave.update({ ...contentOf(project), edges });
  timers.fire();
  assert.equal(reopen(storage).getProject(project.id)?.edges.length, 1);

  autosave.update({ ...contentOf(project), edges: [...edges, { id: "x", source: "client-1", target: "database-1" }] });
  timers.fire();
  assert.equal(reopen(storage).getProject(project.id)?.edges.length, 2);
});

test("unchanged content, selection and measuring do not save or change updatedAt", () => {
  const { storage, store, project, timers, autosave } = setup();
  const writes = storage.writes;
  const noisy = project.nodes.map((n) => ({
    ...n,
    selected: true,
    dragging: true,
    measured: { width: 80, height: 30 },
  })) as ArchitectureFlowNode[];

  autosave.update({ ...contentOf(project), nodes: noisy });
  autosave.update(contentOf(project));
  assert.equal(timers.pending(), 0);
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(storage.writes, writes);
  assert.equal(store.getProject(project.id)?.updatedAt, project.updatedAt);
});

test("changing something back before the timer fires cancels the save", () => {
  const { storage, project, timers, autosave } = setup();
  const writes = storage.writes;
  autosave.update({ ...contentOf(project), title: "Temporary" });
  autosave.update(contentOf(project));
  assert.equal(timers.pending(), 0);
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(storage.writes, writes);
});

test("the same unsaved content reported again does not restart the debounce", () => {
  const { project, timers, autosave } = setup();
  const changed = { ...contentOf(project), title: "Changed" };
  autosave.update(changed);
  autosave.update({ ...changed, nodes: project.nodes.map((n) => ({ ...n, selected: true })) as ArchitectureFlowNode[] });
  assert.equal(timers.pending(), 1);
});

test("a save failure becomes an error state, keeps the change, and retries on the next flush", () => {
  const { storage, store, project, timers, autosave } = setup();
  const errors = silenceConsoleError();
  storage.failWrites = true;

  autosave.update({ ...contentOf(project), title: "Important" });
  timers.fire();
  assert.equal(autosave.getStatus(), "error");
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(store.getProject(project.id)?.title, project.title);

  storage.failWrites = false;
  autosave.flush();
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(store.getProject(project.id)?.title, "Important");
  errors.mock.restore();
});

test("a new change after an error is retried by the timer", () => {
  const { storage, store, project, timers, autosave } = setup();
  const errors = silenceConsoleError();
  storage.failWrites = true;
  autosave.update({ ...contentOf(project), title: "One" });
  timers.fire();
  assert.equal(autosave.getStatus(), "error");

  storage.failWrites = false;
  autosave.update({ ...contentOf(project), title: "Two" });
  assert.equal(autosave.getStatus(), "dirty");
  timers.fire();
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(store.getProject(project.id)?.title, "Two");
  errors.mock.restore();
});

test("reverting after an error returns to saved", () => {
  const { storage, project, timers, autosave } = setup();
  const errors = silenceConsoleError();
  storage.failWrites = true;
  autosave.update({ ...contentOf(project), title: "One" });
  timers.fire();
  autosave.update(contentOf(project));
  assert.equal(autosave.getStatus(), "saved");
  errors.mock.restore();
});

test("flush (page hide or leaving the workspace) writes a pending change immediately", () => {
  const { storage, project, timers, autosave } = setup();
  autosave.update({ ...contentOf(project), title: "Before leaving" });
  assert.equal(timers.pending(), 1);

  autosave.flush();
  assert.equal(timers.pending(), 0);
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(reopen(storage).getProject(project.id)?.title, "Before leaving");

  const writes = storage.writes;
  autosave.flush();
  assert.equal(storage.writes, writes);
});

test("flush with nothing pending does nothing", () => {
  const { storage, autosave } = setup();
  const writes = storage.writes;
  autosave.flush();
  assert.equal(storage.writes, writes);
});

test("a controller keeps working after flush, as it must when React remounts effects", () => {
  const { store, project, timers, autosave } = setup();
  autosave.flush();
  autosave.update({ ...contentOf(project), title: "After flush" });
  timers.fire();
  assert.equal(store.getProject(project.id)?.title, "After flush");
});

test("uses the production debounce delay", () => {
  const delays: number[] = [];
  const controller = createAutosaveController<string>({
    serialize: (value) => value,
    save: () => {},
    debounceMs: AUTOSAVE_DEBOUNCE_MS,
    timers: { set: (_cb, ms) => delays.push(ms), clear: () => {} },
  });
  controller.update("a");
  controller.update("b");
  assert.deepEqual(delays, [500]);
});

test("a save does not overwrite a title renamed elsewhere in the meantime", () => {
  const { store, project, timers, autosave } = setup();
  store.renameProject(project.id, "Renamed on the dashboard");

  autosave.update({ ...contentOf(project), nodes: [...project.nodes, node("cache-1", "cache", {}, 9)] });
  timers.fire();

  const saved = store.getProject(project.id);
  assert.equal(saved?.title, "Renamed on the dashboard");
  assert.equal(saved?.nodes.length, 4);
});

test("autosave does not bring back a deleted project and reports an error", () => {
  const { store, project, timers, autosave } = setup();
  const errors = silenceConsoleError();
  store.deleteProject(project.id);

  autosave.update({ ...contentOf(project), title: "Edited after delete" });
  timers.fire();
  assert.equal(autosave.getStatus(), "error");
  assert.equal(store.getProject(project.id), null);
  assert.equal(store.listProjects().length, 0);
  errors.mock.restore();
});

// ---- Project switching ----

test("editing project A and then opening B keeps A's edits in A and B's in B", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  const timersA = fakeTimers();
  const timersB = fakeTimers();

  const autosaveA = createProjectAutosave(a.id, store, timersA);
  autosaveA.update(contentOf(a));
  autosaveA.update({ ...contentOf(a), nodes: [...a.nodes, node("cache-1", "cache", {}, 5)] });

  // Leaving A flushes its pending edit into A, then B opens with its own controller.
  autosaveA.flush();
  const autosaveB = createProjectAutosave(b.id, store, timersB);
  autosaveB.update(contentOf(b));
  autosaveB.update({ ...contentOf(b), title: "B edited" });
  timersB.fire();

  const reloaded = reopen(storage);
  assert.equal(reloaded.getProject(a.id)?.nodes.length, 4);
  assert.equal(reloaded.getProject(a.id)?.title, "A");
  assert.equal(reloaded.getProject(b.id)?.nodes.length, 3);
  assert.equal(reloaded.getProject(b.id)?.title, "B edited");
});

test("a controller can only ever write to its own project", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  const timers = fakeTimers();

  const autosaveA = createProjectAutosave(a.id, store, timers);
  autosaveA.update(contentOf(a));
  autosaveA.update({ ...contentOf(a), title: "A changed" });
  // B's state is opened and edited while A's save is still pending.
  const autosaveB = createProjectAutosave(b.id, store, timers);
  autosaveB.update(contentOf(b));
  timers.fire();

  assert.equal(store.getProject(a.id)?.title, "A changed");
  assert.equal(store.getProject(b.id)?.title, "B");
  assert.equal(store.getProject(b.id)?.updatedAt, b.updatedAt);
});

test("a fresh controller treats the content it first sees as already saved", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  const timers = fakeTimers();
  const writes = storage.writes;

  const autosaveB = createProjectAutosave(b.id, store, timers);
  autosaveB.update(contentOf(b));
  assert.equal(timers.pending(), 0);
  assert.equal(storage.writes, writes);
  assert.equal(store.getProject(a.id)?.updatedAt, a.updatedAt);
});

test("diffProjectContent reports only the fields that changed", () => {
  const project = makeStore().createProject();
  assert.deepEqual(diffProjectContent(contentOf(project), contentOf(project)), {});
  assert.deepEqual(
    Object.keys(diffProjectContent(contentOf(project), { ...contentOf(project), title: "New" })),
    ["title"],
  );
  assert.deepEqual(
    Object.keys(diffProjectContent(contentOf(project), { ...contentOf(project), edges: [] })),
    ["edges"],
  );
  assert.deepEqual(
    diffProjectContent(contentOf(project), { ...contentOf(project), title: "   " }),
    {},
  );
});

// ---- Reopen ----

test("create, edit, save, reload gives the same architecture", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject({ title: "Shop" });
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, store, timers);
  autosave.update(contentOf(project));

  const nodes = [
    ...project.nodes,
    node("cache-1", "cache", { properties: { ttl: 60 } }, 123),
  ];
  const edges = [...project.edges, { id: "e3", source: "server-1", target: "cache-1" }];
  autosave.update({ title: "Shop v2", nodes, edges });
  timers.fire();

  const saved = reopen(storage).getProject(project.id);
  assert.equal(saved?.title, "Shop v2");
  assert.deepEqual(saved?.nodes.map((n) => n.id), ["client-1", "server-1", "database-1", "cache-1"]);
  assert.deepEqual(saved?.nodes[3].position, { x: 123, y: 0 });
  assert.deepEqual(saved?.nodes[3].data.properties, { ttl: 60 });
  assert.equal(saved?.edges.length, 3);
});

// ---- Rename ----

test("rename trims, persists and changes updatedAt but not createdAt", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const renamed = store.renameProject(project.id, "  URL Shortener  ");
  assert.equal(renamed?.title, "URL Shortener");
  assert.notEqual(renamed?.updatedAt, project.updatedAt);
  assert.equal(renamed?.createdAt, project.createdAt);
  assert.equal(reopen(storage).getProject(project.id)?.title, "URL Shortener");
});

test("renaming to the same title is not an edit", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const writes = storage.writes;
  const same = store.renameProject(project.id, ` ${project.title} `);
  assert.equal(same?.updatedAt, project.updatedAt);
  assert.equal(storage.writes, writes);
});

test("invalid names are rejected without a write", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const writes = storage.writes;

  for (const bad of ["", "   ", "x".repeat(MAX_TITLE_LENGTH + 1)]) {
    const result = store.renameProject(project.id, bad);
    assert.equal(result?.title, project.title);
    assert.equal(result?.updatedAt, project.updatedAt);
  }
  assert.equal(storage.writes, writes);

  const longest = "y".repeat(MAX_TITLE_LENGTH);
  assert.equal(store.renameProject(project.id, longest)?.title, longest);
});

test("the same title limit applies to content updates and autosave", () => {
  const store = makeStore();
  const project = store.createProject();
  const updated = store.updateProject(project.id, { title: "z".repeat(MAX_TITLE_LENGTH + 1) });
  assert.equal(updated?.title, project.title);
  assert.equal(store.updateProject(project.id, { title: "  " })?.title, project.title);
});

test("a failed rename throws and the store keeps the old title", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject({ title: "Old" });
  storage.failWrites = true;
  assert.throws(() => store.renameProject(project.id, "New"), ProjectStoreError);
  assert.equal(store.getProject(project.id)?.title, "Old");
  assert.equal(reopen(storage).getProject(project.id)?.title, "Old");
});

test("the rename action reports a failed rename", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const actions = createProjectActions(store);
  const project = store.createProject({ title: "Old" });
  const errors = silenceConsoleError();
  storage.failWrites = true;

  const result = actions.rename(project.id, "New");
  assert.equal(result.ok, false);
  assert.equal(store.getProject(project.id)?.title, "Old");
  errors.mock.restore();

  storage.failWrites = false;
  assert.equal(actions.rename("missing", "New").ok, false);
  assert.equal(actions.rename(project.id, "New").ok, true);
});

// ---- Duplicate ----

test("a duplicate has a new id, its own timestamps and a distinct title", () => {
  const store = makeStore();
  const original = store.createProject({ title: "Shop" });
  const first = store.duplicateProject(original.id);
  const second = store.duplicateProject(original.id);
  assert.notEqual(first?.id, original.id);
  assert.notEqual(first?.id, second?.id);
  assert.equal(first?.title, "Shop Copy");
  assert.equal(second?.title, "Shop Copy 2");
  assert.equal(store.duplicateProject(first?.id ?? "")?.title, "Shop Copy Copy");
  assert.equal(first?.createdAt, first?.updatedAt);
  assert.equal(first?.lastOpenedAt, first?.createdAt);
  assert.notEqual(first?.createdAt, original.createdAt);
  assert.equal(first?.source, "duplicate");
  assert.equal(first?.mode, original.mode);
});

test("duplicate titles stay within the limit and stay unique", () => {
  const store = makeStore();
  const original = store.createProject({ title: "t".repeat(MAX_TITLE_LENGTH) });
  const titles = new Set([original.title]);
  for (let i = 0; i < 12; i += 1) {
    const copy = store.duplicateProject(original.id);
    assert.ok(copy);
    assert.ok(copy.title.length <= MAX_TITLE_LENGTH);
    assert.equal(titles.has(copy.title), false);
    titles.add(copy.title);
  }
});

test("a duplicate shares no mutable references with the original", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const original = store.createProject({
    nodes: [
      node("server-1", "server", { properties: { replicas: 2 } }),
      node("database-1", "database"),
    ],
    edges: [{ id: "e", source: "server-1", target: "database-1" }],
  });
  const copy = store.duplicateProject(original.id);
  assert.ok(copy);

  assert.notEqual(copy.nodes, original.nodes);
  assert.notEqual(copy.nodes[0], original.nodes[0]);
  assert.notEqual(copy.nodes[0].data, original.nodes[0].data);
  assert.notEqual(copy.nodes[0].data.properties, original.nodes[0].data.properties);
  assert.notEqual(copy.nodes[0].position, original.nodes[0].position);
  assert.notEqual(copy.edges[0], original.edges[0]);

  // Editing the copy through the store leaves the original untouched.
  store.updateProject(copy.id, {
    nodes: copy.nodes.map((n) => ({ ...n, data: { ...n.data, properties: { replicas: 9 } } })),
  });
  store.renameProject(copy.id, "Changed");
  const after = reopen(storage).getProject(original.id);
  assert.deepEqual(after?.nodes[0].data.properties, { replicas: 2 });
  assert.equal(after?.title, original.title);
  assert.equal(after?.updatedAt, original.updatedAt);
});

test("a failed duplicate throws and adds nothing", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  storage.failWrites = true;
  assert.throws(() => store.duplicateProject(project.id), ProjectStoreError);
  assert.equal(store.listProjects().length, 1);
  assert.equal(reopen(storage).listProjects().length, 1);
});

test("the duplicate action reports failure and missing projects", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const actions = createProjectActions(store);
  const project = store.createProject();
  const errors = silenceConsoleError();

  assert.equal(actions.duplicate("missing").ok, false);
  storage.failWrites = true;
  assert.equal(actions.duplicate(project.id).ok, false);
  errors.mock.restore();
  storage.failWrites = false;
  assert.equal(actions.duplicate(project.id).ok, true);
});

// ---- Delete ----

test("delete removes only the selected project", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  const c = store.createProject({ title: "C" });

  assert.equal(store.deleteProject(b.id), true);
  const reloaded = reopen(storage);
  assert.deepEqual(reloaded.listProjects().map((p) => p.id).sort(), [a.id, c.id].sort());
  assert.deepEqual(reloaded.getProject(a.id), a);
  assert.deepEqual(reloaded.getProject(c.id), c);
});

test("a failed delete throws and the project is still there", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  storage.failWrites = true;
  assert.throws(() => store.deleteProject(project.id), ProjectStoreError);
  assert.notEqual(store.getProject(project.id), null);
  assert.notEqual(reopen(storage).getProject(project.id), null);
});

test("the delete action does not report success for a failure or a missing project", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const actions = createProjectActions(store);
  const project = store.createProject();
  const errors = silenceConsoleError();

  storage.failWrites = true;
  assert.equal(actions.remove(project.id).ok, false);
  assert.notEqual(store.getProject(project.id), null);

  storage.failWrites = false;
  assert.equal(actions.remove("missing").ok, false);
  assert.equal(actions.remove(project.id).ok, true);
  assert.equal(store.getProject(project.id), null);
  errors.mock.restore();
});

test("deleting the open project makes it not-found, and other projects stay ready", () => {
  const store = makeStore();
  const open = store.createProject();
  const other = store.createProject();
  store.deleteProject(open.id);
  assert.deepEqual(store.getProjectState(open.id), { status: "not-found" });
  assert.equal(store.getProjectState(other.id).status, "ready");
});

// ---- Timestamps and ordering ----

test("opening a project changes lastOpenedAt only", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const opened = store.markProjectOpened(project.id);

  assert.notEqual(opened?.lastOpenedAt, project.lastOpenedAt);
  assert.equal(opened?.updatedAt, project.updatedAt);
  assert.equal(opened?.createdAt, project.createdAt);
  assert.deepEqual(opened?.nodes, project.nodes);
  assert.equal(reopen(storage).getProject(project.id)?.updatedAt, project.updatedAt);
  assert.equal(store.markProjectOpened("missing"), null);
});

test("an edit changes updatedAt and leaves lastOpenedAt alone", () => {
  const store = makeStore();
  const project = store.createProject();
  const edited = store.updateProject(project.id, { nodes: project.nodes.slice(0, 2) });
  assert.notEqual(edited?.updatedAt, project.updatedAt);
  assert.equal(edited?.lastOpenedAt, project.lastOpenedAt);
});

test("an update that changes nothing writes nothing and keeps updatedAt", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const writes = storage.writes;
  const same = store.updateProject(project.id, contentOf(project));
  assert.equal(same?.updatedAt, project.updatedAt);
  assert.equal(storage.writes, writes);
});

test("the dashboard lists the most recently opened or edited project first", () => {
  const store = makeStore();
  const a = store.createProject({ title: "A" });
  const b = store.createProject({ title: "B" });
  const c = store.createProject({ title: "C" });
  assert.deepEqual(store.listProjects().map((p) => p.id), [c.id, b.id, a.id]);

  store.markProjectOpened(a.id);
  assert.deepEqual(store.listProjects().map((p) => p.id), [a.id, c.id, b.id]);

  store.renameProject(b.id, "B2");
  assert.deepEqual(store.listProjects().map((p) => p.id), [b.id, a.id, c.id]);
});

// ---- Backward compatibility ----

test("records saved before lastOpenedAt, mode and source existed still load", () => {
  const legacy = {
    version: 1,
    projects: [
      {
        id: "old",
        title: "Old project",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-02-01T00:00:00.000Z",
        nodes: [node("client-1", "client")],
        edges: [],
      },
    ],
  };
  const storage = fakeStorage(legacy);
  const store = makeStore(storage);
  const project = store.getProject("old");

  assert.ok(project);
  // Projects saved before the free workspace was folded into Learn and Challenge read as Learn.
  assert.equal(project.mode, "learn");
  assert.equal(project.lastOpenedAt, "2025-02-01T00:00:00.000Z");
  assert.equal("source" in project, false);
  assert.equal(project.updatedAt, "2025-02-01T00:00:00.000Z");

  // The next write keeps the record and adds the new fields.
  store.markProjectOpened("old");
  const saved = JSON.parse(storage.data.get(STORAGE_KEY) ?? "{}").projects[0];
  assert.equal(saved.mode, "learn");
  assert.equal(saved.updatedAt, "2025-02-01T00:00:00.000Z");
});

test("invalid mode, source or lastOpenedAt values fall back instead of dropping the project", () => {
  const record = {
    id: "odd",
    title: "Odd",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-02-01T00:00:00.000Z",
    lastOpenedAt: "not a date",
    mode: "spaceship",
    source: 42,
    nodes: [],
    edges: [],
  };
  const project = makeStore(fakeStorage({ version: 1, projects: [record] })).getProject("odd");
  assert.equal(project?.mode, "learn");
  assert.equal(project?.lastOpenedAt, record.updatedAt);
  assert.equal("source" in (project ?? {}), false);
});

test("mode and source round-trip", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject({ mode: "learn", source: "template" });
  const reloaded = reopen(storage).getProject(project.id);
  assert.equal(reloaded?.mode, "learn");
  assert.equal(reloaded?.source, "template");
});
