import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTION_RULES,
  addConnection,
  connectionId,
  createConnection,
  validateConnection,
  type ConnectionRule,
} from "../src/lib/architecture/connections.ts";
import { isTypingTarget, resolveShortcut } from "../src/lib/architecture/keyboard.ts";
import {
  addNode,
  moveNode,
  removeFromGraph,
  removeNodeProperty,
  removeSelected,
  setNodeProperty,
  updateNodeProperties,
  type EdgeLike,
  type NodeLike,
} from "../src/lib/architecture/nodeOperations.ts";
import {
  clearSelection,
  getSelection,
  selectEdge,
  selectNode,
} from "../src/lib/architecture/selection.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";
import { createProjectAutosave } from "../src/components/projects/projectAutosave.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  sanitizeEdges,
  sanitizeNodes,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";

// ---- Helpers ----

type TestNode = NodeLike & { type: "architecture" };

const node = (
  id: string,
  type: ArchitectureNodeType = "server",
  extra: Partial<TestNode> & { properties?: Record<string, string | number | boolean> } = {},
): TestNode => {
  const { properties, ...rest } = extra;
  return {
    id,
    type: "architecture",
    position: { x: 0, y: 0 },
    data: { type, label: id, ...(properties ? { properties } : {}) },
    ...rest,
  };
};
const edge = (source: string, target: string, selected = false): EdgeLike & { sourceHandle?: string | null } => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(selected ? { selected } : {}),
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

const timers = () => {
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
};

const ids = (items: { id: string }[]) => items.map((item) => item.id);

// ---- Nodes ----

test("adding several nodes of the same type gives each its own id and selects only the last", () => {
  let nodes: TestNode[] = [];
  for (let i = 0; i < 5; i += 1) {
    nodes = addNode(nodes, "server", (id) => ({ ...node(id, "server") })).nodes;
  }
  assert.deepEqual(ids(nodes), ["server-1", "server-2", "server-3", "server-4", "server-5"]);
  assert.deepEqual(nodes.filter((n) => n.selected).map((n) => n.id), ["server-5"]);
});

test("adding after deleting never reuses an id that is still on the canvas", () => {
  let nodes = [node("server-1"), node("server-2"), node("server-3")];
  nodes = removeFromGraph({ nodes, edges: [] }, { nodeIds: ["server-2"] }).nodes;
  const added = addNode(nodes, "server", (id) => node(id));
  assert.equal(new Set(ids(added.nodes)).size, added.nodes.length);
  assert.equal(added.nodeId, "server-4");
});

test("adding keeps the other nodes and deselects them", () => {
  const before = [node("client-1", "client", { selected: true, position: { x: 5, y: 6 } })];
  const { nodes } = addNode(before, "cache", (id) => node(id, "cache"));
  assert.equal(nodes[0].selected, false);
  assert.deepEqual(nodes[0].position, { x: 5, y: 6 });
  assert.equal(before[0].selected, true);
});

test("moving a node changes only its position", () => {
  const nodes = [
    node("a", "server", { properties: { replicas: 2 } }),
    node("b", "database", { position: { x: 9, y: 9 } }),
  ];
  const moved = moveNode(nodes, "a", { x: 40, y: 50 });
  assert.deepEqual(moved[0].position, { x: 40, y: 50 });
  assert.deepEqual(moved[0].data, nodes[0].data);
  assert.equal(moved[1], nodes[1]);
  assert.deepEqual(nodes[0].position, { x: 0, y: 0 });
});

test("moving to the same place, to a missing node or to a bad position changes nothing", () => {
  const nodes = [node("a")];
  assert.equal(moveNode(nodes, "a", { x: 0, y: 0 }), nodes);
  assert.equal(moveNode(nodes, "ghost", { x: 1, y: 1 }), nodes);
  assert.equal(moveNode(nodes, "a", { x: Number.NaN, y: 1 }), nodes);
  assert.equal(moveNode(nodes, "a", undefined as never), nodes);
});

// ---- Deleting ----

test("deleting a node removes the edges connected to it", () => {
  const graph = {
    nodes: [node("c", "client"), node("s"), node("d", "database")],
    edges: [edge("c", "s"), edge("s", "d")],
  };
  const result = removeFromGraph(graph, { nodeIds: ["s"] });
  assert.deepEqual(ids(result.nodes), ["c", "d"]);
  assert.deepEqual(result.edges, []);
});

test("deleting a node keeps unrelated edges", () => {
  const graph = {
    nodes: [node("a"), node("b"), node("c"), node("d")],
    edges: [edge("a", "b"), edge("b", "c"), edge("c", "d")],
  };
  const result = removeFromGraph(graph, { nodeIds: ["a"] });
  assert.deepEqual(ids(result.edges), ["b->c", "c->d"]);
  assert.equal(result.edges[0], graph.edges[1]);
});

test("deleting an edge keeps both of its nodes", () => {
  const graph = { nodes: [node("a"), node("b")], edges: [edge("a", "b")] };
  const result = removeFromGraph(graph, { edgeIds: ["a->b"] });
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 0);
});

test("deleting something that is not there returns the same graph", () => {
  const graph = { nodes: [node("a")], edges: [] as EdgeLike[] };
  const result = removeFromGraph(graph, { nodeIds: ["nope"], edgeIds: ["nope"] });
  assert.equal(result.nodes, graph.nodes);
  assert.equal(result.edges, graph.edges);
});

test("deleting also removes edges that already pointed at missing nodes", () => {
  const graph = { nodes: [node("a"), node("b")], edges: [edge("a", "b"), edge("a", "ghost")] };
  assert.deepEqual(ids(removeFromGraph(graph, {}).edges), ["a->b"]);
});

test("deleting the selection removes selected nodes and edges together", () => {
  const graph = {
    nodes: [node("a", "server", { selected: true }), node("b"), node("c")],
    edges: [edge("a", "b"), edge("b", "c", true), edge("a", "c")],
  };
  const result = removeSelected(graph);
  assert.deepEqual(ids(result.nodes), ["b", "c"]);
  assert.deepEqual(result.edges, []);
});

test("deleting a selected edge alone leaves the nodes", () => {
  const graph = { nodes: [node("a"), node("b")], edges: [edge("a", "b", true)] };
  const result = removeSelected(graph);
  assert.equal(result.nodes, graph.nodes);
  assert.equal(result.edges.length, 0);
});

test("deleting with nothing selected changes nothing", () => {
  const graph = { nodes: [node("a")], edges: [edge("a", "a")] };
  const result = removeSelected({ nodes: graph.nodes, edges: [] });
  assert.equal(result.nodes, graph.nodes);
});

// ---- Connections ----

const graph = {
  nodes: [node("client", "client"), node("lb", "load-balancer"), node("s1"), node("db", "database")],
  edges: [] as ReturnType<typeof edge>[],
};
const request = (source: string, target: string) => ({ source, target });

test("an ordinary connection between two different components is accepted", () => {
  assert.deepEqual(validateConnection(graph, request("client", "lb")), { ok: true });
});

test("the free workspace accepts unusual connections", () => {
  for (const mode of ["workspace", "learn", "challenge"] as const) {
    assert.equal(validateConnection(graph, request("client", "db"), mode).ok, true);
    assert.equal(validateConnection(graph, request("db", "client"), mode).ok, true);
  }
});

test("a component cannot connect to itself, in any mode", () => {
  for (const mode of ["workspace", "learn", "challenge"] as const) {
    const verdict = validateConnection(graph, request("s1", "s1"), mode);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.reason, "self-connection");
  }
});

test("an exact repeat of a connection is rejected, but the reverse direction is allowed", () => {
  const connected = { ...graph, edges: [edge("client", "lb")] };
  const repeat = validateConnection(connected, request("client", "lb"));
  assert.equal(repeat.ok, false);
  if (!repeat.ok) assert.equal(repeat.reason, "duplicate");
  assert.equal(validateConnection(connected, request("lb", "client")).ok, true);
});

test("a connection through different handles is not an exact repeat", () => {
  const connected = { ...graph, edges: [{ ...edge("client", "lb"), sourceHandle: "a" }] };
  assert.equal(
    validateConnection(connected, { ...request("client", "lb"), sourceHandle: "b" }).ok,
    true,
  );
  assert.equal(
    validateConnection(connected, { ...request("client", "lb"), sourceHandle: "a" }).ok,
    false,
  );
  assert.equal(
    validateConnection(connected, { ...request("client", "lb"), sourceHandle: null }).ok,
    true,
  );
});

test("a connection to or from a missing component is rejected", () => {
  const missingSource = validateConnection(graph, request("ghost", "lb"));
  const missingTarget = validateConnection(graph, request("client", "ghost"));
  assert.equal(missingSource.ok === false && missingSource.reason, "missing-source");
  assert.equal(missingTarget.ok === false && missingTarget.reason, "missing-target");
});

test("malformed connection requests are refused without throwing", () => {
  for (const bad of [null, undefined, {}, { source: 1, target: 2 }, { source: "client" }, "x"]) {
    assert.doesNotThrow(() => {
      const verdict = validateConnection(graph, bad as never);
      assert.equal(verdict.ok, false);
    });
  }
  assert.equal(validateConnection({ nodes: [], edges: [] }, request("a", "b")).ok, false);
});

test("mode rules are applied when a mode defines them", () => {
  const noDirectDatabase: ConnectionRule = (from, to) =>
    from.data.type === "client" && to.data.type === "database"
      ? "Clients reach data through a service."
      : null;
  const verdict = validateConnection(graph, request("client", "db"), "learn", [noDirectDatabase]);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.equal(verdict.reason, "rule");
    assert.equal(verdict.message, "Clients reach data through a service.");
  }
  assert.equal(validateConnection(graph, request("client", "lb"), "learn", [noDirectDatabase]).ok, true);
});

test("no mode has type rules yet", () => {
  assert.deepEqual(CONNECTION_RULES, { workspace: [], learn: [], challenge: [] });
});

test("addConnection adds one edge with a stable id and leaves the input alone", () => {
  const edges = [edge("client", "lb")];
  const result = addConnection({ nodes: graph.nodes, edges }, request("lb", "s1"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(ids(result.edges), ["client->lb", "lb->s1"]);
    assert.equal(edges.length, 1);
  }
});

test("addConnection refuses without changing anything", () => {
  const edges = [edge("client", "lb")];
  const result = addConnection({ nodes: graph.nodes, edges }, request("client", "lb"));
  assert.equal(result.ok, false);
  assert.equal(edges.length, 1);
});

test("connection ids match the starter architecture and include handles when present", () => {
  assert.equal(connectionId(request("a", "b")), "a->b");
  assert.equal(connectionId({ source: "a", target: "b", sourceHandle: "x" }), "a->b:x:");
  assert.deepEqual(createConnection({ source: "a", target: "b", sourceHandle: null, targetHandle: null }), {
    id: "a->b",
    source: "a",
    target: "b",
  });
});

test("a connection survives save and reload", () => {
  const storage = memoryStorage();
  const store = makeStore(storage);
  const project = store.createProject({
    nodes: [node("client-1", "client"), node("lb-1", "load-balancer")] as never,
    edges: [],
  });
  const added = addConnection(
    { nodes: project.nodes, edges: project.edges },
    { source: "client-1", target: "lb-1", sourceHandle: null, targetHandle: null },
  );
  assert.ok(added.ok);
  store.updateProject(project.id, { edges: added.edges });

  const reloaded = makeStore(storage).getProject(project.id);
  assert.deepEqual(reloaded?.edges, [{ id: "client-1->lb-1", source: "client-1", target: "lb-1" }]);
});

test("saved data never contains duplicate node ids, duplicate edge ids or repeated edges", () => {
  const nodes = sanitizeNodes([node("a"), node("a", "database"), node("b")]);
  assert.deepEqual(ids(nodes), ["a", "b"]);
  assert.equal(nodes[0].data.type, "server");

  const edges = sanitizeEdges(
    [
      { id: "e1", source: "a", target: "b" },
      { id: "e1", source: "b", target: "a" },
      { id: "e2", source: "a", target: "b" },
      { id: "e3", source: "a", target: "ghost" },
    ],
    nodes,
  );
  assert.deepEqual(ids(edges), ["e1"]);
});

// ---- Properties ----

test("setting a property is immutable and only touches that node", () => {
  const nodes = [node("a"), node("b", "server", { properties: { replicas: 1 } })];
  const result = setNodeProperty(nodes, "a", "replicas", 3);
  assert.ok(result.ok && result.changed);
  if (result.ok) {
    assert.deepEqual(result.nodes[0].data.properties, { replicas: 3 });
    assert.equal(result.nodes[1], nodes[1]);
    assert.equal(nodes[0].data.properties, undefined);
    assert.notEqual(result.nodes, nodes);
  }
});

test("updating merges with existing properties", () => {
  const nodes = [node("a", "server", { properties: { replicas: 1, region: "eu" } })];
  const result = updateNodeProperties(nodes, "a", { replicas: 4, tls: true });
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(result.nodes[0].data.properties, { region: "eu", replicas: 4, tls: true });
  }
});

test("removing a property keeps the others, and removing the last drops the field", () => {
  const nodes = [node("a", "server", { properties: { replicas: 1, region: "eu" } })];
  const first = removeNodeProperty(nodes, "a", "region");
  assert.ok(first.ok && first.changed);
  if (first.ok) {
    assert.deepEqual(first.nodes[0].data.properties, { replicas: 1 });
    const second = removeNodeProperty(first.nodes, "a", "replicas");
    assert.ok(second.ok);
    if (second.ok) assert.equal("properties" in second.nodes[0].data, false);
  }
  assert.deepEqual(nodes[0].data.properties, { replicas: 1, region: "eu" });
});

test("a property update on a missing node fails explicitly", () => {
  const nodes = [node("a")];
  assert.deepEqual(setNodeProperty(nodes, "ghost", "replicas", 1), { ok: false, reason: "node-not-found" });
  assert.deepEqual(removeNodeProperty(nodes, "ghost", "replicas"), { ok: false, reason: "node-not-found" });
  assert.deepEqual(updateNodeProperties(nodes, "ghost", {}), { ok: false, reason: "node-not-found" });
});

test("invalid property values are rejected, reported and never damage valid ones", () => {
  const nodes = [node("a", "server", { properties: { replicas: 2 } })];
  const result = updateNodeProperties(nodes, "a", {
    replicas: Number.NaN,
    nested: { x: 1 },
    "bad key": 1,
    ok: "fine",
  });
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(result.nodes[0].data.properties, { ok: "fine", replicas: 2 });
    assert.deepEqual(result.rejectedKeys.sort(), ["bad key", "nested", "replicas"]);
  }

  const allBad = setNodeProperty(nodes, "a", "replicas", Number.POSITIVE_INFINITY);
  assert.ok(allBad.ok);
  if (allBad.ok) {
    assert.equal(allBad.changed, false);
    assert.equal(allBad.nodes, nodes);
    assert.deepEqual(allBad.rejectedKeys, ["replicas"]);
  }
});

test("malformed patches do not throw", () => {
  const nodes = [node("a")];
  for (const patch of [null, undefined, 5, "x", ["a"]]) {
    assert.doesNotThrow(() => updateNodeProperties(nodes, "a", patch as never));
    const result = updateNodeProperties(nodes, "a", patch as never);
    assert.ok(result.ok && !result.changed);
  }
});

test("setting a property to its current value is a no-op that returns the same nodes", () => {
  const nodes = [node("a", "server", { properties: { replicas: 2, region: "eu" } })];
  const result = setNodeProperty(nodes, "a", "replicas", 2);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.changed, false);
    assert.equal(result.nodes, nodes);
  }
  const removal = removeNodeProperty(nodes, "a", "missing");
  assert.ok(removal.ok && !removal.changed && removal.nodes === nodes);
});

test("a no-op property update does not make autosave dirty, a real one does", () => {
  const store = makeStore();
  const project = store.createProject({
    nodes: [node("server-1", "server", { properties: { replicas: 2 } })] as never,
    edges: [],
  });
  const clock = timers();
  const autosave = createProjectAutosave(project.id, store, clock);
  const content = (nodes: typeof project.nodes) => ({ title: project.title, nodes, edges: project.edges });
  autosave.update(content(project.nodes));

  const noop = setNodeProperty(project.nodes, "server-1", "replicas", 2);
  assert.ok(noop.ok);
  if (noop.ok) autosave.update(content(noop.nodes));
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(clock.pending(), 0);

  const real = setNodeProperty(project.nodes, "server-1", "replicas", 5);
  assert.ok(real.ok);
  if (real.ok) autosave.update(content(real.nodes));
  assert.equal(autosave.getStatus(), "dirty");
  clock.fire();
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(store.getProject(project.id)?.nodes[0].data.properties?.replicas, 5);
});

test("deleting a node autosaves the final graph, edges included", () => {
  const storage = memoryStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  const clock = timers();
  const autosave = createProjectAutosave(project.id, store, clock);
  autosave.update({ title: project.title, nodes: project.nodes, edges: project.edges });

  const next = removeFromGraph(
    { nodes: project.nodes, edges: project.edges },
    { nodeIds: ["server-1"] },
  );
  autosave.update({ title: project.title, ...next });
  clock.fire();

  const saved = makeStore(storage).getProject(project.id);
  assert.deepEqual(ids(saved?.nodes ?? []), ["client-1", "database-1"]);
  assert.deepEqual(saved?.edges, []);
});

// ---- Selection ----

test("selection is derived: none, node, edge or multiple", () => {
  const a = node("a");
  const b = node("b");
  assert.deepEqual(getSelection([a, b], []), { kind: "none" });
  assert.deepEqual(getSelection([{ ...a, selected: true }, b], []), { kind: "node", nodeId: "a" });
  assert.deepEqual(getSelection([a, b], [edge("a", "b", true)]), { kind: "edge", edgeId: "a->b" });
  assert.deepEqual(getSelection([{ ...a, selected: true }, { ...b, selected: true }], []), {
    kind: "multiple",
    nodeIds: ["a", "b"],
    edgeIds: [],
  });
  assert.equal(getSelection([{ ...a, selected: true }], [edge("a", "b", true)]).kind, "multiple");
});

test("selecting a node selects only it", () => {
  const state = {
    nodes: [node("a", "server", { selected: true }), node("b")],
    edges: [edge("a", "b", true)],
  };
  const next = selectNode(state, "b");
  assert.deepEqual(getSelection(next.nodes, next.edges), { kind: "node", nodeId: "b" });
  assert.equal(state.nodes[0].selected, true);
});

test("selecting an edge selects only it", () => {
  const state = { nodes: [node("a", "server", { selected: true }), node("b")], edges: [edge("a", "b")] };
  const next = selectEdge(state, "a->b");
  assert.deepEqual(getSelection(next.nodes, next.edges), { kind: "edge", edgeId: "a->b" });
});

test("selecting something that does not exist clears the selection", () => {
  const state = { nodes: [node("a", "server", { selected: true })], edges: [] as EdgeLike[] };
  for (const next of [selectNode(state, "ghost"), selectEdge(state, "ghost")]) {
    assert.equal(getSelection(next.nodes, next.edges).kind, "none");
  }
});

test("clearing the selection deselects everything, or changes nothing if nothing was selected", () => {
  const state = {
    nodes: [node("a", "server", { selected: true }), node("b")],
    edges: [edge("a", "b", true)],
  };
  const cleared = clearSelection(state);
  assert.equal(getSelection(cleared.nodes, cleared.edges).kind, "none");
  assert.equal(cleared.nodes[1], state.nodes[1]);

  const again = clearSelection(cleared);
  assert.equal(again.nodes, cleared.nodes);
  assert.equal(again.edges, cleared.edges);
});

test("after deleting the selected item nothing is selected and no id is left over", () => {
  const state = {
    nodes: [node("a", "server", { selected: true }), node("b")],
    edges: [edge("a", "b")],
  };
  const before = getSelection(state.nodes, state.edges);
  assert.deepEqual(before, { kind: "node", nodeId: "a" });

  const after = removeSelected(state);
  assert.deepEqual(getSelection(after.nodes, after.edges), { kind: "none" });
  assert.equal(after.nodes.some((n) => n.id === "a"), false);
  assert.equal(after.edges.length, 0);
});

// ---- Keyboard ----

const key = (k: string, extra: Record<string, unknown> = {}) => resolveShortcut({ key: k, ...extra });

test("Delete and Backspace delete the selection", () => {
  assert.equal(key("Delete"), "delete-selection");
  assert.equal(key("Backspace"), "delete-selection");
});

test("Escape clears the selection", () => {
  assert.equal(key("Escape"), "clear-selection");
});

test("Ctrl+S and Cmd+S save now, in either case", () => {
  assert.equal(key("s", { ctrlKey: true }), "save-now");
  assert.equal(key("S", { ctrlKey: true }), "save-now");
  assert.equal(key("s", { metaKey: true }), "save-now");
});

test("a bare S, or other modifier combinations, are not shortcuts", () => {
  assert.equal(key("s"), null);
  assert.equal(key("s", { ctrlKey: true, shiftKey: true }), null);
  assert.equal(key("s", { ctrlKey: true, altKey: true }), null);
  assert.equal(key("Delete", { ctrlKey: true }), null);
  assert.equal(key("Backspace", { shiftKey: true }), null);
  assert.equal(key("Escape", { metaKey: true }), null);
  // Ctrl+Z and Ctrl+C became shortcuts in the history step (see editorHistory.test.ts).
  assert.equal(key("x", { ctrlKey: true }), null);
  assert.equal(key("a", { ctrlKey: true }), null);
  assert.equal(key("a"), null);
});

test("nothing fires while typing in a field", () => {
  for (const target of [
    { tagName: "INPUT" },
    { tagName: "textarea" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
  ]) {
    assert.equal(isTypingTarget(target), true);
    assert.equal(key("Backspace", { target }), null);
    assert.equal(key("Delete", { target }), null);
    assert.equal(key("Escape", { target }), null);
    assert.equal(key("s", { ctrlKey: true, target }), null);
  }
});

test("shortcuts still work when focus is on the canvas or a button", () => {
  for (const target of [{ tagName: "DIV" }, { tagName: "BUTTON" }, { tagName: "BODY" }, null, undefined]) {
    assert.equal(isTypingTarget(target), false);
    assert.equal(key("Delete", { target }), "delete-selection");
  }
});

test("a key press that was already handled, or is part of IME composition, is ignored", () => {
  assert.equal(key("Escape", { defaultPrevented: true }), null);
  assert.equal(key("Backspace", { isComposing: true }), null);
});

// ---- Empty graph ----

test("a project with no nodes and no edges is valid, saves and reloads empty", () => {
  const storage = memoryStorage();
  const store = makeStore(storage);
  const project = store.createProject({ title: "Empty", nodes: [], edges: [] });
  assert.equal(project.nodes.length, 0);

  const reloaded = makeStore(storage);
  assert.equal(reloaded.getProjectState(project.id).status, "ready");
  assert.deepEqual(reloaded.getProject(project.id)?.nodes, []);
  assert.deepEqual(reloaded.getProject(project.id)?.edges, []);
});

test("deleting everything is saved and is not replaced by the starter architecture", () => {
  const storage = memoryStorage();
  const store = makeStore(storage);
  const project = store.createProject();
  assert.equal(project.nodes.length, 3);

  const clock = timers();
  const autosave = createProjectAutosave(project.id, store, clock);
  autosave.update({ title: project.title, nodes: project.nodes, edges: project.edges });
  const everything = removeFromGraph(
    { nodes: project.nodes, edges: project.edges },
    { nodeIds: ids(project.nodes) },
  );
  autosave.update({ title: project.title, ...everything });
  clock.fire();
  assert.equal(autosave.getStatus(), "saved");

  const reloaded = makeStore(storage).getProject(project.id);
  assert.deepEqual(reloaded?.nodes, []);
  assert.deepEqual(reloaded?.edges, []);
  assert.equal(makeStore(storage).getProjectState(project.id).status, "ready");
});

test("adding to an empty graph works", () => {
  const { nodes, nodeId } = addNode([] as TestNode[], "client", (id) => node(id, "client"));
  assert.equal(nodeId, "client-1");
  assert.equal(nodes.length, 1);
});

test("an empty graph has no selection and nothing to delete", () => {
  assert.deepEqual(getSelection([], []), { kind: "none" });
  const result = removeSelected({ nodes: [] as TestNode[], edges: [] as EdgeLike[] });
  assert.deepEqual(result, { nodes: [], edges: [] });
});

// ---- Malformed input ----

test("graph operations on malformed or empty input do not throw", () => {
  const empty = { nodes: [] as TestNode[], edges: [] as EdgeLike[] };
  assert.doesNotThrow(() => removeFromGraph(empty, { nodeIds: ["x"], edgeIds: ["y"] }));
  assert.doesNotThrow(() => moveNode([], "x", { x: 1, y: 1 }));
  assert.doesNotThrow(() => setNodeProperty([], "x", "k", 1));
  assert.doesNotThrow(() => selectNode(empty, "x"));
  assert.doesNotThrow(() => clearSelection(empty));
  assert.doesNotThrow(() => validateConnection({ nodes: [], edges: [] }, { source: "a", target: "b" }));
  assert.doesNotThrow(() => sanitizeNodes([null, 5, "x", { id: 1 }] as never));
});

test("a stored project with duplicate ids and bad edges loads cleanly", () => {
  const record = {
    id: "p",
    title: "Damaged",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nodes: [node("a"), node("a", "database"), node("b")],
    edges: [
      { id: "e", source: "a", target: "b" },
      { id: "e", source: "b", target: "a" },
      { id: "x", source: "a", target: "nowhere" },
    ],
  };
  const storage = memoryStorage();
  storage.data.set(STORAGE_KEY, JSON.stringify({ version: 1, projects: [record] }));
  const project = makeStore(storage).getProject("p");
  assert.deepEqual(ids(project?.nodes ?? []), ["a", "b"]);
  assert.deepEqual(ids(project?.edges ?? []), ["e"]);
});
