import assert from "node:assert/strict";
import test from "node:test";

import { sameDesign } from "../src/lib/projects/syncPlan.ts";
import { etag, ifMatchRevision, revisionOf } from "../src/lib/projects/revisions.ts";
import type { ProjectPayload } from "../src/lib/projects/projectPayload.ts";

const project = (title: string): ProjectPayload => ({
  id: "11111111-1111-4111-8111-111111111111",
  title,
  mode: "learn",
  learnSkipped: false,
  graph: { schemaVersion: 1, nodes: [], edges: [] },
  createdAt: "2026-10-19T12:00:00.000Z",
  updatedAt: "2026-10-19T12:05:00.000Z",
  lastOpenedAt: "2026-10-19T12:05:00.000Z",
});

test("a conflict between identical copies is not a real conflict", () => {
  const a = project("Shop");
  const reopened = { ...project("Shop"), lastOpenedAt: "2026-10-20T09:00:00.000Z", updatedAt: "2026-10-20T09:00:00.000Z" };
  assert.equal(sameDesign(a, reopened), true, "timestamps do not matter");
  assert.equal(sameDesign(a, project("Shop v2")), false, "the title does");
  const changed = { ...project("Shop"), graph: { ...a.graph, nodes: [{ id: "server-1" }] } } as ProjectPayload;
  assert.equal(sameDesign(a, changed), false, "the diagram does");
});

test("revisions travel as ETags and come back in If-Match", () => {
  const revision = revisionOf({ syncedAt: new Date(1_760_000_000_123) });
  assert.equal(revision, "1760000000123");
  assert.equal(etag(revision), '"1760000000123"');
  assert.equal(ifMatchRevision('"1760000000123"'), revision);
  assert.equal(ifMatchRevision('W/"1760000000123"'), revision);
  assert.equal(ifMatchRevision("1760000000123"), revision);
  assert.equal(ifMatchRevision("*"), null);
  assert.equal(ifMatchRevision(null), null);
  assert.equal(ifMatchRevision('"abc"'), null);
});
