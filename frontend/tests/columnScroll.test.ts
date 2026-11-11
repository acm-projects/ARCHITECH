import assert from "node:assert/strict";
import test from "node:test";

import { columnScrollDelta } from "../src/components/workspace/panel/columnScroll.ts";

const column = { top: 68, bottom: 688 };

test("a panel already in view stays put", () => {
  assert.equal(columnScrollDelta({ top: 80, bottom: 452 }, column, 12), 0);
});

test("a panel below the fold scrolls up far enough to show all of it", () => {
  // Archie under the Challenge panel in a 1366x768 window.
  assert.equal(columnScrollDelta({ top: 464, bottom: 844 }, column, 12), 168);
});

test("a panel above the fold scrolls back down to it", () => {
  assert.equal(columnScrollDelta({ top: -88, bottom: 284 }, column, 12), -168);
});

test("a panel taller than the column keeps its top in view", () => {
  assert.equal(columnScrollDelta({ top: 300, bottom: 1300 }, column, 12), 220);
  assert.equal(columnScrollDelta({ top: -100, bottom: 900 }, column, 12), -180);
});
