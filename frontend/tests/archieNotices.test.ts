import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_NAMED_EDITS,
  buildNotice,
  graphEdits,
  metricMoves,
  noticeHeadline,
  type NoticeSnapshot,
} from "../src/lib/architecture/archie/notices.ts";

const read = (path: string) => readFileSync(path, "utf8");

const base = (): NoticeSnapshot => ({
  graph: {
    nodes: [
      { id: "client-1", label: "Client", type: "client" },
      { id: "server-1", label: "API Server", type: "server" },
      { id: "database-1", label: "Database", type: "database" },
    ],
    edges: [
      { source: "client-1", target: "server-1" },
      { source: "server-1", target: "database-1" },
    ],
  },
  summary: { score: 80, capacityRps: 2_000, p95LatencyMs: 70, monthlyCost: 190, uptimePercent: 99.85 },
  findings: [
    { id: "spof-server-1", title: "API Server is a single point of failure", severity: "high" },
    { id: "replica-database-1", title: "Database has no configured replica", severity: "medium" },
  ],
});

test("the first look at a design lists every open problem, most serious first", () => {
  const notice = buildNotice(null, base());
  assert.ok(notice);
  assert.equal(notice.kind, "check");
  assert.deepEqual(notice.open.map((finding) => finding.severity), ["high", "medium"]);
  assert.equal(noticeHeadline(notice), "Design check: 2 problems to look at.");
});

test("an edit says what changed, which numbers moved and which problems it resolved", () => {
  const before = base();
  const after = base();
  after.graph = {
    nodes: [
      ...before.graph.nodes.map((node) => (node.id === "database-1" ? { ...node, properties: { replicas: 1 } } : node)),
      { id: "cache-1", label: "Cache", type: "cache" },
    ],
    edges: [...before.graph.edges, { source: "server-1", target: "cache-1" }],
  };
  after.summary = { ...before.summary, score: 86, monthlyCost: 280, uptimePercent: 99.89 };
  after.findings = before.findings.filter((finding) => finding.id !== "replica-database-1");
  const notice = buildNotice(before, after);
  assert.ok(notice);
  assert.equal(notice.kind, "change");
  assert.deepEqual(notice.edits, ["Changed Database's settings", "Added Cache", "Connected API Server → Cache"]);
  assert.deepEqual(notice.metrics.map((metric) => [metric.label, metric.better]), [["Score", true], ["Availability", true], ["Monthly cost", false]]);
  assert.deepEqual(notice.resolved.map((finding) => finding.id), ["replica-database-1"]);
  assert.deepEqual(notice.added, []);
  assert.equal(noticeHeadline(notice), "Changed Database's settings: 1 resolved.");
});

test("a re-evaluation of the same design posts nothing", () => {
  assert.equal(buildNotice(base(), base()), null);
});

test("removing a component does not also list its connections; long edits are counted", () => {
  const before = base();
  const after = base();
  after.graph = { nodes: before.graph.nodes.filter((node) => node.id !== "database-1"), edges: before.graph.edges.slice(0, 1) };
  assert.deepEqual(graphEdits(before.graph, after.graph), ["Removed Database"]);
  const many = { nodes: [...before.graph.nodes, ...[1, 2, 3, 4].map((n) => ({ id: `w${n}`, label: `Worker ${n}`, type: "worker" }))], edges: before.graph.edges };
  const edits = graphEdits(before.graph, many);
  assert.equal(edits.length, MAX_NAMED_EDITS + 1);
  assert.equal(edits.at(-1), "and 1 more");
});

test("new problems lead the headline, and capacity growing to no limit counts as better", () => {
  const before = base();
  const after = base();
  after.findings = [...before.findings, { id: "saturated-server-1", title: "API Server is saturated", severity: "high" }];
  const notice = buildNotice(before, after);
  assert.ok(notice);
  assert.equal(noticeHeadline(notice), "1 problem found.");
  const moves = metricMoves(before.summary, { ...before.summary, capacityRps: null });
  assert.deepEqual(moves, [{ label: "Capacity", before: "2,000 req/s", after: "no limit", better: true }]);
});

test("Archie's conversation carries the notices and the bar counts unread ones", () => {
  const workspace = read("src/components/workspace/ArchitectureWorkspace.tsx");
  const panel = read("src/components/workspace/ai/ArchitectPanel.tsx");
  assert.match(workspace, /useArchieNotices\(/);
  assert.match(workspace, /badge: String\(archieNotices\.unread\)/);
  assert.match(panel, /<NoticeMessage/);
  // Notices and answers read in the order they happened.
  assert.match(panel, /\.sort\(\(a, b\) => a\.at - b\.at\)/);
});
