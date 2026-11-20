import assert from "node:assert/strict";
import test from "node:test";

import { fitStep, type StackPanel } from "../src/components/workspace/panel/stackFit.ts";

const panel = (id: string, activeAt: number, extra: Partial<StackPanel> = {}): StackPanel =>
  ({ id, activeAt, open: true, foldable: true, ...extra });

test("a column that fits is left alone", () => {
  assert.equal(fitStep([panel("live", 1), panel("archie", 2)], false), null);
});

test("an overflowing column folds the panel used longest ago, never the newest", () => {
  const panels = [panel("live", 3), panel("check", 1), panel("archie", 5)];
  assert.deepEqual(fitStep(panels, true), { fold: "check" });
  // Once that one is folded, the next oldest goes.
  assert.deepEqual(fitStep([panel("live", 3), panel("check", 1, { open: false }), panel("archie", 5)], true), { fold: "live" });
});

test("panels that cannot fold are skipped", () => {
  const panels = [panel("lesson", 1, { foldable: false }), panel("live", 2), panel("archie", 3)];
  assert.deepEqual(fitStep(panels, true), { fold: "live" });
});

test("when only the newest panel is open and still too tall, it scrolls inside itself", () => {
  assert.deepEqual(fitStep([panel("live", 1, { open: false }), panel("archie", 4)], true), { squeeze: true });
  assert.deepEqual(fitStep([panel("lesson", 1, { foldable: false }), panel("archie", 4)], true), { squeeze: true });
});

test("panels the column folded open again, last folded first, once there is room", () => {
  const panels = [
    panel("live", 1, { open: false, autoFoldedAt: 7, reopenHeight: 200 }),
    panel("check", 2, { open: false, autoFoldedAt: 8, reopenHeight: 150 }),
    panel("archie", 9),
  ];
  // The last one folded comes back first, so the column returns to how it was.
  assert.deepEqual(fitStep(panels, false, 160), { reopen: "check" });
  // Not enough room for it yet: nothing moves.
  assert.equal(fitStep(panels, false, 100), null);
});

test("a panel folded by hand stays folded", () => {
  assert.equal(fitStep([panel("live", 1, { open: false }), panel("archie", 2)], false, 900), null);
});
