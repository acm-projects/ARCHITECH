import assert from "node:assert/strict";
import test from "node:test";

import {
  PASTE_OFFSET,
  copySelection,
  duplicateSelection,
  pasteClipboard,
} from "../src/lib/architecture/clipboard.ts";
import { addConnection } from "../src/lib/architecture/connections.ts";
import {
  applySnapshot,
  coalesceKeyFor,
  createGraphHistory,
  toSnapshot,
} from "../src/lib/architecture/graphHistory.ts";
import {
  DEFAULT_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  record,
  redo,
  undo,
} from "../src/lib/architecture/history.ts";
import { resolveShortcut } from "../src/lib/architecture/keyboard.ts";
import {
  createNodeIdAllocator,
  generateNodeId,
} from "../src/lib/architecture/nodeIds.ts";
import {
  addNode,
  moveNode,
  removeFromGraph,
  removeSelected,
  setNodeProperty,
  type EdgeLike,
  type NodeLike,
} from "../src/lib/architecture/nodeOperations.ts";
import { getSelection, selectNode } from "../src/lib/architecture/selection.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";
import { createProjectAutosave } from "../src/components/projects/projectAutosave.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";

// ---- Helpers ----

type TNode = NodeLike & { dragging?: boolean; measured?: { width: number; height: number } };
type Graph = { nodes: TNode[]; edges: EdgeLike[] };

const node = (
  id: string,
  type: ArchitectureNodeType = "server",
  extra: Partial<TNode> & { properties?: Record<string, string | number | boolean> } = {},
): TNode => {
  const { properties, ...rest } = extra;
  return {
    id,
    type: "architecture",
    position: { x: 0, y: 0 },
    data: { type, label: id, ...(properties ? { properties } : {}) },
    ...rest,
  };
};
const edge = (source: string, target: string, selected = false): EdgeLike => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(selected ? { selected } : {}),
});
const ids = (items: { id: string }[]) => items.map((item) => item.id);

// Behaves like the workspace does: every change to the graph is reported to the history
// the way useGraphHistory reports it, and undo/redo restore through applySnapshot.
function editor(initial: Graph, options: { limit?: number } = {}) {
  let state: Graph = initial;
  const history = createGraphHistory(toSnapshot(state.nodes, state.edges), options);
  const allocate = createNodeIdAllocator(ids(initial.nodes));

  const observe = () =>
    history.observe(toSnapshot(state.nodes, state.edges), {
      dragging: state.nodes.some((n) => n.dragging),
    });
  const apply = (snapshot: ReturnType<typeof history.undo>) => {
    if (!snapshot) return false;
    state = applySnapshot(state, snapshot);
    observe();
    return true;
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
    undo: () => apply(history.undo()),
    redo: () => apply(history.redo()),
  };
}

const starter = (): Graph => ({
  nodes: [node("client-1", "client"), node("server-1"), node("database-1", "database")],
  edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
});

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function makeStore(storage: StorageLike = memoryStorage()) {
  let tick = 0;
  let id = 0;
  return createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: () => `p${++id}`,
  });
}

// ---- History (pure) ----

test("record, undo and redo move through values", () => {
  let history = createHistory("a", { key: (v) => v });
  history = record(history, "b");
  history = record(history, "c");
  assert.equal(history.present, "c");
  history = undo(history);
  assert.equal(history.present, "b");
  assert.equal(canRedo(history), true);
  history = redo(history);
  assert.equal(history.present, "c");
  assert.equal(canRedo(history), false);
});

test("undo and redo with nothing to do return the same history", () => {
  const history = createHistory("a", { key: (v) => v });
  assert.equal(undo(history), history);
  assert.equal(redo(history), history);
  assert.equal(canUndo(history), false);
});

test("recording an equal value is a no-op", () => {
  const history = createHistory({ n: 1 }, { key: (v) => JSON.stringify(v) });
  assert.equal(record(history, { n: 1 }), history);
});

test("the default limit is 40 undo steps and the oldest are dropped", () => {
  assert.equal(DEFAULT_HISTORY_LIMIT, 40);
  let history = createHistory<number>(0, { key: String });
  for (let i = 1; i <= 100; i += 1) history = record(history, i);
  assert.equal(history.past.length, 40);
  assert.equal(history.past[0], 60);
  for (let i = 0; i < 40; i += 1) history = undo(history);
  assert.equal(history.present, 60);
  assert.equal(canUndo(history), false);
});

// ---- Graph history ----

test("add, undo, redo", () => {
  const ed = editor(starter());
  const { nodes } = addNode(ed.state.nodes, "cache", (id) => node(id, "cache"), ed.allocate);
  assert.equal(ed.set({ ...ed.state, nodes }), true);
  assert.equal(ed.state.nodes.length, 4);

  assert.equal(ed.undo(), true);
  assert.deepEqual(ids(ed.state.nodes), ["client-1", "server-1", "database-1"]);
  assert.equal(ed.redo(), true);
  assert.deepEqual(ids(ed.state.nodes), ["client-1", "server-1", "database-1", "cache-1"]);
  assert.equal(ed.redo(), false);
});

test("undoing a delete restores the node and every connected edge, redo removes them again", () => {
  const ed = editor(starter());
  const before = toSnapshot(ed.state.nodes, ed.state.edges);
  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-1"] }));
  assert.deepEqual(ids(ed.state.edges), []);

  ed.undo();
  assert.deepEqual(toSnapshot(ed.state.nodes, ed.state.edges), before);
  assert.deepEqual(ids(ed.state.edges), ["client-1->server-1", "server-1->database-1"]);

  ed.redo();
  assert.deepEqual(ids(ed.state.nodes), ["client-1", "database-1"]);
  assert.deepEqual(ids(ed.state.edges), []);
});

test("a property edit can be undone and redone", () => {
  const ed = editor({ nodes: [node("server-1", "server", { properties: { replicas: 1 } })], edges: [] });
  const result = setNodeProperty(ed.state.nodes, "server-1", "replicas", 4);
  assert.ok(result.ok);
  if (result.ok) ed.set({ ...ed.state, nodes: result.nodes });
  assert.equal(ed.state.nodes[0].data.properties?.replicas, 4);

  ed.undo();
  assert.equal(ed.state.nodes[0].data.properties?.replicas, 1);
  ed.redo();
  assert.equal(ed.state.nodes[0].data.properties?.replicas, 4);
});

test("creating an edge can be undone", () => {
  const ed = editor({ nodes: [node("a"), node("b")], edges: [] });
  const added = addConnection({ nodes: ed.state.nodes, edges: ed.state.edges }, { source: "a", target: "b" });
  assert.ok(added.ok);
  if (added.ok) ed.set({ ...ed.state, edges: added.edges });
  assert.equal(ed.state.edges.length, 1);
  ed.undo();
  assert.equal(ed.state.edges.length, 0);
  assert.equal(ed.state.nodes.length, 2);
});

test("a new edit after an undo clears redo", () => {
  const ed = editor(starter());
  ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "server-1", { x: 10, y: 0 }) });
  ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "server-1", { x: 20, y: 0 }) });
  ed.undo();
  assert.equal(ed.history.canRedo(), true);

  ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "server-1", { x: 99, y: 0 }) });
  assert.equal(ed.history.canRedo(), false);
  assert.equal(ed.redo(), false);
});

test("history is bounded to the limit", () => {
  const ed = editor({ nodes: [node("a")], edges: [] }, { limit: 5 });
  for (let i = 1; i <= 12; i += 1) {
    ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "a", { x: i, y: 0 }) });
  }
  assert.equal(ed.history.undoDepth(), 5);
  let undone = 0;
  while (ed.undo()) undone += 1;
  assert.equal(undone, 5);
  assert.equal(ed.state.nodes[0].position.x, 7);
});

test("changes that leave the graph the same create no history", () => {
  const ed = editor({ nodes: [node("a", "server", { properties: { replicas: 2 } })], edges: [] });
  assert.equal(ed.set({ ...ed.state }), false);
  assert.equal(ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "a", { x: 0, y: 0 }) }), false);
  const same = setNodeProperty(ed.state.nodes, "a", "replicas", 2);
  assert.ok(same.ok);
  if (same.ok) assert.equal(ed.set({ ...ed.state, nodes: same.nodes }), false);
  assert.equal(ed.set({ nodes: ed.state.nodes.map((n) => ({ ...n })), edges: [] }), false);
  assert.equal(ed.history.undoDepth(), 0);
  assert.equal(ed.undo(), false);
});

test("selection, measuring and the dragging flag are not history", () => {
  const ed = editor(starter());
  const selected = selectNode(ed.state, "server-1");
  assert.equal(ed.set(selected), false);
  assert.equal(
    ed.set({ ...ed.state, nodes: ed.state.nodes.map((n) => ({ ...n, measured: { width: 80, height: 30 } })) }),
    false,
  );
  assert.equal(ed.history.undoDepth(), 0);
});

test("a whole drag is one undo step", () => {
  const ed = editor(starter());
  for (let x = 1; x <= 25; x += 1) {
    ed.set({
      ...ed.state,
      nodes: ed.state.nodes.map((n) => (n.id === "server-1" ? { ...n, dragging: true, position: { x, y: x } } : n)),
    });
  }
  assert.equal(ed.history.undoDepth(), 0);

  ed.set({
    ...ed.state,
    nodes: ed.state.nodes.map((n) => (n.id === "server-1" ? { ...n, dragging: false } : n)),
  });
  assert.equal(ed.history.undoDepth(), 1);

  ed.undo();
  assert.deepEqual(ed.state.nodes[1].position, { x: 0, y: 0 });
  ed.redo();
  assert.deepEqual(ed.state.nodes[1].position, { x: 25, y: 25 });
});

test("a drag that ends where it started is not a step", () => {
  const ed = editor(starter());
  ed.set({ ...ed.state, nodes: ed.state.nodes.map((n) => ({ ...n, dragging: true, position: { x: 50, y: 50 } })) });
  ed.set({ ...ed.state, nodes: ed.state.nodes.map((n) => ({ ...n, dragging: false, position: { x: 0, y: 0 } })) });
  assert.equal(ed.history.undoDepth(), 0);
});

test("reset is undoable", () => {
  const ed = editor(starter());
  ed.set({ nodes: [], edges: [] });
  ed.set(starter());
  ed.undo();
  assert.deepEqual(ed.state, { nodes: [], edges: [] });
  ed.undo();
  assert.equal(ed.state.nodes.length, 3);
});

test("typing a name is one undo step, and moving or editing another node starts a new one", () => {
  const ed = editor(starter());
  for (const label of ["A", "AP", "API", "API Gateway"]) {
    ed.set({
      ...ed.state,
      nodes: ed.state.nodes.map((n) => (n.id === "server-1" ? { ...n, data: { ...n.data, label } } : n)),
    });
  }
  assert.equal(ed.history.undoDepth(), 1);

  ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "server-1", { x: 5, y: 5 }) });
  ed.set({
    ...ed.state,
    nodes: ed.state.nodes.map((n) => (n.id === "server-1" ? { ...n, data: { ...n.data, label: "Edge" } } : n)),
  });
  assert.equal(ed.history.undoDepth(), 3);

  ed.undo();
  ed.undo();
  ed.undo();
  assert.equal(ed.state.nodes[1].data.label, "server-1");
});

test("coalescing only applies to one node's label or one property", () => {
  const base = toSnapshot([node("a"), node("b")], []);
  const renamed = toSnapshot([{ ...node("a"), data: { type: "server", label: "x" } }, node("b")], []);
  assert.equal(coalesceKeyFor(base, renamed), "label:a");
  const moved = toSnapshot([{ ...node("a"), position: { x: 1, y: 1 } }, node("b")], []);
  assert.equal(coalesceKeyFor(base, moved), null);
  assert.equal(coalesceKeyFor(base, toSnapshot([node("a")], [])), null);
  const both = toSnapshot(
    [{ ...node("a"), data: { type: "server", label: "x" } }, { ...node("b"), data: { type: "server", label: "y" } }],
    [],
  );
  assert.equal(coalesceKeyFor(base, both), null);
});

test("restoring keeps unchanged live nodes, so they keep their measured size and selection", () => {
  const ed = editor(starter());
  const measured = ed.state.nodes.map((n) => ({ ...n, measured: { width: 80, height: 30 } }));
  ed.set({ ...ed.state, nodes: measured });
  ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "server-1", { x: 40, y: 0 }) });
  const before = ed.state.nodes;
  ed.undo();
  assert.equal(ed.state.nodes[0], before[0]);
  assert.equal(ed.state.nodes[2], before[2]);
  assert.notEqual(ed.state.nodes[1], before[1]);
});

test("after restoring, nothing that no longer exists is selected", () => {
  const ed = editor(starter());
  const { nodes } = addNode(ed.state.nodes, "cache", (id) => node(id, "cache"), ed.allocate);
  ed.set({ ...ed.state, nodes });
  assert.deepEqual(getSelection(ed.state.nodes, ed.state.edges), { kind: "node", nodeId: "cache-1" });

  ed.undo();
  assert.deepEqual(getSelection(ed.state.nodes, ed.state.edges), { kind: "none" });
  assert.equal(ed.state.nodes.some((n) => n.id === "cache-1"), false);

  ed.redo();
  assert.equal(ed.state.nodes.some((n) => n.id === "cache-1"), true);
  assert.equal(getSelection(ed.state.nodes, ed.state.edges).kind, "none");
});

test("a remembered state is not changed by later edits to the live graph", () => {
  const ed = editor({ nodes: [node("a", "server", { properties: { replicas: 1 } })], edges: [] });
  const live = ed.state.nodes[0];
  ed.set({ ...ed.state, nodes: [{ ...live, position: { x: 9, y: 9 } }] });
  live.data.properties!.replicas = 99;
  ed.undo();
  assert.equal(ed.state.nodes[0].data.properties?.replicas, 1);
  assert.deepEqual(ed.state.nodes[0].position, { x: 0, y: 0 });
});

test("project A's history never touches project B", () => {
  const a = editor({ nodes: [node("a1")], edges: [] });
  const b = editor({ nodes: [node("b1")], edges: [] });
  a.set({ ...a.state, nodes: [...a.state.nodes, node("a2")] });

  assert.equal(b.undo(), false);
  assert.equal(b.history.canUndo(), false);
  assert.deepEqual(ids(b.state.nodes), ["b1"]);

  b.set({ ...b.state, nodes: [...b.state.nodes, node("b2")] });
  a.undo();
  assert.deepEqual(ids(a.state.nodes), ["a1"]);
  assert.deepEqual(ids(b.state.nodes), ["b1", "b2"]);
  assert.equal(a.history.canRedo(), true);
  assert.equal(b.history.canRedo(), false);
});

// ---- Node ids ----

test("a deleted id is not reused during the session", () => {
  const ed = editor({ nodes: [node("server-1"), node("server-2")], edges: [] });
  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-2"] }));
  const { nodes, nodeId } = addNode(ed.state.nodes, "server", (id) => node(id), ed.allocate);
  assert.equal(nodeId, "server-3");
  ed.set({ ...ed.state, nodes });
  assert.deepEqual(ids(ed.state.nodes), ["server-1", "server-3"]);
});

test("ids stay unique across add, delete, undo and redo", () => {
  const ed = editor({ nodes: [node("server-1")], edges: [] });
  const seen = new Set<string>(["server-1"]);
  const add = () => {
    const { nodes, nodeId } = addNode(ed.state.nodes, "server", (id) => node(id), ed.allocate);
    assert.equal(seen.has(nodeId), false);
    seen.add(nodeId);
    ed.set({ ...ed.state, nodes });
  };
  add();
  add();
  ed.undo();
  ed.undo();
  add();
  ed.redo();
  ed.set(removeFromGraph(ed.state, { nodeIds: [ids(ed.state.nodes).at(-1) ?? ""] }));
  add();
  assert.equal(new Set(ids(ed.state.nodes)).size, ed.state.nodes.length);
});

test("the allocator starts from the ids of a reopened project", () => {
  const allocate = createNodeIdAllocator(["server-1", "server-2", "client-7", "server-added-9"]);
  assert.equal(allocate("server", ["server-1", "server-2"]), "server-3");
  assert.equal(allocate("client", []), "client-8");
  assert.equal(allocate("cache", []), "cache-1");
});

test("the allocator also counts ids it is given later and never repeats itself", () => {
  const allocate = createNodeIdAllocator();
  assert.equal(allocate("server", ["server-5"]), "server-6");
  assert.equal(allocate("server", []), "server-7");
  assert.equal(allocate("server", ["server-7", "server-8"]), "server-9");
});

test("the stateless generator is unchanged", () => {
  assert.equal(generateNodeId("server", ["server-1", "server-2"]), "server-3");
});

// ---- Copy ----

const selected = (graph: Graph, ...selectedIds: string[]): Graph => ({
  nodes: graph.nodes.map((n) => ({ ...n, selected: selectedIds.includes(n.id) })),
  edges: graph.edges,
});

test("copying one node keeps its type, label, properties and position, and no ids", () => {
  const graph = selected(
    {
      nodes: [
        {
          ...node("server-1", "server", { properties: { replicas: 3 }, position: { x: 100, y: 50 } }),
          data: { type: "server", label: "Checkout API", properties: { replicas: 3 } },
        },
      ],
      edges: [],
    },
    "server-1",
  );
  const content = copySelection(graph);
  assert.ok(content);
  assert.equal(content.nodes[0].label, "Checkout API");
  assert.equal(content.nodes.length, 1);
  assert.equal(content.nodes[0].type, "server");
  assert.deepEqual(content.nodes[0].properties, { replicas: 3 });
  assert.deepEqual(content.origin, { x: 100, y: 50 });
  assert.deepEqual(content.nodes[0].offset, { x: 0, y: 0 });
  assert.equal(JSON.stringify(content).includes("server-1"), false);
  assert.equal(JSON.stringify(content).includes("selected"), false);
});

test("copying several nodes includes the edges between them", () => {
  const content = copySelection(selected(starter(), "client-1", "server-1"));
  assert.ok(content);
  assert.equal(content.nodes.length, 2);
  assert.deepEqual(content.edges, [{ from: 0, to: 1 }]);
});

test("edges to nodes that are not selected are not copied", () => {
  const content = copySelection(selected(starter(), "server-1"));
  assert.ok(content);
  assert.deepEqual(content.edges, []);

  const all = copySelection(selected(starter(), "client-1", "database-1"));
  assert.deepEqual(all?.edges, []);
});

test("a selected edge on its own copies nothing", () => {
  const graph: Graph = { nodes: starter().nodes, edges: [edge("client-1", "server-1", true)] };
  assert.equal(copySelection(graph), null);
  assert.equal(copySelection({ nodes: [], edges: [] }), null);
  assert.equal(copySelection(selected(starter())), null);
});

test("copying does not change the graph", () => {
  const graph = selected(starter(), "client-1", "server-1");
  const snapshot = JSON.stringify(graph);
  copySelection(graph);
  assert.equal(JSON.stringify(graph), snapshot);
});

// ---- Paste ----

test("pasting creates new nodes and edges with new ids, selected, offset from the originals", () => {
  const graph = selected(starter(), "client-1", "server-1");
  const content = copySelection(graph);
  assert.ok(content);
  const allocate = createNodeIdAllocator(ids(graph.nodes));
  const { graph: next, nodeIds } = pasteClipboard(graph, content, allocate);

  assert.deepEqual(nodeIds, ["client-2", "server-2"]);
  assert.equal(next.nodes.length, 5);
  assert.equal(new Set(ids(next.nodes)).size, 5);
  assert.deepEqual(next.nodes.filter((n) => n.selected).map((n) => n.id), nodeIds);
  assert.equal(next.edges.length, 3);
  assert.ok(next.edges.some((e) => e.source === "client-2" && e.target === "server-2"));
  assert.equal(new Set(ids(next.edges)).size, 3);

  const original = next.nodes.find((n) => n.id === "client-1");
  const pasted = next.nodes.find((n) => n.id === "client-2");
  assert.deepEqual(pasted?.position, {
    x: (original?.position.x ?? 0) + PASTE_OFFSET,
    y: (original?.position.y ?? 0) + PASTE_OFFSET,
  });
});

test("pasting keeps the relative positions of the copied nodes", () => {
  const graph = selected(
    {
      nodes: [
        node("a", "client", { position: { x: 100, y: 200 } }),
        node("b", "server", { position: { x: 340, y: 260 } }),
      ],
      edges: [],
    },
    "a",
    "b",
  );
  const content = copySelection(graph);
  assert.ok(content);
  const { graph: next } = pasteClipboard(graph, content, createNodeIdAllocator(ids(graph.nodes)));
  const [a, b] = next.nodes.slice(2);
  assert.deepEqual({ x: b.position.x - a.position.x, y: b.position.y - a.position.y }, { x: 240, y: 60 });
});

test("pasting does not change the originals or the clipboard", () => {
  const graph = selected(starter(), "server-1");
  const content = copySelection(graph);
  assert.ok(content);
  const before = JSON.stringify({ graph, content });
  pasteClipboard(graph, content, createNodeIdAllocator(ids(graph.nodes)));
  assert.equal(JSON.stringify({ graph, content }), before);
});

test("pasting deselects whatever was selected before", () => {
  const graph = selected(starter(), "server-1");
  const content = copySelection(graph);
  assert.ok(content);
  const { graph: next } = pasteClipboard(graph, content, createNodeIdAllocator(ids(graph.nodes)));
  assert.equal(next.nodes.find((n) => n.id === "server-1")?.selected, false);
  assert.equal(getSelection(next.nodes, next.edges).kind, "node");
});

test("pasting repeatedly gives every paste unique ids and moves it further each time", () => {
  let graph = selected(starter(), "server-1");
  const content = copySelection(graph);
  assert.ok(content);
  const allocate = createNodeIdAllocator(ids(graph.nodes));
  const positions: number[] = [];
  for (let steps = 1; steps <= 6; steps += 1) {
    const result = pasteClipboard(graph, content, allocate, steps);
    graph = result.graph;
    positions.push(graph.nodes.find((n) => n.id === result.nodeIds[0])?.position.x ?? -1);
  }
  assert.equal(new Set(ids(graph.nodes)).size, graph.nodes.length);
  assert.deepEqual(positions, [24, 48, 72, 96, 120, 144]);
});

test("pasted properties are independent of the original, the clipboard and other pastes", () => {
  const graph = selected(
    { nodes: [node("server-1", "server", { properties: { replicas: 3 } })], edges: [] },
    "server-1",
  );
  const content = copySelection(graph);
  assert.ok(content);
  const allocate = createNodeIdAllocator(ids(graph.nodes));

  const first = pasteClipboard(graph, content, allocate, 1);
  const second = pasteClipboard(first.graph, content, allocate, 2);
  const [one, two] = [first.nodeIds[0], second.nodeIds[0]].map(
    (id) => second.graph.nodes.find((n) => n.id === id) as TNode,
  );
  one.data.properties!.replicas = 100;

  assert.equal(two.data.properties?.replicas, 3);
  assert.equal(content.nodes[0].properties?.replicas, 3);
  assert.equal(graph.nodes[0].data.properties?.replicas, 3);
  assert.notEqual(one.data.properties, two.data.properties);
});

test("copying again after editing the original captures the edit", () => {
  const graph = selected({ nodes: [node("server-1", "server", { properties: { replicas: 1 } })], edges: [] }, "server-1");
  const first = copySelection(graph);
  graph.nodes[0].data.properties!.replicas = 2;
  assert.equal(first?.nodes[0].properties?.replicas, 1);
  assert.equal(copySelection(graph)?.nodes[0].properties?.replicas, 2);
});

test("pasting into a different graph needs no ids from the source", () => {
  const source = selected(starter(), "client-1", "server-1");
  const content = copySelection(source);
  assert.ok(content);
  const target: Graph = { nodes: [node("client-1", "client"), node("server-1")], edges: [] };
  const { graph, nodeIds } = pasteClipboard(target, content, createNodeIdAllocator(ids(target.nodes)));
  assert.deepEqual(nodeIds, ["client-2", "server-2"]);
  assert.equal(new Set(ids(graph.nodes)).size, 4);
});

test("pasted edges are valid connections between the pasted nodes only", () => {
  const graph = selected(starter(), "client-1", "server-1", "database-1");
  const content = copySelection(graph);
  assert.ok(content);
  const { graph: next, nodeIds } = pasteClipboard(graph, content, createNodeIdAllocator(ids(graph.nodes)));
  const newEdges = next.edges.filter((e) => nodeIds.includes(e.source) || nodeIds.includes(e.target));
  assert.equal(newEdges.length, 2);
  for (const e of newEdges) {
    assert.ok(nodeIds.includes(e.source) && nodeIds.includes(e.target));
    assert.notEqual(e.source, e.target);
  }
});

// ---- Duplicate ----

test("duplicate gives the same result as copy followed by one paste", () => {
  const graph = selected(starter(), "client-1", "server-1");
  const viaDuplicate = duplicateSelection(graph, createNodeIdAllocator(ids(graph.nodes)));
  const content = copySelection(graph);
  assert.ok(content && viaDuplicate);
  const viaPaste = pasteClipboard(graph, content, createNodeIdAllocator(ids(graph.nodes)), 1);
  assert.deepEqual(viaDuplicate, viaPaste);
});

test("duplicating leaves the originals alone, selects the copies and includes internal edges", () => {
  const graph = selected(starter(), "server-1", "database-1");
  const before = JSON.stringify(graph);
  const result = duplicateSelection(graph, createNodeIdAllocator(ids(graph.nodes)));
  assert.ok(result);
  assert.equal(JSON.stringify(graph), before);
  assert.deepEqual(result.nodeIds, ["server-2", "database-2"]);
  assert.deepEqual(result.graph.nodes.filter((n) => n.selected).map((n) => n.id), result.nodeIds);
  assert.ok(result.graph.edges.some((e) => e.source === "server-2" && e.target === "database-2"));
  assert.equal(result.graph.edges.some((e) => e.source === "client-1" && e.target === "server-2"), false);
});

test("duplicating with no selected node does nothing", () => {
  assert.equal(duplicateSelection(selected(starter()), createNodeIdAllocator()), null);
});

test("duplicate properties are independent", () => {
  const graph = selected({ nodes: [node("s-1", "server", { properties: { replicas: 2 } })], edges: [] }, "s-1");
  const result = duplicateSelection(graph, createNodeIdAllocator(ids(graph.nodes)));
  assert.ok(result);
  const copy = result.graph.nodes[1];
  copy.data.properties!.replicas = 50;
  assert.equal(result.graph.nodes[0].data.properties?.replicas, 2);
});

// ---- Paste and duplicate in history ----

test("a paste is one undo step: undo removes the whole group, redo restores it", () => {
  const ed = editor(selected(starter(), "client-1", "server-1"));
  const content = copySelection(ed.state);
  assert.ok(content);
  const before = toSnapshot(ed.state.nodes, ed.state.edges);

  const { graph } = pasteClipboard(ed.state, content, ed.allocate);
  assert.equal(ed.set(graph), true);
  assert.equal(ed.history.undoDepth(), 1);
  assert.equal(ed.state.nodes.length, 5);
  assert.equal(ed.state.edges.length, 3);
  const afterPaste = toSnapshot(ed.state.nodes, ed.state.edges);

  ed.undo();
  assert.deepEqual(toSnapshot(ed.state.nodes, ed.state.edges), before);
  assert.equal(ed.state.edges.length, 2);

  ed.redo();
  assert.deepEqual(toSnapshot(ed.state.nodes, ed.state.edges), afterPaste);
});

test("a duplicate is one undo step", () => {
  const ed = editor(selected(starter(), "server-1", "database-1"));
  const result = duplicateSelection(ed.state, ed.allocate);
  assert.ok(result);
  ed.set(result.graph);
  assert.equal(ed.history.undoDepth(), 1);
  ed.undo();
  assert.equal(ed.state.nodes.length, 3);
  assert.equal(ed.history.canUndo(), false);
});

test("undoing a paste does not let the next paste reuse its ids", () => {
  const ed = editor(selected(starter(), "server-1"));
  const content = copySelection(ed.state);
  assert.ok(content);
  const first = pasteClipboard(ed.state, content, ed.allocate);
  ed.set(first.graph);
  ed.undo();
  const second = pasteClipboard(ed.state, content, ed.allocate);
  assert.notDeepEqual(second.nodeIds, first.nodeIds);
  assert.deepEqual(second.nodeIds, ["server-3"]);
});

test("deleting a pasted node and undoing the delete restores its edges", () => {
  const ed = editor(selected(starter(), "client-1", "server-1"));
  const result = duplicateSelection(ed.state, ed.allocate);
  assert.ok(result);
  ed.set(result.graph);
  ed.set(removeSelected(ed.state));
  assert.equal(ed.state.nodes.length, 3);
  ed.undo();
  assert.equal(ed.state.nodes.length, 5);
  assert.equal(ed.state.edges.length, 3);
});

// ---- Autosave ----

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

function savedProjectEditor() {
  const storage = memoryStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, store, timers);
  const ed = editor({ nodes: project.nodes as unknown as TNode[], edges: project.edges as EdgeLike[] });
  const content = () => ({
    title: project.title,
    nodes: ed.state.nodes as never,
    edges: ed.state.edges as never,
  });
  autosave.update(content());
  return { storage, store, project, timers, autosave, ed, content };
}

test("undo before the debounce ends cancels the save when the graph is back at the saved state", () => {
  const { store, project, timers, autosave, ed, content } = savedProjectEditor();
  const writesBefore = store.getProject(project.id)?.updatedAt;

  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-1"] }));
  autosave.update(content());
  assert.equal(autosave.getStatus(), "dirty");
  assert.equal(timers.pending(), 1);

  ed.undo();
  autosave.update(content());
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(timers.pending(), 0);
  assert.equal(store.getProject(project.id)?.updatedAt, writesBefore);
  assert.equal(store.getProject(project.id)?.nodes.length, 3);
});

test("undo after a save is a real change that is saved", () => {
  const { storage, project, timers, autosave, ed, content } = savedProjectEditor();
  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-1"] }));
  autosave.update(content());
  timers.fire();
  assert.equal(makeStore(storage).getProject(project.id)?.nodes.length, 2);

  ed.undo();
  autosave.update(content());
  assert.equal(autosave.getStatus(), "dirty");
  timers.fire();
  const saved = makeStore(storage).getProject(project.id);
  assert.equal(saved?.nodes.length, 3);
  assert.equal(saved?.edges.length, 2);
});

test("a paste is saved as one change", () => {
  const { storage, project, timers, autosave, ed, content } = savedProjectEditor();
  ed.set(selected(ed.state, "server-1", "database-1"));
  const result = duplicateSelection(ed.state, ed.allocate);
  assert.ok(result);
  ed.set(result.graph);
  autosave.update(content());
  assert.equal(timers.pending(), 1);
  timers.fire();
  const saved = makeStore(storage).getProject(project.id);
  assert.equal(saved?.nodes.length, 5);
  assert.equal(saved?.edges.length, 3);
});

test("restored graphs persist without selection state", () => {
  const { storage, project, timers, autosave, ed, content } = savedProjectEditor();
  ed.set(selected(ed.state, "server-1"));
  ed.set(removeSelected(ed.state));
  autosave.update(content());
  ed.undo();
  ed.set(selectNode(ed.state, "client-1"));
  autosave.update(content());
  timers.fire();
  const saved = makeStore(storage).getProject(project.id);
  assert.equal(JSON.stringify(saved).includes("selected"), false);
  assert.equal(storage.data.has(STORAGE_KEY), true);
});

// ---- Keyboard ----

const key = (k: string, extra: Record<string, unknown> = {}) => resolveShortcut({ key: k, ...extra });

test("Ctrl or Cmd + Z is undo", () => {
  assert.equal(key("z", { ctrlKey: true }), "undo");
  assert.equal(key("Z", { ctrlKey: true }), "undo");
  assert.equal(key("z", { metaKey: true }), "undo");
});

test("Ctrl or Cmd + Shift + Z is redo", () => {
  assert.equal(key("z", { ctrlKey: true, shiftKey: true }), "redo");
  assert.equal(key("Z", { metaKey: true, shiftKey: true }), "redo");
});

test("Ctrl or Cmd + Y is redo", () => {
  assert.equal(key("y", { ctrlKey: true }), "redo");
  assert.equal(key("y", { metaKey: true }), "redo");
  assert.equal(key("y", { ctrlKey: true, shiftKey: true }), null);
});

test("Ctrl or Cmd + C, V and D are copy, paste and duplicate", () => {
  for (const modifier of ["ctrlKey", "metaKey"]) {
    assert.equal(key("c", { [modifier]: true }), "copy");
    assert.equal(key("v", { [modifier]: true }), "paste");
    assert.equal(key("d", { [modifier]: true }), "duplicate");
    assert.equal(key("D", { [modifier]: true }), "duplicate");
  }
});

test("the earlier shortcuts are unchanged", () => {
  assert.equal(key("Delete"), "delete-selection");
  assert.equal(key("Backspace"), "delete-selection");
  assert.equal(key("Escape"), "clear-selection");
  assert.equal(key("s", { ctrlKey: true }), "save-now");
});

test("history and clipboard shortcuts need the command key and no Alt", () => {
  for (const letter of ["z", "y", "c", "v", "d"]) {
    assert.equal(key(letter), null);
    assert.equal(key(letter, { ctrlKey: true, altKey: true }), null);
  }
  assert.equal(key("c", { ctrlKey: true, shiftKey: true }), null);
  assert.equal(key("v", { ctrlKey: true, shiftKey: true }), null);
  assert.equal(key("d", { ctrlKey: true, shiftKey: true }), null);
});

test("none of the new shortcuts fire while typing", () => {
  for (const target of [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) {
    for (const [letter, extra] of [
      ["z", {}],
      ["z", { shiftKey: true }],
      ["y", {}],
      ["c", {}],
      ["v", {}],
      ["d", {}],
    ] as const) {
      assert.equal(key(letter, { ctrlKey: true, target, ...extra }), null);
    }
  }
});

test("the new shortcuts respect IME composition and already-handled events", () => {
  assert.equal(key("z", { ctrlKey: true, isComposing: true }), null);
  assert.equal(key("c", { ctrlKey: true, defaultPrevented: true }), null);
});
