import assert from "node:assert/strict";
import test from "node:test";

import { conflictCopy, CONFLICT_SUFFIX, fingerprint, needsConflictCopy } from "../src/lib/projects/syncPlan.ts";
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

test("the other device's version is kept as a copy with a new id and a marked title", () => {
  const copy = conflictCopy(project("Shop"), "22222222-2222-4222-8222-222222222222", 80);
  assert.equal(copy.id, "22222222-2222-4222-8222-222222222222");
  assert.equal(copy.title, `Shop${CONFLICT_SUFFIX}`);
  assert.deepEqual({ ...copy, id: "", title: "" }, { ...project("Shop"), id: "", title: "" }, "everything else is the server's copy");

  const long = conflictCopy(project("x".repeat(80)), "id", 80);
  assert.ok(long.title.length <= 80, "stays within the title limit");
  assert.ok(long.title.endsWith(CONFLICT_SUFFIX));
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

test("save retries and opening another tab do not create extra projects", () => {
  const saved = project("Shop");
  const pending = { ...saved, title: "Shop with cache" };
  assert.equal(needsConflictCopy(pending, pending, fingerprint(saved)), false, "a lost save response is retried in place");
  const openedElsewhere = { ...saved, lastOpenedAt: "2026-10-20T10:00:00.000Z" };
  assert.equal(needsConflictCopy(openedElsewhere, pending, fingerprint(saved)), false, "opening a tab is not a competing edit");
  assert.equal(needsConflictCopy({ ...pending, updatedAt: "2026-10-20T10:00:00.000Z" }, pending), false);
  assert.equal(needsConflictCopy(project("Other device edit"), pending, fingerprint(saved)), true, "divergent work is still preserved");
  assert.equal(needsConflictCopy(project("Other device edit"), pending, "invalid"), true);
});
