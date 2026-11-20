import assert from "node:assert/strict";
import test from "node:test";

import { AUTO_ALIGN_GAP, autoAlign } from "../src/lib/architecture/autoLayout.ts";
import { ARCHITECTURE_NODE_SIZE } from "../src/lib/architecture/nodeLayout.ts";

const node = (id: string, x = 0, y = 0) => ({ id, position: { x, y }, data: { label: id } });
const edge = (source: string, target: string) => ({ source, target });
const COLUMN = ARCHITECTURE_NODE_SIZE.width + AUTO_ALIGN_GAP.x;
const ROW = ARCHITECTURE_NODE_SIZE.height + AUTO_ALIGN_GAP.y;
const at = (nodes: ReturnType<typeof autoAlign<ReturnType<typeof node>>>, id: string) => nodes.find((n) => n.id === id)!.position;

test("components line up left to right in the direction requests travel", () => {
  const nodes = [node("db", 900, 40), node("client", 300, 500), node("api", 10, 10), node("lb", 600, 200)];
  const aligned = autoAlign(nodes, [edge("client", "lb"), edge("lb", "api"), edge("api", "db")]);
  const left = 10;
  assert.equal(at(aligned, "client").x, left);
  assert.equal(at(aligned, "lb").x, left + COLUMN);
  assert.equal(at(aligned, "api").x, left + 2 * COLUMN);
  assert.equal(at(aligned, "db").x, left + 3 * COLUMN);
  // A single chain is one straight row.
  assert.equal(new Set(aligned.map((n) => n.position.y)).size, 1);
});

test("a component sits one column right of the furthest thing that sends to it", () => {
  const aligned = autoAlign(
    [node("client"), node("cdn", 0, 100), node("api", 0, 200), node("db", 0, 300)],
    [edge("client", "api"), edge("client", "cdn"), edge("cdn", "api"), edge("api", "db")],
  );
  assert.equal(at(aligned, "api").x - at(aligned, "client").x, 2 * COLUMN);
  assert.equal(at(aligned, "db").x - at(aligned, "client").x, 3 * COLUMN);
});

test("siblings stack in rows, centred on the column before them", () => {
  const aligned = autoAlign([node("lb"), node("a", 0, 10), node("b", 0, 20)], [edge("lb", "a"), edge("lb", "b")]);
  assert.equal(at(aligned, "b").y - at(aligned, "a").y, ROW);
  assert.equal(at(aligned, "lb").y, (at(aligned, "a").y + at(aligned, "b").y) / 2);
});

test("a loop does not push components out forever, and nothing overlaps", () => {
  const nodes = [node("a"), node("b", 0, 60), node("c", 0, 120), node("lonely", 0, 180)];
  const aligned = autoAlign(nodes, [edge("a", "b"), edge("b", "c"), edge("c", "a")]);
  assert.ok(aligned.every((n) => n.position.x <= 2 * COLUMN));
  const spots = new Set(aligned.map((n) => `${n.position.x},${n.position.y}`));
  assert.equal(spots.size, aligned.length);
});

test("the same design always lands the same way, and keeps everything else on each node", () => {
  const nodes = [node("x", 50, 50), node("y", 400, 80)];
  const edges = [edge("x", "y")];
  assert.deepEqual(autoAlign(nodes, edges), autoAlign(nodes, edges));
  assert.deepEqual(autoAlign(nodes, edges)[0].data, { label: "x" });
  assert.deepEqual(autoAlign([], edges), []);
});
