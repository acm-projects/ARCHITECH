import assert from "node:assert/strict";
import test from "node:test";

import { challengeDefinition } from "../src/lib/architecture/challenge/catalog.ts";
import { evaluateChallenge } from "../src/lib/architecture/challenge/evaluate.ts";
import { bestPerUser, displayName, gradeSubmission, rankBest } from "../src/lib/architecture/challenge/submissions.ts";

const node = (id: string, type: string, properties?: Record<string, number>) => ({
  id, type: "architecture", position: { x: 0, y: 0 }, data: { type, label: id, ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });

test("the server grades exactly like the app", () => {
  const challenge = challengeDefinition("url-shortener")!;
  assert.ok(challenge);
  assert.equal(challengeDefinition("nope"), null);
  assert.equal(challengeDefinition("__proto__"), null);
  const graph = {
    nodes: [node("client-1", "client"), node("lb-1", "load-balancer"), node("s-1", "server", { replicas: 6 }), node("c-1", "cache"), node("db-1", "database")],
    edges: [edge("client-1", "lb-1"), edge("lb-1", "s-1"), edge("s-1", "c-1"), edge("c-1", "db-1")],
  };
  const graded = gradeSubmission(challenge, graph);
  const local = evaluateChallenge({ challenge, graph: graph as never });
  assert.equal(graded.score, local.score.score);
  assert.equal(graded.passed, local.score.passed);
  assert.equal(graded.metrics.components, 5);
  assert.deepEqual(graded.failedRequirements, local.requirementResults.filter((r) => !r.passed).map((r) => r.requirementId));
});

test("leaderboard: best per user, ranked by score, ties to the earliest; names shortened", () => {
  const metrics = { p95LatencyMs: 40, monthlyCost: 300, capacityRps: 1000, uptimePercent: 99.9, components: 4 };
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 19, 12, minute));
  const submissions = [
    { userId: "a", name: "Ada Lovelace", score: 70, passed: true, metrics, createdAt: at(0) },
    { userId: "a", name: "Ada Lovelace", score: 85, passed: true, metrics, createdAt: at(5) },
    { userId: "b", name: "Bo", score: 85, passed: true, metrics, createdAt: at(3) },
    { userId: "c", name: null, score: 40, passed: false, metrics, createdAt: at(1) },
    { userId: "b", name: "Bo", score: 85, passed: true, metrics, createdAt: at(9) },
  ];
  const best = bestPerUser(submissions);
  assert.equal(best.length, 3);
  const ranking = rankBest(best, "a", 2);
  assert.deepEqual(ranking.top.map((e) => [e.rank, e.name, e.score, e.you]), [[1, "Bo", 85, false], [2, "Ada L.", 85, true]]);
  assert.equal(ranking.participants, 3);
  assert.equal(rankBest(best, "c", 2).me?.rank, 3, "the user's own rank even outside the top");
  assert.equal(displayName("  shivam   kumar singh "), "shivam S.");
  assert.equal(displayName(""), "Anonymous");
});
