import assert from "node:assert/strict";
import test from "node:test";

import { isProjectSaved, waitForProjectSaved } from "../src/components/projects/projectSaved.ts";
import type { Project } from "../src/components/projects/projectStore.ts";
import { projectToPayload } from "../src/lib/projects/projectPayload.ts";
import { fingerprint } from "../src/lib/projects/syncPlan.ts";

const at = "2026-11-17T00:00:00.000Z";
const project = (title = "Notes app"): Project => ({
  id: "p1",
  title,
  nodes: [{ id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Client" } }],
  edges: [],
  mode: "learn",
  createdAt: at,
  updatedAt: at,
  lastOpenedAt: at,
});
const printOf = (value: Project) => fingerprint(projectToPayload(value));

test("a project is saved when the server has exactly the browser's version", () => {
  const local = project();
  assert.equal(isProjectSaved(local, { p1: printOf(local) }), true);
  assert.equal(isProjectSaved(local, { p1: printOf(project("Older title")) }), false);
  assert.equal(isProjectSaved(local, {}), false);
  assert.equal(isProjectSaved(null, { p1: printOf(local) }), false);
  assert.equal(isProjectSaved(local, undefined), false);
});

test("Run as app waits for the upload, and gives up after its time", async () => {
  const local = project();
  let clock = 0;
  let synced: Record<string, string> = {};
  const sleep = async (ms: number) => {
    clock += ms;
    // The upload lands after a moment.
    if (clock >= 600) synced = { p1: printOf(local) };
  };
  assert.equal(await waitForProjectSaved(() => ({ project: local, synced }), { sleep, now: () => clock }), true);
  assert.ok(clock >= 600 && clock < 1_000);

  clock = 0;
  const never = async (ms: number) => void (clock += ms);
  assert.equal(await waitForProjectSaved(() => ({ project: local, synced: {} }), { sleep: never, now: () => clock, timeoutMs: 2_000 }), false);
  assert.ok(clock >= 2_000);
});
