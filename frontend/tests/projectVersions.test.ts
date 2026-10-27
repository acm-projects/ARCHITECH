import assert from "node:assert/strict";
import test from "node:test";

import { relativeTime, versionName } from "../src/lib/projects/historyClient.ts";
import { AUTO_INTERVAL_MS, shouldSnapshot, summarizeGraph, validateLabel, versionsToPrune } from "../src/lib/projects/versions.ts";

const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type: "architecture" as const, position: { x: 0, y: 0 }, data: { type, label: id, ...extra } });
const graph = (replicas = 1) =>
  ({
    schemaVersion: 1,
    nodes: [node("client-1", "client"), node("server-1", "server", { properties: { replicas } }), node("database-1", "database")],
    edges: [
      { id: "a", source: "client-1", target: "server-1" },
      { id: "b", source: "server-1", target: "database-1" },
    ],
  }) as never;

test("a version records the engine's numbers and a fingerprint of what was evaluated", () => {
  const { fingerprint, summary } = summarizeGraph(graph());
  assert.equal(summary.ready, true);
  assert.equal(summary.components, 3);
  assert.ok(summary.score > 0 && summary.monthlyCost > 0);
  const moved = graph() as unknown as { nodes: { position: { x: number } ; data: { label: string } }[] };
  moved.nodes[1].position.x = 500;
  moved.nodes[1].data.label = "Renamed";
  assert.equal(summarizeGraph(moved as never).fingerprint, fingerprint, "moving and renaming is the same design");
  assert.notEqual(summarizeGraph(graph(3)).fingerprint, fingerprint);
});

test("automatic versions: the first save, then only real changes, at most every 10 minutes", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  assert.equal(shouldSnapshot(null, "a", now), true);
  const latest = { fingerprint: "a", createdAt: new Date(now.getTime() - AUTO_INTERVAL_MS) };
  assert.equal(shouldSnapshot(latest, "a", now), false, "unchanged design");
  assert.equal(shouldSnapshot(latest, "b", now), true, "changed, 10 minutes later");
  assert.equal(shouldSnapshot({ fingerprint: "a", createdAt: new Date(now.getTime() - 60_000) }, "b", now), false, "changed, but too soon");
});

test("old versions are pruned: automatic ones first", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 19, 12, minute));
  const versions = [
    { id: "m1", kind: "manual", createdAt: at(0) },
    { id: "a1", kind: "auto", createdAt: at(1) },
    { id: "a2", kind: "auto", createdAt: at(2) },
    { id: "r1", kind: "before-restore", createdAt: at(3) },
  ];
  assert.deepEqual(versionsToPrune(versions, 4), []);
  assert.deepEqual(versionsToPrune(versions, 2), ["a1", "a2"]);
  assert.deepEqual(versionsToPrune(versions, 1), ["a1", "a2", "m1"]);
});

test("labels and display names", () => {
  assert.deepEqual(validateLabel(undefined), { ok: true, value: null });
  assert.deepEqual(validateLabel("  v2 with cache "), { ok: true, value: "v2 with cache" });
  assert.deepEqual(validateLabel("   "), { ok: true, value: null });
  assert.equal(validateLabel(5).ok, false);
  assert.equal(validateLabel("x".repeat(81)).ok, false);
  assert.equal(versionName({ kind: "auto", label: null }), "Auto-saved");
  assert.equal(versionName({ kind: "manual", label: "Before the demo" }), "Before the demo");
  const now = Date.parse("2026-10-19T12:00:00Z");
  assert.equal(relativeTime("2026-10-19T11:59:30Z", now), "just now");
  assert.equal(relativeTime("2026-10-19T11:55:00Z", now), "5 min ago");
  assert.equal(relativeTime("2026-10-19T09:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("2026-10-18T12:00:00Z", now), "1 day ago");
});
