import assert from "node:assert/strict";
import { test } from "node:test";

import { Position } from "@xyflow/react";

import { arrowHeadPath, connectionEnd, EDGE_STUB, EDGE_TARGET_LANE, facingSides, getOrthogonalEdgePath, sideAnchor } from "../src/lib/architecture/edgeRouting.ts";
import { ARCHITECTURE_NODE_SIZE } from "../src/lib/architecture/nodeLayout.ts";

// Architecture nodes are 192×56 with the input handle on the left edge and the output on the
// right edge, both at mid-height.
const { width: W, height: H } = ARCHITECTURE_NODE_SIZE;
type Box = { x: number; y: number };
const out = (box: Box) => ({ x: box.x + W, y: box.y + H / 2 });
const inp = (box: Box) => ({ x: box.x, y: box.y + H / 2 });

// The corner points of an SVG path made of M/L/H/V/Q commands. React Flow rounds corners with
// Q curves, whose control point is the corner the route turns at. Repeated points are dropped.
function points(path: string): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (const [, command, args] of path.matchAll(/([MLHVQ])([^MLHVQ]*)/g)) {
    const numbers = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (command === "H") x = numbers[0];
    else if (command === "V") y = numbers[0];
    else if (command === "Q") [x, y] = numbers.slice(0, 2);
    else [x, y] = numbers.slice(-2);
    const previous = result[result.length - 1];
    if (!previous || previous.x !== x || previous.y !== y) result.push({ x, y });
  }
  return result;
}

const route = (from: Box, to: Box) => {
  const s = out(from);
  const t = inp(to);
  const [path] = getOrthogonalEdgePath({
    sourceX: s.x, sourceY: s.y, sourcePosition: Position.Right,
    targetX: t.x, targetY: t.y, targetPosition: Position.Left,
  });
  return points(path);
};

// True when an axis-aligned segment passes through the inside of a node box.
function crosses(a: Box, b: Box, node: Box): boolean {
  const left = node.x + 1, right = node.x + W - 1, top = node.y + 1, bottom = node.y + H - 1;
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
  return true;
}

function assertReadable(from: Box, to: Box) {
  const p = route(from, to);
  // Leaves the output handle to the right and enters the input handle from the left.
  assert.ok(p[1].x > p[0].x && p[1].y === p[0].y, "first segment heads right out of the source");
  const last = p[p.length - 1];
  const beforeLast = p[p.length - 2];
  assert.ok(last.x > beforeLast.x && last.y === beforeLast.y, "last segment heads right into the target");
  assert.deepEqual(last, inp(to));
  for (let i = 1; i < p.length; i++) {
    for (const node of [from, to]) assert.equal(crosses(p[i - 1], p[i], node), false, `segment ${i} crosses a component`);
  }
}

test("a forward connection runs right, then into the target from its left", () => {
  assertReadable({ x: 0, y: 0 }, { x: 220, y: 0 });
  assertReadable({ x: 0, y: 0 }, { x: 220, y: 140 });
});

test("a target directly below the source still reads source → target", () => {
  assertReadable({ x: 220, y: 0 }, { x: 220, y: 140 });
  assertReadable({ x: 220, y: 140 }, { x: 220, y: 0 });
});

test("a back-edge goes around both components instead of through them", () => {
  // Same row: the detour runs below both.
  assertReadable({ x: 220, y: 0 }, { x: 0, y: 0 });
  // Different rows: the detour crosses in the gap between them.
  assertReadable({ x: 220, y: 140 }, { x: 0, y: 0 });
  const p = route({ x: 220, y: 0 }, { x: 0, y: 0 });
  assert.equal(p[1].x - p[0].x, EDGE_STUB, "leaves by one stub before turning");
});

test("the arrowhead's tip sits on the target handle and points into it", () => {
  assert.equal(arrowHeadPath(10, 20, Position.Left), "M10 20L2 16L2 24Z");
  assert.equal(arrowHeadPath(10, 20, Position.Top), "M10 20L6 12L14 12Z");
  assert.equal(arrowHeadPath(10, 20, Position.Left, true), "M10 20L2 14L2 26Z");
});

test("connections from different sources enter a component through one lane", () => {
  const target = { x: 480, y: 100 };
  const turnX = (from: Box) => route(from, target).at(-3)!.x;
  assert.equal(turnX({ x: 0, y: 0 }), turnX({ x: 100, y: 300 }));
  assert.equal(turnX({ x: 0, y: 0 }), target.x - EDGE_TARGET_LANE);
});

test("a short forward link still leaves its source before turning", () => {
  const [path] = getOrthogonalEdgePath({ sourceX: 100, sourceY: 0, sourcePosition: Position.Right, targetX: 128, targetY: 80, targetPosition: Position.Left });
  assert.match(path, /^M ?100[ ,]0/);
  assert.ok(!path.includes("L 99"));
});

test("a connection stops short of the handle and its line stops under the arrow", () => {
  assert.deepEqual(connectionEnd(100, 50, Position.Left), { tipX: 99, tipY: 50, lineX: 92, lineY: 50 });
  assert.deepEqual(connectionEnd(100, 50, Position.Bottom), { tipX: 100, tipY: 51, lineX: 100, lineY: 58 });
});

const boxAt = (x: number, y: number) => ({ x, y, width: 160, height: 56 });

test("traffic left to right keeps the usual route", () => {
  assert.deepEqual(facingSides(boxAt(0, 0), boxAt(300, 0)), { sourcePosition: Position.Right, targetPosition: Position.Left });
  assert.deepEqual(facingSides(boxAt(0, 0), boxAt(300, 400)), { sourcePosition: Position.Right, targetPosition: Position.Left });
});

test("a component above or below is reached through the sides that face it", () => {
  assert.deepEqual(facingSides(boxAt(0, 0), boxAt(0, 200)), { sourcePosition: Position.Bottom, targetPosition: Position.Top });
  assert.deepEqual(facingSides(boxAt(0, 200), boxAt(0, 0)), { sourcePosition: Position.Top, targetPosition: Position.Bottom });
});

test("a component behind is reached backwards, with no detour", () => {
  assert.deepEqual(facingSides(boxAt(300, 0), boxAt(0, 0)), { sourcePosition: Position.Left, targetPosition: Position.Right });
});

test("components too close to clear each other stay on the usual route", () => {
  assert.deepEqual(facingSides(boxAt(0, 0), boxAt(170, 20)), { sourcePosition: Position.Right, targetPosition: Position.Left });
});

test("an anchor sits in the middle of its side", () => {
  const box = boxAt(100, 200);
  assert.deepEqual(sideAnchor(box, Position.Bottom), { x: 180, y: 256 });
  assert.deepEqual(sideAnchor(box, Position.Left), { x: 100, y: 228 });
});
