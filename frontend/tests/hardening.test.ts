import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { urlShortenerDefinition } from "../src/components/challenge/challenges.ts";
import { firstWebSystemLesson } from "../src/components/learn/lessons.ts";
import { createProjectAutosave } from "../src/components/projects/projectAutosave.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";
import { STARTER_EDGES, STARTER_NODES } from "../src/components/projects/starterArchitecture.ts";
import { buildChallengeView } from "../src/lib/architecture/challenge/view.ts";
import { challengeFingerprint, createChallengeSession } from "../src/lib/architecture/challenge/session.ts";
import { fingerprintEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import { buildResultsView } from "../src/lib/architecture/evaluation/resultsView.ts";
import { evaluateDesign } from "../src/lib/architecture/evaluation/evaluationService.ts";
import { createRunSession } from "../src/lib/architecture/evaluation/runSession.ts";
import { DEFAULT_TRAFFIC } from "../src/lib/architecture/evaluation/traffic.ts";
import {
  applySnapshot,
  createGraphHistory,
  toSnapshot,
} from "../src/lib/architecture/graphHistory.ts";
import { resolveShortcut } from "../src/lib/architecture/keyboard.ts";
import { labelsOf, sameLabels } from "../src/lib/architecture/labels.ts";
import { createNodeIdAllocator } from "../src/lib/architecture/nodeIds.ts";
import {
  addNode,
  removeFromGraph,
  removeSelected,
  type EdgeLike,
  type NodeLike,
} from "../src/lib/architecture/nodeOperations.ts";
import { commitPropertyDraft, resetComponentProperty, setComponentProperty } from "../src/lib/architecture/propertyEditing.ts";
import { reconcileLearnSession, createLearnSession } from "../src/lib/architecture/learn/session.ts";
import { duplicateSelection } from "../src/lib/architecture/clipboard.ts";
import { planReset } from "../src/lib/architecture/reset.ts";
import { getSelection, selectNode } from "../src/lib/architecture/selection.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";

// ---- Helpers ----

type TNode = NodeLike & { type: "architecture" };
type Graph = { nodes: TNode[]; edges: EdgeLike[] };

const node = (
  id: string,
  type: ArchitectureNodeType = "server",
  properties?: Record<string, string | number | boolean>,
): TNode => ({
  id,
  type: "architecture",
  position: { x: 0, y: 0 },
  data: { type, label: id, ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string): EdgeLike => ({ id: `${source}->${target}`, source, target });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

const design = (): Graph => ({
  nodes: [node("client-1", "client"), node("server-1"), node("database-1", "database")],
  edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
});

const starter = (): Graph => ({
  nodes: STARTER_NODES.map((n) => JSON.parse(JSON.stringify(n))) as TNode[],
  edges: STARTER_EDGES.map((e) => JSON.parse(JSON.stringify(e))) as EdgeLike[],
});

// What the editor does with every change: history sees the graph, and undo/redo restore it.
function editor(initial: Graph) {
  let state = initial;
  const history = createGraphHistory(toSnapshot(state.nodes, state.edges));
  const allocate = createNodeIdAllocator(ids(initial.nodes));
  const observe = () => history.observe(toSnapshot(state.nodes, state.edges));
  const restore = (snapshot: ReturnType<typeof history.undo>) => {
    if (snapshot) state = applySnapshot(state, snapshot) as Graph;
    observe();
  };
  return {
    history,
    allocate,
    get state() {
      return state;
    },
    set(next: Graph) {
      state = next;
      return observe();
    },
    undo: () => restore(history.undo()),
    redo: () => restore(history.redo()),
  };
}

// Nothing selected may point at something that is not there, and no connection may dangle.
function assertSane(graph: Graph) {
  const nodeIds = new Set(ids(graph.nodes));
  assert.equal(new Set(nodeIds).size, graph.nodes.length, "duplicate node ids");
  assert.equal(new Set(ids(graph.edges)).size, graph.edges.length, "duplicate edge ids");
  for (const e of graph.edges) {
    assert.ok(nodeIds.has(e.source) && nodeIds.has(e.target), `dangling edge ${e.id}`);
  }
  const selection = getSelection(graph.nodes, graph.edges);
  const selectedNodes =
    selection.kind === "node" ? [selection.nodeId] : selection.kind === "multiple" ? selection.nodeIds : [];
  for (const id of selectedNodes) assert.ok(nodeIds.has(id), `selected ${id} is gone`);
}

function memoryStorage(): StorageLike & { data: Map<string, string>; writes: () => number } {
  const data = new Map<string, string>();
  let writes = 0;
  return {
    data,
    writes: () => writes,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      data.set(key, value);
    },
  };
}

function makeStore(storage: StorageLike | null, newId?: () => string) {
  let tick = 0;
  let id = 0;
  return createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: newId ?? (() => `p${++id}`),
  });
}

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

const input = (graph: Graph, traffic: unknown = DEFAULT_TRAFFIC) => ({
  projectId: "p",
  nodes: graph.nodes as never,
  edges: graph.edges,
  traffic,
});

// ---- Reset ----

test("workspace reset restores the starter, and replacing a design asks first", () => {
  const plan = planReset("workspace", design(), starter());
  assert.deepEqual(plan, { changesGraph: true, needsConfirmation: true, resetsSession: false });
});

test("workspace reset on the starter does nothing at all", () => {
  assert.deepEqual(planReset("workspace", starter(), starter()), {
    changesGraph: false,
    needsConfirmation: false,
    resetsSession: false,
  });
  // A moved node is a change too.
  const moved = starter();
  moved.nodes[0] = { ...moved.nodes[0], position: { x: 1, y: 1 } };
  assert.equal(planReset("workspace", moved, starter()).changesGraph, true);
});

test("workspace reset on an emptied canvas restores the starter without asking", () => {
  const plan = planReset("workspace", { nodes: [], edges: [] }, starter());
  assert.deepEqual(plan, { changesGraph: true, needsConfirmation: false, resetsSession: false });
});

test("learn and challenge reset always clear their session, and never ask", () => {
  for (const mode of ["learn", "challenge"] as const) {
    const built = planReset(mode, design(), { nodes: [], edges: [] });
    assert.deepEqual(built, { changesGraph: true, needsConfirmation: false, resetsSession: true });
    const alreadyEmpty = planReset(mode, { nodes: [], edges: [] }, { nodes: [], edges: [] });
    assert.deepEqual(alreadyEmpty, { changesGraph: false, needsConfirmation: false, resetsSession: true });
  }
});

test("reset is one undoable step that leaves nothing stale selected, and redo repeats it", () => {
  const ed = editor(design());
  ed.set(selectNode(ed.state, "server-1") as Graph);
  assert.equal(getSelection(ed.state.nodes, ed.state.edges).kind, "node");

  assert.equal(ed.set(starter()), true);
  assert.equal(ed.history.undoDepth(), 1);
  assert.equal(getSelection(ed.state.nodes, ed.state.edges).kind, "none");
  assertSane(ed.state);

  ed.undo();
  assert.deepEqual(ids(ed.state.nodes), ["client-1", "server-1", "database-1"]);
  assertSane(ed.state);
  ed.redo();
  assert.deepEqual(ids(ed.state.nodes), ids(starter().nodes));
  assertSane(ed.state);
});

test("resetting a lesson, then undoing the reset, brings the lesson back with the design", () => {
  const built: Graph = {
    nodes: [node("c", "client"), node("s", "server"), node("d", "database")],
    edges: [edge("c", "s"), edge("s", "d")],
  };
  const ed = editor(built);
  const lessonAt = (graph: Graph) => reconcileLearnSession(firstWebSystemLesson, createLearnSession(firstWebSystemLesson), graph).currentStep;
  assert.equal(lessonAt(ed.state), 5);
  ed.set({ nodes: [], edges: [] });
  assert.equal(lessonAt(ed.state), 0);
  ed.undo();
  assert.equal(lessonAt(ed.state), 5);
});

test("resetting a challenge clears its submission, and undoing the reset restores only the design", async () => {
  const strong: Graph = {
    nodes: [node("c", "client"), node("lb", "load-balancer", { replicas: 2 }), node("s", "server", { replicas: 5 }), node("d", "database", { replicas: 2 })],
    edges: [edge("c", "lb"), edge("lb", "s"), edge("s", "d")],
  };
  const ed = editor(strong);
  const session = createChallengeSession(urlShortenerDefinition);
  await session.submit({ nodes: ed.state.nodes as never, edges: ed.state.edges });
  const view = () => buildChallengeView(session.getState(), challengeFingerprint(urlShortenerDefinition, ed.state), urlShortenerDefinition);
  assert.equal(view().phase, "results");

  // Reset: empty canvas and a cleared submission.
  ed.set({ nodes: [], edges: [] });
  session.reset();
  assert.equal(view().phase, "building");
  assert.equal(view().hasResult, false);

  // Undo brings the design back, but the submission stays cleared: submit again to be judged.
  ed.undo();
  assert.equal(ed.state.nodes.length, 4);
  assert.equal(view().hasResult, false);
  assert.equal(view().canSubmit, true);
});

// ---- Delete ----

test("deleting a node by its toolbar and by keyboard selection give identical results", () => {
  const graph = design();
  for (const target of graph.nodes) {
    const viaToolbar = removeFromGraph(graph, { nodeIds: [target.id] });
    const viaKeyboard = removeSelected(selectNode(graph, target.id) as Graph);
    assert.deepEqual(viaKeyboard.nodes.map((n) => ({ ...n, selected: undefined })), viaToolbar.nodes.map((n) => ({ ...n, selected: undefined })));
    assert.deepEqual(viaKeyboard.edges, viaToolbar.edges);
    assertSane(viaToolbar);
    assert.equal(viaToolbar.nodes.some((n) => n.id === target.id), false);
    assert.equal(viaToolbar.edges.some((e) => e.source === target.id || e.target === target.id), false);
  }
});

test("one delete is one history step, one save, and stales a result, a lesson and a submission", async () => {
  const graph: Graph = {
    nodes: [node("client-1", "client"), node("server-1"), node("database-1", "database")],
    edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
  };
  const storage = memoryStorage();
  const store = makeStore(storage);
  const project = store.createProject({ nodes: graph.nodes as never, edges: graph.edges });
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, store, timers);
  const content = (g: Graph) => ({ title: project.title, nodes: g.nodes as never, edges: g.edges });
  autosave.update(content(graph));

  const ed = editor(graph);
  const run = createRunSession(evaluateDesign);
  await run.run(input(graph));
  const challenge = createChallengeSession(urlShortenerDefinition);
  await challenge.submit({ nodes: graph.nodes as never, edges: graph.edges });
  const writesBefore = storage.writes();

  const next = removeFromGraph(ed.state, { nodeIds: ["server-1"] });
  assert.equal(ed.set(next), true);
  autosave.update(content(next));

  assert.equal(ed.history.undoDepth(), 1);
  assert.equal(timers.pending(), 1);
  timers.fire();
  assert.equal(storage.writes(), writesBefore + 1);
  assert.deepEqual(ids(store.getProject(project.id)?.nodes ?? []), ["client-1", "database-1"]);
  assert.deepEqual(store.getProject(project.id)?.edges, []);

  assert.equal(buildResultsView(run.getState(), fingerprintEvaluationInput({ graph: next, traffic: DEFAULT_TRAFFIC })).isStale, true);
  assert.equal(buildChallengeView(challenge.getState(), challengeFingerprint(urlShortenerDefinition, next), urlShortenerDefinition).isStale, true);
  const lesson = reconcileLearnSession(firstWebSystemLesson, createLearnSession(firstWebSystemLesson), next);
  assert.equal(lesson.validSteps.includes(2), false);
  assertSane(next);
});

test("deleting a selected node leaves no selection behind", () => {
  const selected = selectNode(design(), "server-1") as Graph;
  const after = removeSelected(selected);
  assert.equal(getSelection(after.nodes, after.edges).kind, "none");
});

// ---- History edge cases ----

test("deleting a node and undoing restores its attached edges, redoing removes them again", () => {
  const ed = editor(design());
  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-1"] }));
  assert.equal(ed.state.edges.length, 0);
  ed.undo();
  assert.deepEqual(ids(ed.state.edges), ["client-1->server-1", "server-1->database-1"]);
  assertSane(ed.state);
  ed.redo();
  assert.equal(ed.state.edges.length, 0);
  assertSane(ed.state);
});

test("deleting an edge and undoing restores it", () => {
  const ed = editor(design());
  ed.set(removeFromGraph(ed.state, { edgeIds: ["server-1->database-1"] }));
  assert.equal(ed.state.edges.length, 1);
  ed.undo();
  assert.equal(ed.state.edges.length, 2);
  assertSane(ed.state);
});

test("paste, then delete part of it, then undo, restores the deleted node and its edge", () => {
  const ed = editor({ ...design(), nodes: design().nodes.map((n) => ({ ...n, selected: n.id !== "client-1" })) });
  const pasted = duplicateSelection(ed.state, ed.allocate);
  assert.ok(pasted);
  ed.set(pasted.graph);
  assert.equal(ed.state.nodes.length, 5);
  const [firstCopy] = pasted.nodeIds;

  ed.set(removeFromGraph(ed.state, { nodeIds: [firstCopy] }));
  assert.equal(ed.state.nodes.length, 4);
  assertSane(ed.state);
  ed.undo();
  assert.equal(ed.state.nodes.length, 5);
  assert.ok(ed.state.edges.some((e) => e.source === pasted.nodeIds[0] && e.target === pasted.nodeIds[1]));
  assertSane(ed.state);
  ed.undo();
  assert.equal(ed.state.nodes.length, 3);
  assertSane(ed.state);
});

test("a setting edit, a reset of that setting, and undo go back one value at a time", () => {
  const ed = editor(design());
  const apply = (result: ReturnType<typeof setComponentProperty>) => {
    assert.ok(result.ok);
    if (result.ok) ed.set({ ...ed.state, nodes: result.nodes as TNode[] });
  };
  apply(setComponentProperty(ed.state.nodes, "server-1", "replicas", 4));
  apply(resetComponentProperty(ed.state.nodes, "server-1", "replicas"));
  const replicas = () => ed.state.nodes.find((n) => n.id === "server-1")?.data.properties?.replicas;
  assert.equal(replicas(), undefined);
  ed.undo();
  assert.equal(replicas(), 4);
  ed.undo();
  assert.equal(replicas(), undefined);
  ed.redo();
  assert.equal(replicas(), 4);
  assertSane(ed.state);
});

test("a run result is current again after undoing back to the evaluated graph, and stale after redo", async () => {
  const ed = editor(design());
  const run = createRunSession(evaluateDesign);
  await run.run(input(ed.state));
  const stale = () => buildResultsView(run.getState(), fingerprintEvaluationInput({ graph: ed.state, traffic: DEFAULT_TRAFFIC })).isStale;
  const withCache = addNode(ed.state.nodes, "cache", (id) => node(id, "cache"), ed.allocate).nodes;
  ed.set({ ...ed.state, nodes: withCache });
  assert.equal(stale(), true);
  ed.undo();
  assert.equal(stale(), false);
  ed.redo();
  assert.equal(stale(), true);
});

test("a challenge result is current again after undoing to the submitted design", async () => {
  const submitted = design();
  const ed = editor(submitted);
  const session = createChallengeSession(urlShortenerDefinition);
  await session.submit({ nodes: ed.state.nodes as never, edges: ed.state.edges });
  const stale = () => buildChallengeView(session.getState(), challengeFingerprint(urlShortenerDefinition, ed.state), urlShortenerDefinition).isStale;

  ed.set({ ...ed.state, edges: ed.state.edges.slice(0, 1) });
  assert.equal(stale(), true);
  ed.undo();
  assert.equal(stale(), false);
  ed.redo();
  assert.equal(stale(), true);
  ed.undo();
  assert.equal(stale(), false);
});

// ---- Settings drafts ----

test("a draft cannot change a component that is no longer there", () => {
  const nodes = [node("a", "server")];
  const result = commitPropertyDraft(nodes, "gone", "replicas", "3");
  assert.ok(!result.ok && result.reason === "node-not-found");
  assert.equal(nodes[0].data.properties, undefined);
});

test("a draft typed for one project cannot reach another project's component", () => {
  const projectA = [node("server-1", "server", { replicas: 2 })];
  const projectB = [node("server-9", "server")];
  assert.equal(commitPropertyDraft(projectB, "server-1", "replicas", "5").ok, false);
  assert.equal(projectB[0].data.properties, undefined);
  assert.equal(projectA[0].data.properties?.replicas, 2);
});

test("a component deleted and restored with undo keeps its settings", () => {
  const withSetting: Graph = { ...design(), nodes: design().nodes.map((n) => (n.id === "server-1" ? node("server-1", "server", { replicas: 3 }) : n)) };
  const ed = editor(withSetting);
  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-1"] }));
  ed.undo();
  assert.equal(ed.state.nodes.find((n) => n.id === "server-1")?.data.properties?.replicas, 3);
});

// ---- Learn ----

test("extra, duplicate and irrelevant components do not confuse the lesson", () => {
  const base: Graph = { nodes: [node("c", "client"), node("s", "server"), node("d", "database")], edges: [edge("c", "s"), edge("s", "d")] };
  const cluttered: Graph = {
    nodes: [...base.nodes, node("s2", "server"), node("c2", "client"), node("w", "worker"), node("q", "queue")],
    edges: [...base.edges, edge("c2", "s2")],
  };
  const at = (graph: Graph) => reconcileLearnSession(firstWebSystemLesson, createLearnSession(firstWebSystemLesson), graph);
  assert.deepEqual(at(base).validSteps, [1, 2, 3, 4, 5]);
  // A second server is a second instance, so "run more than one server" holds (step 8), but
  // the extra client, worker and queue change nothing, and the lesson still waits at step 6.
  assert.deepEqual(at(cluttered).validSteps, [1, 2, 3, 4, 5, 8]);
  assert.equal(at(cluttered).currentStep, 5);
});

test("a reversed connection does not complete the connection step", () => {
  const reversed: Graph = { nodes: [node("c", "client"), node("s", "server")], edges: [edge("s", "c")] };
  const session = reconcileLearnSession(firstWebSystemLesson, createLearnSession(firstWebSystemLesson), reversed);
  assert.equal(session.currentStep, 2);
  assert.equal(session.validSteps.includes(3), false);
});

test("lowering a setting after the lesson was finished reopens that step but remembers the finish", () => {
  const finished: Graph = {
    nodes: [node("c", "client"), node("s", "server", { replicas: 2 }), node("d", "database"), node("k", "cache")],
    edges: [edge("c", "s"), edge("s", "d"), edge("s", "k")],
  };
  const done = reconcileLearnSession(firstWebSystemLesson, createLearnSession(firstWebSystemLesson), finished);
  assert.equal(done.status, "completed");
  const lowered: Graph = { ...finished, nodes: finished.nodes.map((n) => (n.id === "s" ? node("s", "server") : n)) };
  const after = reconcileLearnSession(firstWebSystemLesson, done, lowered);
  assert.equal(after.status, "in-progress");
  assert.equal(after.currentStep, 7);
  assert.equal(after.everCompleted, true);
});

// ---- Cross-tab ----

test("another tab's new project appears, and both tabs' creations survive", () => {
  const storage = memoryStorage();
  const tabA = makeStore(storage, () => "from-a");
  const tabB = makeStore(storage, () => "from-b");
  tabA.createProject({ title: "A" });
  assert.deepEqual(tabB.listProjects().map((p) => p.id), ["from-a"]);
  tabB.createProject({ title: "B" });
  assert.deepEqual(tabA.listProjects().map((p) => p.id).sort(), ["from-a", "from-b"]);
});

test("another tab's rename is seen, and a stale tab's content save does not undo it", () => {
  const storage = memoryStorage();
  const tabA = makeStore(storage);
  const tabB = makeStore(storage);
  const project = tabA.createProject({ title: "Original" });
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, tabA, timers);
  const content = (nodes: unknown) => ({ title: "Original", nodes: nodes as never, edges: project.edges });
  autosave.update(content(project.nodes));

  tabB.renameProject(project.id, "Renamed elsewhere");
  assert.equal(tabA.getProject(project.id)?.title, "Renamed elsewhere");

  autosave.update(content(project.nodes.slice(0, 2)));
  timers.fire();
  const saved = tabB.getProject(project.id);
  assert.equal(saved?.title, "Renamed elsewhere");
  assert.equal(saved?.nodes.length, 2);
});

test("a project deleted in another tab is gone here, and nothing here brings it back", () => {
  const storage = memoryStorage();
  const tabA = makeStore(storage);
  const tabB = makeStore(storage);
  const keep = tabA.createProject({ title: "Keep" });
  const doomed = tabA.createProject({ title: "Doomed" });
  assert.equal(tabA.getProjectState(doomed.id).status, "ready");

  tabB.deleteProject(doomed.id);
  assert.deepEqual(tabA.getProjectState(doomed.id), { status: "not-found" });
  assert.deepEqual(tabA.listProjects().map((p) => p.id), [keep.id]);
  assert.equal(tabA.updateProject(doomed.id, { title: "Still editing" }), null);
  assert.equal(tabA.markProjectOpened(doomed.id), null);
  assert.equal(tabA.duplicateProject(doomed.id), null);
  assert.deepEqual(tabB.listProjects().map((p) => p.id), [keep.id]);
  // Creating something new in the stale tab keeps the other tab's work.
  tabA.createProject({ title: "New" });
  assert.equal(tabB.listProjects().length, 2);
  assert.equal(tabB.getProject(doomed.id), null);
});

test("an open project whose project was deleted elsewhere reports a save error instead of recreating it", () => {
  const storage = memoryStorage();
  const tabA = makeStore(storage);
  const tabB = makeStore(storage);
  const project = tabA.createProject({ title: "Open here" });
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, tabA, timers);
  const content = (title: string) => ({ title, nodes: project.nodes as never, edges: project.edges });
  autosave.update(content("Open here"));
  tabB.deleteProject(project.id);

  const original = console.error;
  console.error = () => {};
  try {
    autosave.update(content("Edited after deletion"));
    timers.fire();
  } finally {
    console.error = original;
  }
  assert.equal(autosave.getStatus(), "error");
  assert.equal(tabB.getProject(project.id), null);
  assert.equal(tabB.listProjects().length, 0);
});

test("a change in another tab is not mistaken for no change by the list cache", () => {
  const storage = memoryStorage();
  const tabA = makeStore(storage);
  const tabB = makeStore(storage);
  tabA.createProject({ title: "One" });
  const before = tabA.listProjects();
  assert.equal(tabA.listProjects(), before);
  tabB.createProject({ title: "Two" });
  const after = tabA.listProjects();
  assert.notEqual(after, before);
  assert.equal(after.length, 2);
});

// ---- Storage problems ----

test("storage that is blocked, unreadable or fine is told apart", () => {
  assert.equal(makeStore(null).getStorageIssue(), "unavailable");
  const failing = memoryStorage();
  failing.getItem = () => {
    throw new Error("blocked");
  };
  assert.equal(makeStore(failing).getStorageIssue(), "unavailable");

  const broken = memoryStorage();
  broken.data.set(STORAGE_KEY, "not json");
  const brokenStore = makeStore(broken);
  assert.equal(brokenStore.getStorageIssue(), "unreadable");
  assert.equal(broken.data.get(STORAGE_KEY), "not json");
  assert.equal(broken.writes(), 0);

  const fine = memoryStorage();
  assert.equal(makeStore(fine).getStorageIssue(), null);
  const populated = makeStore(fine);
  populated.createProject();
  assert.equal(populated.getStorageIssue(), null);
});

test("a project list with one damaged record is not a storage problem", () => {
  const storage = memoryStorage();
  storage.data.set(STORAGE_KEY, JSON.stringify({ version: 1, projects: [{ id: "bad" }] }));
  assert.equal(makeStore(storage).getStorageIssue(), null);
});

// ---- Labels ----

test("names only count as changed when a name changed", () => {
  const nodes = design().nodes;
  const labels = labelsOf(nodes);
  assert.deepEqual(labels, { "client-1": "client-1", "server-1": "server-1", "database-1": "database-1" });
  const moved = nodes.map((n) => ({ ...n, position: { x: 5, y: 5 } }));
  assert.equal(sameLabels(labels, labelsOf(moved)), true);
  const renamed = nodes.map((n) => (n.id === "server-1" ? { ...n, data: { ...n.data, label: "API" } } : n));
  assert.equal(sameLabels(labels, labelsOf(renamed)), false);
  assert.equal(sameLabels(labels, labelsOf(nodes.slice(1))), false);
  assert.equal(sameLabels({}, {}), true);
});

// ---- Keyboard ----

test("every shortcut means exactly one thing, and none fires while typing", () => {
  const table: [Record<string, unknown>, string][] = [
    [{ key: "Delete" }, "delete-selection"],
    [{ key: "Backspace" }, "delete-selection"],
    [{ key: "Escape" }, "clear-selection"],
    [{ key: "s", ctrlKey: true }, "save-now"],
    [{ key: "z", ctrlKey: true }, "undo"],
    [{ key: "z", ctrlKey: true, shiftKey: true }, "redo"],
    [{ key: "y", ctrlKey: true }, "redo"],
    [{ key: "c", ctrlKey: true }, "copy"],
    [{ key: "v", ctrlKey: true }, "paste"],
    [{ key: "d", ctrlKey: true }, "duplicate"],
  ];
  for (const [event, intent] of table) {
    assert.equal(resolveShortcut(event as never), intent, JSON.stringify(event));
    const command = event.ctrlKey ? { ...event, ctrlKey: false, metaKey: true } : event;
    assert.equal(resolveShortcut(command as never), intent, `cmd ${JSON.stringify(event)}`);
    for (const target of [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) {
      assert.equal(resolveShortcut({ ...event, target } as never), null, `${JSON.stringify(event)} in ${target.tagName}`);
    }
    assert.equal(resolveShortcut({ ...event, isComposing: true } as never), null);
    assert.equal(resolveShortcut({ ...event, defaultPrevented: true } as never), null);
    assert.equal(resolveShortcut({ ...event, altKey: true } as never), null);
  }
});

test("browser shortcuts that Architech does not use are left alone", () => {
  for (const key of ["a", "x", "f", "r", "p", "t", "w", "n", "l", "k", "b", "u", "i"]) {
    assert.equal(resolveShortcut({ key, ctrlKey: true }), null, key);
    assert.equal(resolveShortcut({ key, metaKey: true }), null, key);
  }
  assert.equal(resolveShortcut({ key: "Tab" }), null);
  assert.equal(resolveShortcut({ key: "Enter" }), null);
  assert.equal(resolveShortcut({ key: "Delete", shiftKey: true }), null);
  assert.equal(resolveShortcut({ key: "Backspace", ctrlKey: true }), null);
});

// ---- Controls ----

// Finds every <button ...> opening tag in a source file, including ones whose attributes
// contain arrow functions (which contain ">").
function buttonTags(source: string): string[] {
  const tags: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("<button", from);
    if (start === -1) break;
    let depth = 0;
    let quote: string | null = null;
    let end = start;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    tags.push(source.slice(start, end + 1));
    from = end + 1;
  }
  return tags;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

test("every button in the new app does something, or is disabled and says why", () => {
  const roots = [
    "app",
    "src/components/dashboard",
    "src/components/workspace",
    "src/components/learn",
    "src/components/challenge",
    "src/components/projects",
  ];
  const offenders: string[] = [];
  let checked = 0;
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      for (const tag of buttonTags(readFileSync(file, "utf8"))) {
        checked += 1;
        const acts = /\bonClick=|type="submit"|\{\.\.\./.test(tag);
        const explainedDisabled = /(?<![-\w])disabled\b/.test(tag) && /\btitle=/.test(tag);
        if (!acts && !explainedDisabled) offenders.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
  }
  assert.ok(checked > 20, `only ${checked} buttons were checked`);
  assert.deepEqual(offenders, []);
});

test("controls that are intentionally disabled are the ones we know about", () => {
  const known = new Map<string, number>([
    ["src/components/dashboard/SystemTutorials.tsx", 2],
    ["src/components/workspace/NodeContextUi.tsx", 1],
  ]);
  const found = new Map<string, number>();
  for (const file of sourceFiles("src/components")) {
    const normalized = file.replace(/\\/g, "/");
    if (/\/ui\.tsx$/.test(normalized)) continue;
    const count = buttonTags(readFileSync(file, "utf8")).filter((tag) => /(?<![-\w])disabled\b/.test(tag)).length;
    if (count > 0) found.set(normalized, count);
  }
  assert.deepEqual([...found.entries()].sort(), [...known.entries()].sort());
});
