import assert from "node:assert/strict";
import test from "node:test";

import { COMPONENT_CATALOG } from "../src/components/workspace/componentCatalog.ts";
import {
  buildPropertyViews,
  getComponentConfigView,
} from "../src/lib/architecture/componentConfigView.ts";
import {
  formatPropertyValue,
  getEffectiveProperties,
  getEffectiveProperty,
  getPropertyDefinition,
  getPropertyDefinitions,
  isOverridden,
  parsePropertyInput,
  validatePropertyValue,
} from "../src/lib/architecture/componentProperties.ts";
import {
  CAPACITY_MAX,
  DATABASE_REPLICAS_MAX,
  REPLICAS_MAX,
  SIMULATION_PROFILES,
  configureNode,
} from "../src/lib/architecture/evaluation/capabilities.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { evaluateDesign } from "../src/lib/architecture/evaluation/evaluationService.ts";
import { fingerprintEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import { buildResultsView } from "../src/lib/architecture/evaluation/resultsView.ts";
import { createRunSession } from "../src/lib/architecture/evaluation/runSession.ts";
import { DEFAULT_TRAFFIC } from "../src/lib/architecture/evaluation/traffic.ts";
import {
  applySnapshot,
  createGraphHistory,
  toSnapshot,
} from "../src/lib/architecture/graphHistory.ts";
import type { EdgeLike, NodeLike } from "../src/lib/architecture/nodeOperations.ts";
import {
  commitPropertyDraft,
  finishDraft,
  interpretDraft,
  resetComponentProperty,
  setComponentProperty,
} from "../src/lib/architecture/propertyEditing.ts";
import { selectEdge, selectNode } from "../src/lib/architecture/selection.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";
import { createProjectAutosave } from "../src/components/projects/projectAutosave.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";

// ---- Helpers ----

type TNode = NodeLike & { type: "architecture" };
type Graph = { nodes: TNode[]; edges: EdgeLike[] };

const node = (
  id: string,
  type: ArchitectureNodeType = "server",
  properties?: Record<string, string | number | boolean>,
  selected = false,
): TNode => ({
  id,
  type: "architecture",
  position: { x: 0, y: 0 },
  data: { type, label: id, ...(properties ? { properties } : {}) },
  ...(selected ? { selected } : {}),
});
const edge = (source: string, target: string, selected = false): EdgeLike => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(selected ? { selected } : {}),
});

const design = (): Graph => ({
  nodes: [node("client-1", "client"), node("server-1"), node("database-1", "database", { replicas: 50 })],
  edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
});

const ALL_TYPES = Object.keys(COMPONENT_CATALOG) as ArchitectureNodeType[];
const keysOf = (type: ArchitectureNodeType) => getPropertyDefinitions(type).map((d) => d.key);
const fp = (graph: Graph) => fingerprintEvaluationInput({ graph, traffic: DEFAULT_TRAFFIC });
const server = (graph: Graph) => graph.nodes.find((n) => n.id === "server-1") as TNode;

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

function historyEditor(initial: Graph) {
  let state = initial;
  const history = createGraphHistory(toSnapshot(state.nodes, state.edges));
  const observe = () => history.observe(toSnapshot(state.nodes, state.edges));
  return {
    history,
    get state() {
      return state;
    },
    setNodes(nodes: TNode[]) {
      state = { ...state, nodes };
      return observe();
    },
    undo() {
      const snapshot = history.undo();
      if (snapshot) state = applySnapshot(state, snapshot) as Graph;
      observe();
    },
    redo() {
      const snapshot = history.redo();
      if (snapshot) state = applySnapshot(state, snapshot) as Graph;
      observe();
    },
  };
}

// ---- Definitions ----

test("each component type lists the settings it really has", () => {
  assert.deepEqual(keysOf("client"), []);
  assert.deepEqual(keysOf("web-app"), []);
  assert.deepEqual(keysOf("mobile-app"), []);
  assert.deepEqual(keysOf("server"), ["replicas", "capacity"]);
  assert.deepEqual(keysOf("worker"), ["replicas", "capacity"]);
  assert.deepEqual(keysOf("database"), ["replicas", "capacity"]);
  assert.deepEqual(keysOf("load-balancer"), ["replicas", "capacity"]);
  assert.deepEqual(keysOf("api-gateway"), ["replicas", "capacity"]);
  assert.deepEqual(keysOf("queue"), ["replicas", "capacity"]);
  assert.deepEqual(keysOf("cache"), ["replicas", "capacity", "cacheHitRate"]);
  assert.deepEqual(keysOf("cdn"), ["replicas", "capacity", "cacheHitRate"]);
  assert.deepEqual(keysOf("dns"), ["replicas"]);
});

test("every component type has a consistent definition list", () => {
  for (const type of ALL_TYPES) {
    const definitions = getPropertyDefinitions(type);
    assert.equal(getPropertyDefinitions(type), definitions, "same array each time");
    assert.equal(new Set(definitions.map((d) => d.key)).size, definitions.length);
    for (const d of definitions) {
      assert.ok(d.label && d.description, `${type}.${d.key}`);
      assert.ok(d.min <= d.defaultValue && d.defaultValue <= d.max, `${type}.${d.key}`);
      assert.ok(d.step > 0);
      assert.equal(getPropertyDefinition(type, d.key), d);
    }
  }
});

test("a database's replicas are explicitly read replicas", () => {
  const db = getPropertyDefinition("database", "replicas");
  assert.equal(db?.label, "Read replicas");
  assert.equal(db?.defaultValue, 0);
  assert.match(db?.description ?? "", /read/i);
  assert.equal(getPropertyDefinition("server", "replicas")?.label, "Replicas");
  assert.equal(getPropertyDefinition("server", "replicas")?.defaultValue, 1);
});

test("settings that a component does not have are absent", () => {
  assert.equal(getPropertyDefinition("client", "replicas"), undefined);
  assert.equal(getPropertyDefinition("server", "cacheHitRate"), undefined);
  assert.equal(getPropertyDefinition("database", "cacheHitRate"), undefined);
  assert.equal(getPropertyDefinition("dns", "capacity"), undefined);
  assert.equal(getPropertyDefinition("server", "colour"), undefined);
  assert.equal("cacheHitRate" in getEffectiveProperties("server", undefined), false);
  assert.deepEqual(getEffectiveProperties("client", undefined), {});
  const refused = setComponentProperty([node("s")], "s", "cacheHitRate", 0.5);
  assert.ok(!refused.ok && refused.reason === "unsupported");
});

test("defaults and limits are the evaluation engine's own", () => {
  for (const type of ALL_TYPES) {
    const effective = getEffectiveProperties(type, undefined);
    for (const d of getPropertyDefinitions(type)) {
      assert.equal(effective[d.key], d.defaultValue, `${type}.${d.key}`);
    }
    const config = configureNode({ id: "x", data: { type } });
    const profile = SIMULATION_PROFILES[type];
    if (keysOf(type).includes("replicas")) {
      assert.equal(
        getPropertyDefinition(type, "replicas")?.defaultValue,
        type === "database" ? config.instances - 1 : config.instances,
      );
    }
    if (keysOf(type).includes("capacity")) {
      assert.equal(getPropertyDefinition(type, "capacity")?.defaultValue, profile.capacityPerInstance);
    }
  }
  assert.equal(getPropertyDefinition("server", "replicas")?.max, REPLICAS_MAX);
  assert.equal(getPropertyDefinition("database", "replicas")?.max, DATABASE_REPLICAS_MAX);
  assert.equal(getPropertyDefinition("server", "capacity")?.max, CAPACITY_MAX);
});

test("setting a property to its default evaluates exactly like setting nothing", () => {
  const traffic = { requestsPerSecond: 3000 };
  for (const type of ALL_TYPES.filter((t) => getPropertyDefinitions(t).length > 0)) {
    const base: Graph = {
      nodes: [node("c", "client"), node("t", type), node("s"), node("d", "database", { replicas: 50 })],
      edges: [edge("c", "t"), edge("t", "s"), edge("s", "d")],
    };
    const explicit: Graph = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "t"
          ? node("t", type, Object.fromEntries(getPropertyDefinitions(type).map((d) => [d.key, d.defaultValue])))
          : n,
      ),
    };
    assert.deepEqual(
      evaluateArchitecture({ graph: explicit as never, traffic }),
      evaluateArchitecture({ graph: base as never, traffic }),
      type,
    );
  }
});

// ---- Effective values ----

test("without an override the effective value is the default", () => {
  assert.equal(getEffectiveProperty("server", undefined, "replicas"), 1);
  assert.equal(getEffectiveProperty("server", {}, "capacity"), 2500);
  assert.equal(getEffectiveProperty("database", undefined, "replicas"), 0);
  assert.equal(getEffectiveProperty("cache", undefined, "cacheHitRate"), 0.7);
  assert.equal(getEffectiveProperty("client", undefined, "replicas"), undefined);
  assert.equal(isOverridden("server", undefined, "replicas"), false);
});

test("an explicit override is the effective value", () => {
  const properties = { replicas: 4, capacity: 3000, region: "eu" };
  assert.equal(getEffectiveProperty("server", properties, "replicas"), 4);
  assert.equal(getEffectiveProperty("server", properties, "capacity"), 3000);
  assert.equal(getEffectiveProperty("database", { replicas: 2 }, "replicas"), 2);
  assert.equal(getEffectiveProperty("cache", { cacheHitRate: 0.95 }, "cacheHitRate"), 0.95);
  assert.equal(isOverridden("server", properties, "replicas"), true);
  assert.equal(isOverridden("server", properties, "region"), false);
  assert.equal(isOverridden("server", properties, "cacheHitRate"), false);
});

test("a stored value the engine cannot use shows the value the engine will use", () => {
  assert.equal(getEffectiveProperty("server", { replicas: "lots" }, "replicas"), 1);
  assert.equal(getEffectiveProperty("server", { replicas: Number.NaN }, "replicas"), 1);
  assert.equal(getEffectiveProperty("server", { replicas: 2.9 }, "replicas"), 2);
  assert.equal(getEffectiveProperty("server", { replicas: 0 }, "replicas"), 1);
  assert.equal(getEffectiveProperty("server", { capacity: -5 }, "capacity"), 2500);
  assert.equal(getEffectiveProperty("server", { replicas: 5000 }, "replicas"), 1000);
  assert.equal(getEffectiveProperty("cache", { cacheHitRate: 7 }, "cacheHitRate"), 1);
  assert.equal(isOverridden("server", { replicas: "lots" }, "replicas"), true);
});

test("the effective value is what Run Design evaluates", () => {
  const capacity = (properties?: Record<string, number>) =>
    evaluateArchitecture({
      graph: { nodes: design().nodes.map((n) => (n.id === "server-1" ? node("server-1", "server", properties) : n)), edges: design().edges } as never,
      traffic: { requestsPerSecond: 100 },
    }).metrics.capacityRps;
  assert.equal(capacity(), getEffectiveProperty("server", undefined, "replicas")! * 2500);
  assert.equal(capacity({ replicas: 3 }), getEffectiveProperty("server", { replicas: 3 }, "replicas")! * 2500);
});

// ---- Validation ----

test("replicas must be a whole number", () => {
  for (const type of ["server", "database"] as const) {
    const bad = validatePropertyValue(type, "replicas", 2.5);
    assert.ok(!bad.ok && bad.reason === "not-an-integer");
    assert.equal(validatePropertyValue(type, "replicas", 2).ok, true);
  }
});

test("replicas are limited to the engine's range", () => {
  const reason = (type: ArchitectureNodeType, value: number) => {
    const r = validatePropertyValue(type, "replicas", value);
    return r.ok ? "ok" : r.reason;
  };
  assert.equal(reason("server", 0), "below-minimum");
  assert.equal(reason("server", -1), "below-minimum");
  assert.equal(reason("server", 1), "ok");
  assert.equal(reason("server", REPLICAS_MAX), "ok");
  assert.equal(reason("server", REPLICAS_MAX + 1), "above-maximum");
  assert.equal(reason("database", 0), "ok");
  assert.equal(reason("database", -1), "below-minimum");
  assert.equal(reason("database", DATABASE_REPLICAS_MAX), "ok");
  assert.equal(reason("database", DATABASE_REPLICAS_MAX + 1), "above-maximum");
});

test("capacity must be positive, finite and within range", () => {
  const reason = (value: unknown) => {
    const r = validatePropertyValue("server", "capacity", value);
    return r.ok ? "ok" : r.reason;
  };
  assert.equal(reason(0), "below-minimum");
  assert.equal(reason(-100), "below-minimum");
  assert.equal(reason(0.5), "below-minimum");
  assert.equal(reason(1), "ok");
  assert.equal(reason(2500.5), "ok");
  assert.equal(reason(CAPACITY_MAX), "ok");
  assert.equal(reason(CAPACITY_MAX + 1), "above-maximum");
  assert.equal(reason(Number.POSITIVE_INFINITY), "not-a-number");
  assert.equal(reason(Number.NaN), "not-a-number");
});

test("hit rate is a fraction from 0 to 1", () => {
  const reason = (value: unknown) => {
    const r = validatePropertyValue("cache", "cacheHitRate", value);
    return r.ok ? "ok" : r.reason;
  };
  for (const ok of [0, 0.5, 0.95, 1]) assert.equal(reason(ok), "ok");
  assert.equal(reason(-0.01), "below-minimum");
  assert.equal(reason(1.01), "above-maximum");
  // A percentage typed as 70 is refused, not silently read as 100%.
  assert.equal(parsePropertyInput("cache", "cacheHitRate", "70").ok, false);
  assert.equal(parsePropertyInput("cache", "cacheHitRate", "0.7").ok, true);
  assert.equal(getPropertyDefinition("cache", "cacheHitRate")?.kind, "rate");
});

test("malformed values are refused with a reason, never thrown on", () => {
  for (const value of ["3", "abc", null, undefined, true, {}, [], Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validatePropertyValue("server", "replicas", value);
    assert.ok(!result.ok && result.reason === "not-a-number" && result.message.length > 0, String(value));
  }
});

test("typed text is read strictly", () => {
  const read = (text: string) => {
    const r = parsePropertyInput("server", "replicas", text);
    return r.ok ? r.value : r.reason;
  };
  assert.equal(read("3"), 3);
  assert.equal(read("  4  "), 4);
  assert.equal(read("+5"), 5);
  assert.equal(read("1e1"), 10);
  assert.equal(read("2."), 2);
  assert.equal(read(""), "empty");
  assert.equal(read("   "), "empty");
  for (const bad of ["abc", "0x10", "Infinity", "NaN", "1,000", "1 2", "--1", ".", "-", "e5", "1e"]) {
    assert.equal(read(bad), "not-a-number", bad);
  }
  assert.equal(read("2.5"), "not-an-integer");
  assert.equal(read("0"), "below-minimum");
  assert.equal(read("5000"), "above-maximum");
});

test("values are formatted without floating-point noise", () => {
  assert.equal(formatPropertyValue(0.1 + 0.2), "0.3");
  assert.equal(formatPropertyValue(2500), "2500");
  assert.equal(formatPropertyValue(0.7), "0.7");
});

// ---- Editing ----

test("a valid edit changes only the target node and keeps its other data", () => {
  const nodes = [node("a", "server", { notes: "keep", capacity: 3000 }), node("b", "server")];
  const result = setComponentProperty(nodes, "a", "replicas", 4);
  assert.ok(result.ok && result.changed);
  if (result.ok) {
    assert.deepEqual(result.nodes[0].data.properties, { capacity: 3000, notes: "keep", replicas: 4 });
    assert.equal(result.nodes[0].data.label, "a");
    assert.equal(result.nodes[1], nodes[1]);
    assert.equal(nodes[0].data.properties?.replicas, undefined);
  }
});

test("an invalid edit leaves the graph exactly as it was", () => {
  const nodes = [node("a", "server", { replicas: 2 })];
  for (const [key, value] of [
    ["replicas", 0],
    ["replicas", 2.5],
    ["replicas", "many"],
    ["capacity", -1],
    ["cacheHitRate", 0.5],
    ["bogus", 1],
  ] as const) {
    const result = setComponentProperty(nodes, "a", key, value);
    assert.equal(result.ok, false);
  }
  assert.equal(nodes[0].data.properties?.replicas, 2);
  const missing = setComponentProperty(nodes, "ghost", "replicas", 2);
  assert.ok(!missing.ok && missing.reason === "node-not-found");
});

test("setting the value already in effect changes nothing and returns the same array", () => {
  const nodes = [node("a", "server", { replicas: 3 }), node("b", "server")];
  const same = setComponentProperty(nodes, "a", "replicas", 3);
  assert.ok(same.ok && !same.changed && same.nodes === nodes);
  const defaultAlready = setComponentProperty(nodes, "b", "replicas", 1);
  assert.ok(defaultAlready.ok && !defaultAlready.changed && defaultAlready.nodes === nodes);
});

test("setting the default removes the override instead of storing the default", () => {
  const nodes = [node("a", "server", { replicas: 3, notes: "x" })];
  const result = setComponentProperty(nodes, "a", "replicas", 1);
  assert.ok(result.ok && result.changed);
  if (result.ok) {
    assert.deepEqual(result.nodes[0].data.properties, { notes: "x" });
    assert.equal(Object.hasOwn(result.nodes[0].data.properties ?? {}, "replicas"), false);
  }
  const onlyOne = setComponentProperty([node("a", "server", { replicas: 3 })], "a", "replicas", 1);
  assert.ok(onlyOne.ok);
  if (onlyOne.ok) assert.equal("properties" in onlyOne.nodes[0].data, false);
});

test("nothing is written to a node until the user changes something", () => {
  const nodes = [node("a", "server")];
  assert.equal("properties" in nodes[0].data, false);
  const result = setComponentProperty(nodes, "a", "capacity", 2500);
  assert.ok(result.ok && !result.changed);
  assert.equal("properties" in nodes[0].data, false);
});

test("reset removes the override and the effective value returns to the default", () => {
  const nodes = [node("a", "server", { replicas: 3 }), node("b", "database", { replicas: 2, capacity: 8000 })];
  const result = resetComponentProperty(nodes, "a", "replicas");
  assert.ok(result.ok && result.changed);
  if (result.ok) {
    assert.equal("properties" in result.nodes[0].data, false);
    assert.equal(getEffectiveProperty("server", result.nodes[0].data.properties, "replicas"), 1);
    assert.equal(result.nodes[1], nodes[1]);
  }
  const partial = resetComponentProperty(nodes, "b", "capacity");
  assert.ok(partial.ok);
  if (partial.ok) assert.deepEqual(partial.nodes[1].data.properties, { replicas: 2 });
});

test("resetting something that is not overridden changes nothing", () => {
  const nodes = [node("a", "server")];
  const result = resetComponentProperty(nodes, "a", "replicas");
  assert.ok(result.ok && !result.changed && result.nodes === nodes);
  const missing = resetComponentProperty(nodes, "ghost", "replicas");
  assert.ok(!missing.ok && missing.reason === "node-not-found");
});

// ---- Drafts ----

test("unfinished text is never a change to the graph", () => {
  const nodes = [node("a", "server", { replicas: 3 })];
  for (const text of ["", " ", "1.", ".", "-", "abc", "1e", "0x10", "Infinity", "3,5", "2.5", "0", "99999"]) {
    const before = JSON.stringify(nodes);
    if (text !== "1.") {
      const result = commitPropertyDraft(nodes, "a", "replicas", text);
      assert.equal(result.ok, false, JSON.stringify(text));
    }
    assert.equal(JSON.stringify(nodes), before);
  }
  const unchanged = commitPropertyDraft(nodes, "a", "replicas", "");
  assert.ok(!unchanged.ok && unchanged.reason === "empty");
});

test("a finished draft commits once, as one change", () => {
  const nodes = [node("a", "server")];
  const result = commitPropertyDraft(nodes, "a", "replicas", " 4 ");
  assert.ok(result.ok && result.changed);
  if (result.ok) assert.equal(result.nodes[0].data.properties?.replicas, 4);
  const trailing = commitPropertyDraft(nodes, "a", "replicas", "4.");
  assert.ok(trailing.ok && trailing.changed);
});

test("what happens when an edit is finished", () => {
  const finish = (text: string, leaving: boolean, committed = 1) => finishDraft("server", "replicas", text, committed, leaving).action;
  assert.equal(finish("3", false), "commit");
  assert.equal(finish("3", true), "commit");
  assert.equal(finish("1", false), "discard");
  assert.equal(finish("1.", true), "discard");
  // Invalid: kept for correction on Enter, dropped when leaving.
  assert.equal(finish("", false), "keep-editing");
  assert.equal(finish("", true), "discard");
  assert.equal(finish("abc", false), "keep-editing");
  assert.equal(finish("abc", true), "discard");
  assert.equal(finish("0", false), "keep-editing");
  const message = finishDraft("server", "replicas", "2.5", 1, false);
  assert.ok(message.action === "keep-editing" && message.message.length > 0);
});

test("interpreting a draft reads the committed value for comparison only", () => {
  assert.deepEqual(interpretDraft("server", "replicas", "3", 3), { action: "none" });
  assert.deepEqual(interpretDraft("server", "replicas", "4", 3), { action: "commit", value: 4 });
  const invalid = interpretDraft("server", "replicas", "x", 3);
  assert.equal(invalid.action, "invalid");
});

// ---- History ----

test("a finished property edit is one undo step, and undo and redo restore the value", () => {
  const ed = historyEditor(design());
  const set = setComponentProperty(ed.state.nodes, "server-1", "replicas", 4);
  assert.ok(set.ok);
  if (set.ok) assert.equal(ed.setNodes(set.nodes), true);
  assert.equal(ed.history.undoDepth(), 1);
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 4);

  ed.undo();
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 1);
  assert.equal("properties" in server(ed.state).data, false);
  ed.redo();
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 4);
});

test("a reset is one undoable step, and two edits to the same property stay separate steps", () => {
  const ed = historyEditor(design());
  const apply = (value: number) => {
    const r = setComponentProperty(ed.state.nodes, "server-1", "replicas", value);
    assert.ok(r.ok);
    if (r.ok) ed.setNodes(r.nodes);
  };
  apply(3);
  apply(5);
  assert.equal(ed.history.undoDepth(), 2);
  const reset = resetComponentProperty(ed.state.nodes, "server-1", "replicas");
  assert.ok(reset.ok);
  if (reset.ok) ed.setNodes(reset.nodes);
  assert.equal(ed.history.undoDepth(), 3);

  ed.undo();
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 5);
  ed.undo();
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 3);
  ed.undo();
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 1);
  ed.redo();
  ed.redo();
  ed.redo();
  assert.equal(getEffectiveProperty("server", server(ed.state).data.properties, "replicas"), 1);
});

test("a no-op or refused edit adds nothing to the history", () => {
  const ed = historyEditor(design());
  const same = setComponentProperty(ed.state.nodes, "server-1", "replicas", 1);
  assert.ok(same.ok);
  if (same.ok) assert.equal(ed.setNodes(same.nodes), false);
  const bad = setComponentProperty(ed.state.nodes, "server-1", "replicas", 0);
  assert.equal(bad.ok, false);
  const reset = resetComponentProperty(ed.state.nodes, "server-1", "replicas");
  assert.ok(reset.ok);
  if (reset.ok) assert.equal(ed.setNodes(reset.nodes), false);
  assert.equal(ed.history.undoDepth(), 0);
});

test("renaming a component still coalesces, and does not merge with property edits", () => {
  const ed = historyEditor(design());
  for (const label of ["A", "AP", "API"]) {
    ed.setNodes(ed.state.nodes.map((n) => (n.id === "server-1" ? { ...n, data: { ...n.data, label } } : n)));
  }
  assert.equal(ed.history.undoDepth(), 1);
  const set = setComponentProperty(ed.state.nodes, "server-1", "replicas", 2);
  assert.ok(set.ok);
  if (set.ok) ed.setNodes(set.nodes);
  assert.equal(ed.history.undoDepth(), 2);
});

// ---- Autosave and persistence ----

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

function savedProject() {
  const storage = memoryStorage();
  let tick = 0;
  const store = createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: () => "p1",
  });
  const project = store.createProject({ nodes: design().nodes as never, edges: design().edges });
  const timers = fakeTimers();
  const autosave = createProjectAutosave(project.id, store, timers);
  const content = (nodes: unknown) => ({ title: project.title, nodes: nodes as never, edges: project.edges });
  autosave.update(content(project.nodes));
  return { storage, store, project, timers, autosave, content };
}

test("a real edit dirties the project and saves, and the override survives a reload", () => {
  const { storage, store, project, timers, autosave, content } = savedProject();
  const set = setComponentProperty(project.nodes as unknown as TNode[], "server-1", "replicas", 4);
  assert.ok(set.ok);
  if (!set.ok) return;
  autosave.update(content(set.nodes));
  assert.equal(autosave.getStatus(), "dirty");
  timers.fire();
  assert.equal(autosave.getStatus(), "saved");

  const reloaded = createProjectStore({ getStorage: () => storage }).getProject(project.id);
  assert.deepEqual(reloaded?.nodes.find((n) => n.id === "server-1")?.data.properties, { replicas: 4 });
  assert.equal(store.getProject(project.id)?.nodes.length, 3);
});

test("a no-op or invalid edit does not touch autosave", () => {
  const { project, timers, autosave, content } = savedProject();
  const same = setComponentProperty(project.nodes as unknown as TNode[], "server-1", "replicas", 1);
  assert.ok(same.ok);
  if (same.ok) autosave.update(content(same.nodes));
  const bad = setComponentProperty(project.nodes as unknown as TNode[], "server-1", "replicas", -4);
  assert.equal(bad.ok, false);
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(timers.pending(), 0);
});

test("a reset is saved by removing the stored value", () => {
  const { storage, project, timers, autosave, content } = savedProject();
  const set = setComponentProperty(project.nodes as unknown as TNode[], "server-1", "replicas", 4);
  assert.ok(set.ok);
  if (!set.ok) return;
  autosave.update(content(set.nodes));
  timers.fire();

  const reset = resetComponentProperty(set.nodes, "server-1", "replicas");
  assert.ok(reset.ok);
  if (!reset.ok) return;
  autosave.update(content(reset.nodes));
  timers.fire();

  const raw = JSON.parse(storage.data.get(STORAGE_KEY) ?? "{}");
  const saved = raw.projects[0].nodes.find((n: { id: string }) => n.id === "server-1");
  assert.equal("properties" in saved.data, false);
});

test("undoing a property edit before the debounce ends cancels the save", () => {
  const { project, timers, autosave, content } = savedProject();
  const ed = historyEditor({ nodes: project.nodes as unknown as TNode[], edges: project.edges });
  const set = setComponentProperty(ed.state.nodes, "server-1", "replicas", 4);
  assert.ok(set.ok);
  if (!set.ok) return;
  ed.setNodes(set.nodes);
  autosave.update(content(ed.state.nodes));
  assert.equal(autosave.getStatus(), "dirty");
  ed.undo();
  autosave.update(content(ed.state.nodes));
  assert.equal(autosave.getStatus(), "saved");
  assert.equal(timers.pending(), 0);
});

// ---- Fingerprint and Run Design ----

test("a property edit changes the evaluation fingerprint, and undo restores it", () => {
  const ed = historyEditor(design());
  const original = fp(ed.state);
  const set = setComponentProperty(ed.state.nodes, "server-1", "replicas", 4);
  assert.ok(set.ok);
  if (set.ok) ed.setNodes(set.nodes);
  const edited = fp(ed.state);
  assert.notEqual(edited, original);

  ed.undo();
  assert.equal(fp(ed.state), original);
  ed.redo();
  assert.equal(fp(ed.state), edited);
});

test("an edit that does not change the effective value does not change the fingerprint", () => {
  const original = fp(design());
  const set = setComponentProperty(design().nodes, "server-1", "replicas", 1);
  assert.ok(set.ok);
  if (set.ok) assert.equal(fp({ ...design(), nodes: set.nodes }), original);
});

test("editing a setting makes a Run Design result stale, undo makes it current, and Run Again uses the new value", async () => {
  const ed = historyEditor(design());
  const session = createRunSession(evaluateDesign);
  const run = (graph: Graph) =>
    session.run({ projectId: "p1", nodes: graph.nodes, edges: graph.edges, traffic: DEFAULT_TRAFFIC });
  const view = (graph: Graph) => buildResultsView(session.getState(), fp(graph));

  await run(ed.state);
  const firstCapacity = session.getState().current?.evaluation.metrics.capacityRps;
  assert.equal(firstCapacity, 2500);
  assert.equal(view(ed.state).isStale, false);

  const set = setComponentProperty(ed.state.nodes, "server-1", "replicas", 4);
  assert.ok(set.ok);
  if (set.ok) ed.setNodes(set.nodes);
  assert.equal(view(ed.state).isStale, true);
  assert.equal(view(ed.state).runButtonState, "stale");

  ed.undo();
  assert.equal(view(ed.state).isStale, false);
  ed.redo();
  assert.equal(view(ed.state).isStale, true);

  await run(ed.state);
  const state = session.getState();
  assert.equal(state.current?.evaluation.metrics.capacityRps, 10000);
  assert.equal(state.previous?.evaluation.metrics.capacityRps, 2500);
  assert.equal(view(ed.state).isStale, false);
  assert.equal(view(ed.state).comparison?.metrics.capacityRps.direction, "improved");
});

test("resetting a setting returns the evaluation to the default behaviour", () => {
  const traffic = { requestsPerSecond: 6000 };
  const evaluate = (nodes: TNode[]) => evaluateArchitecture({ graph: { nodes, edges: design().edges } as never, traffic });
  const baseline = evaluate(design().nodes);
  const set = setComponentProperty(design().nodes, "server-1", "replicas", 5);
  assert.ok(set.ok);
  if (!set.ok) return;
  const tuned = evaluate(set.nodes);
  assert.notDeepEqual(tuned.metrics, baseline.metrics);
  assert.ok((tuned.metrics.capacityRps ?? 0) > (baseline.metrics.capacityRps ?? 0));

  const reset = resetComponentProperty(set.nodes, "server-1", "replicas");
  assert.ok(reset.ok);
  if (reset.ok) assert.deepEqual(evaluate(reset.nodes), baseline);
});

test("database read replicas and cache hit rate change the evaluation as described", () => {
  const traffic = { requestsPerSecond: 8000, readRatio: 90 };
  const base: Graph = {
    nodes: [node("c", "client"), node("s", "server", { replicas: 8 }), node("d", "database"), node("k", "cache")],
    edges: [edge("c", "s"), edge("s", "d"), edge("s", "k")],
  };
  const withProps = (id: string, properties: Record<string, number>) => ({
    ...base,
    nodes: base.nodes.map((n) => (n.id === id ? node(id, n.data.type, properties) : n)),
  });
  const capacity = (graph: Graph) => evaluateArchitecture({ graph: graph as never, traffic }).metrics.capacityRps ?? 0;
  assert.ok(capacity(withProps("d", { replicas: 3 })) > capacity(base));
  assert.ok(capacity(withProps("k", { cacheHitRate: 0.95 })) > capacity(base));
  assert.ok(capacity(withProps("k", { cacheHitRate: 0.2 })) < capacity(base));
});

// ---- Selection and the view ----

test("one selected component has configuration", () => {
  const graph = selectNode(design(), "server-1") as Graph;
  const view = getComponentConfigView(graph.nodes, graph.edges);
  assert.equal(view.kind, "node");
  if (view.kind === "node") {
    assert.equal(view.nodeId, "server-1");
    assert.equal(view.type, "server");
    assert.equal(view.label, "server-1");
    assert.deepEqual(view.properties.map((p) => p.key), ["replicas", "capacity"]);
  }
});

test("nothing selected, a selected connection, or several selections have no configuration", () => {
  const none = getComponentConfigView(design().nodes, design().edges);
  assert.deepEqual(none, { kind: "none", reason: "nothing-selected" });

  const edgeSelected = selectEdge(design(), "client-1->server-1") as Graph;
  assert.deepEqual(getComponentConfigView(edgeSelected.nodes, edgeSelected.edges), { kind: "none", reason: "edge-selected" });

  const two = { ...design(), nodes: design().nodes.map((n) => ({ ...n, selected: n.id !== "client-1" })) };
  assert.deepEqual(getComponentConfigView(two.nodes, two.edges), { kind: "none", reason: "multiple-selected" });

  const mixed = { nodes: selectNode(design(), "server-1").nodes as TNode[], edges: [edge("client-1", "server-1", true)] };
  assert.equal(getComponentConfigView(mixed.nodes, mixed.edges).kind, "none");
});

test("a selected component with no settings has an empty list", () => {
  const graph = selectNode(design(), "client-1") as Graph;
  const view = getComponentConfigView(graph.nodes, graph.edges);
  assert.ok(view.kind === "node" && view.properties.length === 0);
});

test("the view shows effective values, overrides and constraints", () => {
  const views = buildPropertyViews("database", { replicas: 2, notes: "x" });
  const replicas = views.find((v) => v.key === "replicas")!;
  const capacity = views.find((v) => v.key === "capacity")!;
  assert.equal(replicas.label, "Read replicas");
  assert.equal(replicas.value, 2);
  assert.equal(replicas.defaultValue, 0);
  assert.equal(replicas.overridden, true);
  assert.equal(replicas.canReset, true);
  assert.deepEqual(replicas.constraints, { min: 0, max: DATABASE_REPLICAS_MAX, step: 1 });
  assert.equal(replicas.kind, "integer");
  assert.equal(capacity.value, capacity.defaultValue);
  assert.equal(capacity.overridden, false);
  assert.equal(capacity.canReset, false);
  assert.ok(capacity.unit);
  assert.equal(replicas.validation.state, "valid");
});

test("the view reports the state of a draft without storing it", () => {
  const bad = buildPropertyViews("server", undefined, { replicas: "2.5", capacity: "3000" });
  assert.deepEqual(
    bad.map((v) => [v.key, v.validation.state, v.draft]),
    [["replicas", "invalid", "2.5"], ["capacity", "valid", "3000"]],
  );
  const invalid = bad[0].validation;
  assert.ok(invalid.state === "invalid" && invalid.reason === "not-an-integer" && invalid.message);
  assert.equal(bad[0].value, 1);
  assert.equal(bad[0].overridden, false);
  assert.equal("draft" in buildPropertyViews("server", undefined)[0], false);
});

test("the view carries no presentation", () => {
  const text = JSON.stringify(buildPropertyViews("cache", { cacheHitRate: 0.9 }));
  assert.equal(/\b(colou?r|icon|green|red|style|class)\b/i.test(text), false);
});

// ---- Storage ----

test("overrides persist through a save and reload, and defaults are never written", () => {
  const storage = memoryStorage();
  const store = createProjectStore({ getStorage: () => storage, newId: () => "p1" });
  const set = setComponentProperty(design().nodes, "server-1", "capacity", 3200);
  assert.ok(set.ok);
  if (!set.ok) return;
  const project = store.createProject({ nodes: set.nodes as never, edges: design().edges });
  const reloaded = createProjectStore({ getStorage: () => storage }).getProject(project.id);
  assert.deepEqual(reloaded?.nodes.find((n) => n.id === "server-1")?.data.properties, { capacity: 3200 });
  assert.equal("properties" in (reloaded?.nodes.find((n) => n.id === "client-1")?.data ?? {}), false);
  assert.equal(
    getEffectiveProperty("server", reloaded?.nodes.find((n) => n.id === "server-1")?.data.properties, "capacity"),
    3200,
  );
});
