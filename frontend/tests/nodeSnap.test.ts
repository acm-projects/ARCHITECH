import assert from "node:assert/strict";
import test from "node:test";

import { snapNode, type SnapBox } from "../src/lib/architecture/nodeSnap.ts";

const box = (x: number, y: number, width = 160, height = 56): SnapBox => ({ x, y, width, height });

test("stays put with nothing in reach", () => {
  const moved = snapNode(box(0, 0), [{ box: box(400, 300), connected: false }], 8);
  assert.deepEqual(moved, { x: 0, y: 0, guides: [] });
});

test("snaps to the same row, center to center, and draws the guide between them", () => {
  const moved = snapNode(box(0, 106), [{ box: box(400, 100), connected: false }], 8);
  assert.equal(moved.y, 100);
  assert.equal(moved.x, 0, "the other axis is free");
  assert.deepEqual(moved.guides, [{ axis: "y", at: 128, from: 0, to: 560 }]);
});

test("aligns centers even when the components differ in width", () => {
  const moved = snapNode(box(275, 0, 192), [{ box: box(300, 300, 132), connected: false }], 8);
  assert.equal(moved.x + 96, 300 + 66);
});

test("a connected component pulls from further away, which straightens its arrow", () => {
  const far = box(0, 110);
  const neighbor = box(400, 100);
  assert.equal(snapNode(far, [{ box: neighbor, connected: false }], 8).y, 110);
  assert.equal(snapNode(far, [{ box: neighbor, connected: true }], 8).y, 100);
});

test("takes the nearest match, and prefers a connected component on a tie", () => {
  const near = snapNode(box(0, 100), [
    { box: box(400, 106), connected: false },
    { box: box(800, 103), connected: false },
  ], 8);
  assert.equal(near.y, 103);
  const tie = snapNode(box(0, 100), [
    { box: box(400, 104), connected: false },
    { box: box(800, 96), connected: true },
  ], 8);
  assert.equal(tie.y, 96);
});

test("each axis snaps on its own, so a component can land on a row and a column", () => {
  const moved = snapNode(box(4, 4), [
    { box: box(0, 300), connected: false },
    { box: box(500, 0), connected: false },
  ], 8);
  assert.deepEqual([moved.x, moved.y], [0, 0]);
  assert.equal(moved.guides.length, 2);
});
