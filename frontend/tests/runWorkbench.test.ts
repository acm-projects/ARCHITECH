import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const page = readFileSync(new URL("../export-templates/runnable-app/web/index.html", import.meta.url), "utf8");
const helpers = page.slice(page.indexOf("  // ---- Workbench helpers ----"), page.indexOf("  // ---- Wiring ----"));
const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[c]!);
function harness(overrides: Record<string, unknown> = {}) {
  const elements = new Map<string, any>();
  const get = (id: string): any => {
    if (!elements.has(id)) elements.set(id, {
      textContent: "", innerHTML: "", hidden: false, disabled: false, dataset: {}, attributes: {},
      style: { setProperty(key: string, value: string) { this[key] = value; } } as any,
      setAttribute(key: string, value: string) { this.attributes[key] = value; },
      getBoundingClientRect: () => ({ width: 1200 }),
      focus: () => {}, contains: () => false,
      querySelector: () => null,
    });
    return elements.get(id);
  };
  const storage = new Map<string, string>();
  const context: any = {
    $: get, BASE: "/run/test", html: escape, plain: (v: string) => v.replace(/<[^>]+>/g, ""),
    document: { activeElement: null, querySelectorAll: () => [] },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    config: { design: { nodes: [{ id: "db", label: "Orders database", type: "database" }] }, components: [{ node: "db", what: "PostgreSQL" }] },
    nodeTypes: { database: "Database" }, history: [], items: [{ id: 1, title: "Before", body: "Old text", status: "new" }],
    stepsFor: (trace: any) => trace.steps, diagramNodes: () => [], renderItems: () => {},
    loadItems: async () => true, api: async () => ({}),
    ...overrides,
  };
  runInNewContext(helpers + "; globalThis.workbench = { clampSplit, applySplit, restoreSplit, traceSummary, nodeInspectionData, selectNode, beginEdit, cancelEdit, saveEdit, editDrafts, renderItemEditor };", context);
  return { context, elements, get, storage, workbench: context.workbench };
}

test("split width clamps both panes and restores only valid stored values", () => {
  const { workbench: w, storage, get } = harness();
  assert.equal(w.clampSplit(0, 1200), 320 / 1200 * 100);
  assert.equal(w.clampSplit(100, 1200), (1200 - 328) / 1200 * 100);
  assert.equal(w.clampSplit(NaN, 1200), 46);
  w.applySplit(60, { persist: true });
  assert.equal(get("split").style["--split-size"], "60%");
  assert.equal(w.restoreSplit(), 60);
  storage.set("architech-run-split:/run/test", "NaN");
  assert.equal(w.restoreSplit(), 46);
  storage.set("architech-run-split:/run/test", "");
  assert.equal(w.restoreSplit(), 46);
});

test("trace summary distinguishes measured duration, absent timing and network failure", () => {
  const { workbench: w } = harness();
  assert.equal(w.traceSummary({ method: "PATCH", path: "/api/items/1", status: 200, durationMs: 123.6 }).duration, "124 ms");
  assert.equal(w.traceSummary({ status: 200 }).duration, "Not measured");
  assert.equal(w.traceSummary({ status: 0, durationMs: 0 }).status, "Network error");
  assert.equal(w.traceSummary({ status: 0, durationMs: 0 }).duration, "0 ms");
});

test("node inspection uses full component metadata and latest matching trace", () => {
  const { context, workbench: w, get } = harness();
  assert.equal(w.nodeInspectionData("db").state, "No request recorded");
  context.history.push(
    { label: "Latest unrelated", status: 200, steps: [{ node: "api", text: "Read" }] },
    { label: "Failed save", status: 500, steps: [{ node: "db", text: "<b>Connection refused</b>", ok: false }] },
  );
  const data = w.nodeInspectionData("db");
  assert.equal(data.name, "Orders database");
  assert.equal(data.technology, "PostgreSQL");
  assert.equal(data.state, "Failed");
  assert.equal(data.request, "Failed save");
  assert.equal(data.detail, "Connection refused");
  w.selectNode("db");
  assert.equal(get("node-inspector").hidden, false);
  assert.equal(get("node-name").textContent, "Orders database");
});

test("inline edits cancel locally and survive render/refresh without mutating saved items", () => {
  let renders = 0;
  const { context, workbench: w } = harness({ renderItems: () => renders++ });
  w.beginEdit(1);
  w.editDrafts.get(1).title = "Draft";
  w.beginEdit(1);
  assert.equal(w.editDrafts.get(1).title, "Draft");
  assert.equal(context.items[0].title, "Before");
  w.cancelEdit(1);
  assert.equal(w.editDrafts.has(1), false);
  assert.ok(renders >= 2);
});

test("inline save validates before PATCH and keeps failed drafts for retry", async () => {
  let calls = 0;
  const { workbench: w } = harness({ api: async () => { calls++; throw new Error("Save failed"); } });
  w.beginEdit(1);
  const draft = w.editDrafts.get(1);
  draft.title = "   ";
  await w.saveEdit(1);
  assert.equal(calls, 0);
  assert.match(draft.error, /title/i);
  draft.title = "Changed";
  draft.body = "x".repeat(10001);
  await w.saveEdit(1);
  assert.equal(calls, 0);
  draft.body = "New body";
  await w.saveEdit(1);
  assert.equal(calls, 1);
  assert.equal(draft.title, "Changed");
  assert.equal(draft.error, "Save failed");
  assert.equal(draft.saving, false);
  assert.equal(w.editDrafts.has(1), true);
});

test("inline save prevents duplicate requests and updates the item before reload", async () => {
  let resolve: (value: any) => void = () => {};
  let calls = 0;
  let reloaded = false;
  const { context, workbench: w } = harness({
    api: async (method: string, path: string, options: any) => {
      calls++;
      assert.equal(method, "PATCH");
      assert.equal(path, "/api/items/1");
      assert.equal(options.body.title, "Changed");
      return await new Promise((done) => { resolve = done; });
    },
    loadItems: async () => { reloaded = true; },
  });
  w.beginEdit(1);
  w.editDrafts.get(1).title = " Changed ";
  const pending = w.saveEdit(1);
  await w.saveEdit(1);
  assert.equal(calls, 1);
  w.cancelEdit(1);
  assert.equal(w.editDrafts.has(1), true, "cannot cancel an in-flight save");
  resolve({ item: { id: 1, title: "Changed", body: "Old text", status: "new" } });
  await pending;
  assert.equal(context.items[0].title, "Changed");
  assert.equal(w.editDrafts.has(1), false);
  assert.equal(reloaded, true);
});

test("inline editor escapes untrusted content in values and textareas", () => {
  const { workbench: w } = harness();
  const markup = w.renderItemEditor({ id: 1 }, { title: '\"><img src=x>', body: '</textarea><script>bad()</script>', saving: false, error: "" });
  assert.ok(!markup.includes("<script>"));
  assert.ok(!markup.includes("<img"));
  assert.match(markup, /&lt;\/textarea&gt;/);
  assert.match(markup, /maxlength="200"/);
  assert.match(markup, /maxlength="10000"/);
});

test("polling rerenders preserve draft values and text selection", () => {
  const { context, workbench: w, get } = harness();
  context.config.features = { queue: true };
  const render = page.slice(page.indexOf("  function renderItems()"), page.indexOf("  let pollTimer"));
  runInNewContext(render, context);
  w.beginEdit(1);
  w.editDrafts.get(1).title = "Unsaved local title";
  const active = { name: "title", selectionStart: 2, selectionEnd: 7, closest: () => ({ dataset: { editId: "1", id: "1" } }) };
  context.document.activeElement = active;
  get("items").contains = (value: unknown) => value === active;
  let focused = false;
  let selection: number[] = [];
  get("edit-title-1").focus = () => { focused = true; };
  get("edit-title-1").setSelectionRange = (start: number, end: number) => { selection = [start, end]; };
  context.items = [{ id: 1, title: "Server value", body: "Server body", status: "queued" }];
  context.renderItems();
  assert.match(get("items").innerHTML, /value="Unsaved local title"/);
  assert.equal(focused, true);
  assert.deepEqual(selection, [2, 7]);
});

test("saved edits are read back from the API after reload", async () => {
  let stored = { id: 1, title: "Before", body: "Old text", status: "new" };
  const { context, workbench: w, get } = harness({
    clearTimeout: () => {},
    api: async (method: string, _path: string, options: any) => {
      if (method === "PATCH") {
        stored = { ...stored, ...options.body };
        return { item: { ...stored } };
      }
      return { items: [{ ...stored }] };
    },
  });
  get("q").value = "";
  const loader = page.slice(page.indexOf("  let pollTimer"), page.indexOf("  function renderHistory()"));
  runInNewContext(loader, context);
  w.beginEdit(1);
  w.editDrafts.get(1).title = "Persisted title";
  w.editDrafts.get(1).body = "Persisted body";
  await w.saveEdit(1);
  context.items = [];
  await context.loadItems({ quiet: true });
  assert.equal(context.items[0].title, "Persisted title");
  assert.equal(context.items[0].body, "Persisted body");
  assert.equal(w.editDrafts.size, 0);
});

test("older item responses cannot replace a newer reload", async () => {
  const resolves: ((value: any) => void)[] = [];
  const { context, get } = harness({ clearTimeout: () => {}, api: () => new Promise((resolve) => resolves.push(resolve)) });
  get("q").value = "";
  const loader = page.slice(page.indexOf("  let pollTimer"), page.indexOf("  function renderHistory()"));
  runInNewContext(loader, context);
  const older = context.loadItems({ quiet: true });
  const newer = context.loadItems({ quiet: true });
  resolves[1]({ items: [{ id: 1, title: "Latest", status: "new" }] });
  await newer;
  resolves[0]({ items: [{ id: 1, title: "Stale", status: "new" }] });
  await older;
  assert.equal(context.items[0].title, "Latest");
});

test("API trace duration measures round trips including network failures", async () => {
  const apiFunction = page.slice(page.indexOf("  async function api("), page.indexOf("  // then:"));
  const traces: any[] = [];
  let tick = 100;
  const context: any = {
    BASE: "", Headers, setOperationFeedback: () => {}, performance: { now: () => { const value = tick; tick += 25; return value; } },
    record: (trace: unknown) => traces.push(trace),
    fetch: async () => ({ ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }), json: async () => ({ items: [] }) }),
  };
  await runInNewContext(apiFunction + '; api("GET", "/api/items");', context);
  assert.equal(traces[0].durationMs, 25);
  assert.equal(traces[0].status, 200);
  context.fetch = async () => { throw new Error("Offline"); };
  await assert.rejects(runInNewContext(apiFunction + '; api("GET", "/api/items");', context), /did not answer/);
  assert.equal(traces[1].durationMs, 25);
  assert.equal(traces[1].status, 0);
});

test("node inspection updates running and failed playback state", () => {
  const { context, workbench: w } = harness();
  context.history.push({ label: "Save", status: 500, steps: [{ node: "db", text: "Failed", ok: false }] });
  runInNewContext('displayedTrace = history[0]; nodeStates.set("db", "active");', context);
  assert.equal(w.nodeInspectionData("db").state, "Running");
  runInNewContext('nodeStates.set("db", "fail");', context);
  assert.equal(w.nodeInspectionData("db").state, "Failed");
});

test("component inspection follows the selected request instead of a newer history entry", () => {
  const { context, workbench: w } = harness();
  context.history.push(
    { label: "New save", steps: [{ node: "db", text: "Saved new item" }] },
    { label: "Earlier read", steps: [{ node: "db", text: "Read old items" }] },
  );
  runInNewContext("displayedTrace = history[1];", context);
  assert.equal(w.nodeInspectionData("db").request, "Earlier read");
  assert.equal(w.nodeInspectionData("db").detail, "Read old items");
});

test("polling preserves focus on the editor Save button", () => {
  const { context, get } = harness();
  const active = { dataset: { act: "save-edit" }, closest: () => ({ dataset: { id: "1", editId: "1" } }) };
  context.document.activeElement = active;
  get("items").contains = () => true;
  const focus = runInNewContext("captureEditorFocus();", context);
  assert.equal(focus.action, "save-edit");
  let restored = false;
  get("items").querySelector = () => ({ focus: () => { restored = true; } });
  context.savedFocus = focus;
  runInNewContext("restoreEditorFocus(savedFocus);", context);
  assert.equal(restored, true);
});

test("a failed save restores editor focus after disabled fields are replaced", async () => {
  let context: any;
  const h = harness({
    renderItems: () => { if (context) context.document.activeElement = null; },
    api: async () => { throw new Error("Offline"); },
  });
  context = h.context;
  h.workbench.beginEdit(1);
  const input = { name: "title", selectionStart: 2, selectionEnd: 2, closest: () => ({ dataset: { id: "1", editId: "1" } }) };
  context.document.activeElement = input;
  h.get("items").contains = () => true;
  let restored = false;
  h.get("edit-title-1").focus = () => { restored = true; };
  h.get("edit-title-1").setSelectionRange = () => {};
  await h.workbench.saveEdit(1);
  assert.equal(restored, true);
  assert.equal(h.workbench.editDrafts.get(1).error, "Offline");
});
