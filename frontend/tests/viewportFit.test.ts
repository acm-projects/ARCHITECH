import assert from "node:assert/strict";
import test from "node:test";

import { VIEW_MARGIN, viewportAfterShrink, type Box, type Viewport } from "../src/lib/architecture/viewportFit.ts";

const before = { width: 1400, height: 800 };
const after = { width: 960, height: 800 };
const node = (x: number): Box => ({ x, y: 100, width: 200, height: 60 });
const shrink = (boxes: Box[], viewport: Viewport) => viewportAfterShrink(boxes, viewport, before, after, 0.25);
const screenRight = (box: Box, { x, zoom }: Viewport) => (box.x + box.width) * zoom + x;
const screenLeft = (box: Box, { x, zoom }: Viewport) => box.x * zoom + x;

test("leaves the view alone when every component already clears the narrower canvas", () => {
  assert.equal(shrink([node(0), node(300)], { x: 0, y: 0, zoom: 1 }), null);
});

test("leaves the view alone on an empty canvas", () => {
  assert.equal(shrink([], { x: 0, y: 0, zoom: 1 }), null);
});

test("pans without zooming when the components fit at the current zoom", () => {
  const boxes = [node(400), node(900)];
  const next = shrink(boxes, { x: 0, y: 40, zoom: 1 });
  assert.ok(next);
  assert.equal(next.zoom, 1);
  assert.equal(next.y, 40, "only the horizontal position changes");
  assert.equal(screenRight(boxes[1]!, next), after.width - VIEW_MARGIN);
  assert.ok(screenLeft(boxes[0]!, next) >= VIEW_MARGIN);
});

test("zooms out when the components are wider than the narrower canvas", () => {
  const boxes = [node(0), node(1100)];
  const next = shrink(boxes, { x: 50, y: 0, zoom: 1 });
  assert.ok(next);
  assert.ok(next.zoom < 1);
  assert.ok(Math.abs(screenLeft(boxes[0]!, next) - VIEW_MARGIN) < 1e-9);
  assert.ok(Math.abs(screenRight(boxes[1]!, next) - (after.width - VIEW_MARGIN)) < 1e-9);
});

test("never zooms past the canvas minimum", () => {
  const next = shrink([node(0), node(100000)], { x: 0, y: 0, zoom: 0.3 });
  assert.equal(next, null, "the far component was never on screen");
  const wide = viewportAfterShrink([node(0), node(4000)], { x: 0, y: 0, zoom: 0.3 }, before, { width: 300, height: 800 }, 0.25);
  assert.equal(wide?.zoom, 0.25);
});

test("ignores components that were already out of view", () => {
  // The right-hand component is past the old edge, so the user had panned away from it.
  assert.equal(shrink([node(100), node(5000)], { x: 0, y: 0, zoom: 1 }), null);
});
