import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { STORAGE_KEY, createProjectStore, type StorageLike } from "../src/components/projects/projectStore.ts";
import { DEMO_PROJECT, PENDING_DEMO_KEY, requestDemoAfterSignUp, takePendingDemo } from "../src/lib/demoProject.ts";

const read = (path: string) => readFileSync(path, "utf8");

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function makeStore() {
  const storage: StorageLike = memory();
  let id = 0;
  return createProjectStore({ getStorage: () => storage, newId: () => `p${++id}` });
}

test("the demo waits for an account, then opens once", () => {
  const store = memory();
  assert.equal(takePendingDemo(store), false);
  assert.equal(requestDemoAfterSignUp(store), true);
  assert.equal(store.data.get(PENDING_DEMO_KEY), "1");
  assert.equal(takePendingDemo(store), true);
  assert.equal(takePendingDemo(store), false);
  assert.equal(requestDemoAfterSignUp(null), false);
});

test("the demo opens without the tutorial, and the next project still teaches", () => {
  const store = makeStore();
  const demo = store.createProject(DEMO_PROJECT);
  assert.equal(demo.mode, "learn");
  assert.equal(demo.learnSkipped, true);
  const first = store.createProject({ mode: "learn" });
  assert.equal(first.learnSkipped, undefined, "the demo does not count as having seen the tutorial");
  void STORAGE_KEY;
});

test("the landing page demo goes through sign-up, and the dashboard opens it", () => {
  const entry = read("src/components/auth/EntryFlow.tsx");
  assert.match(entry, /requestDemoAfterSignUp\(\);\s*go\("sign-up"\);/);
  assert.doesNotMatch(entry, /startProject\(/);
  assert.match(read("app/dashboard/page.tsx"), /<PendingDemo \/>/);
  assert.match(read("src/components/dashboard/PendingDemo.tsx"), /startProject\(DEMO_PROJECT\)/);
});

test("the demo opens on the starter design, so there is something to explore", () => {
  const demo = makeStore().createProject(DEMO_PROJECT);
  assert.deepEqual(demo.nodes.map((node) => node.data.type), ["client", "server", "database"]);
  assert.equal(demo.edges.length, 2);
});
