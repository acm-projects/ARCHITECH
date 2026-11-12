import assert from "node:assert/strict";
import { test } from "node:test";

import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY, applyThemeClass, themeClass } from "../src/lib/theme.ts";

// Runs the inline script against a stub page and returns the classes it put on <html>.
function boot(pathname: string, saved: string | null | Error) {
  const classes = new Set<string>();
  const localStorage = {
    getItem(key: string) {
      assert.equal(key, THEME_STORAGE_KEY);
      if (saved instanceof Error) throw saved;
      return saved;
    },
  };
  const document = { documentElement: { classList: { add: (name: string) => classes.add(name) } } };
  const logged: unknown[] = [];
  const console = { error: (...args: unknown[]) => logged.push(args) };
  new Function("location", "localStorage", "document", "console", THEME_BOOT_SCRIPT)(
    { pathname }, localStorage, document, console,
  );
  return { classes: [...classes], logged };
}

test("the boot script picks the same class React applies after hydration", () => {
  assert.deepEqual(boot("/dashboard", "dark").classes, [themeClass("/dashboard", "dark")]);
  assert.deepEqual(boot("/dashboard", "light").classes, [themeClass("/dashboard", "light")]);
  assert.deepEqual(boot("/workspace/abc", null).classes, [themeClass("/workspace/abc", "light")]);
});

test("the landing page stays unthemed whatever is saved", () => {
  assert.deepEqual(boot("/", "dark").classes, []);
  assert.equal(themeClass("/", "dark"), null);
});

test("unreadable storage leaves the page unthemed and is reported", () => {
  const result = boot("/dashboard", new Error("blocked"));
  assert.deepEqual(result.classes, []);
  assert.equal(result.logged.length, 1);
});

test("switching theme replaces the previous class", () => {
  const root = new Set(["ax-dark-app", "other"]);
  const list = {
    remove: (...names: string[]) => names.forEach((name) => root.delete(name)),
    add: (name: string) => root.add(name),
  } as unknown as DOMTokenList;
  applyThemeClass(list, "ax-light-app");
  assert.deepEqual([...root].sort(), ["ax-light-app", "other"]);
  applyThemeClass(list, null);
  assert.deepEqual([...root], ["other"]);
});
