import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const page = readFileSync(new URL("../export-templates/runnable-app/web/index.html", import.meta.url), "utf8");
const renderer = page.slice(page.indexOf("  const nodeGlyphs ="), page.indexOf("  const diagramNodes"));
function render(nodes: object[], edges: object[]) {
  const attributes: Record<string, string> = {};
  const svg = { innerHTML: "", setAttribute: (key: string, value: string) => { attributes[key] = value; } };
  runInNewContext(renderer + "; drawDiagram(svg);", {
    svg, config: { design: { nodes, edges }, components: [] },
    html: (value: unknown) => String(value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[c]!),
  });
  return { markup: svg.innerHTML, attributes };
}
test("run diagram preserves saved positions, connects side handles and rounds routed edges", () => {
  const { markup, attributes } = render([
    { id: "a", label: "Users", type: "client", x: 100, y: 100 },
    { id: "b", label: "Redis", type: "cache", x: 350, y: 200 },
  ], [{ source: "a", target: "b" }]);
  assert.match(markup, /translate\(100,100\)/);
  assert.match(markup, /translate\(350,200\)/);
  assert.match(markup, /d="M224,120[^\"]*Q/);
  assert.match(markup, /class="handle" cx="124"/);
  assert.match(markup, /class="handle" cx="0"/);
  assert.match(markup, /rx="12"/);
  assert.match(markup, /class="icon-tile"/);
  assert.equal(attributes.viewBox, "80 80 414 180");
});
test("run diagram escapes labels, ignores missing endpoints and handles an empty design", () => {
  const { markup } = render([{ id: "a", label: "<script>", type: "custom", x: 0, y: 0 }], [{ source: "a", target: "missing" }]);
  assert.ok(!markup.includes("<script>"));
  assert.ok(markup.includes("&lt;script&gt;"));
  assert.ok(!markup.includes('class="edge"'));
  assert.equal(render([], []).markup, "");
});

test("diagram labels retain recognizable component names", () => {
  const { markup } = render([{ id: "db", label: "PostgreSQL", type: "database", x: 0, y: 0 }], []);
  assert.match(markup, /class="name">PostgreSQL<\/text>/);
});
test("zoom stays bounded and fit resets the viewport", () => {
  const style = {};
  const svg = { style };
  const result = runInNewContext(renderer + "; [setDiagramZoom(svg, 9), setDiagramZoom(svg, -1), setDiagramZoom(svg, NaN)];", { svg });
  assert.deepEqual(Array.from(result), [4, 1, 1]);
  assert.deepEqual(style, { width: "100%", height: "100%" });
});
test("request history starts disabled and enables replay when a request arrives", () => {
  const elements = { history: { innerHTML: "", disabled: false }, replay: { disabled: false } };
  const history: object[] = [];
  const context = { $: (id: keyof typeof elements) => elements[id], history, displayedTrace: null, html: String };
  const fn = page.slice(page.indexOf("  function renderHistory()"), page.indexOf("  // ---- Workbench helpers ----"));
  runInNewContext(fn + "; renderHistory();", context);
  assert.equal(elements.history.disabled, true);
  assert.equal(elements.replay.disabled, true);
  assert.match(elements.history.innerHTML, /No requests yet/);
  history.push({ time: new Date(), label: "Add an item", status: 201 });
  runInNewContext(fn + "; renderHistory();", context);
  assert.equal(elements.history.disabled, false);
  assert.equal(elements.replay.disabled, false);
  assert.match(elements.history.innerHTML, /Add an item/);
});
