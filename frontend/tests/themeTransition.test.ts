import assert from "node:assert/strict";
import test from "node:test";

import { changeThemeWithTransition } from "../src/lib/theme.ts";

test("a theme change crossfades when the browser supports it", () => {
  const calls: string[] = [];
  const document = {
    startViewTransition(update: () => void) {
      calls.push("transition");
      update();
    },
  };
  changeThemeWithTransition(document, false, () => calls.push("update"));
  assert.deepEqual(calls, ["transition", "update"]);
});

test("reduced motion changes the theme without a transition", () => {
  const calls: string[] = [];
  const document = { startViewTransition: () => calls.push("transition") };
  changeThemeWithTransition(document, true, () => calls.push("update"));
  assert.deepEqual(calls, ["update"]);
});

test("browsers without view transitions still change the theme", () => {
  const calls: string[] = [];
  changeThemeWithTransition({}, false, () => calls.push("update"));
  assert.deepEqual(calls, ["update"]);
});
