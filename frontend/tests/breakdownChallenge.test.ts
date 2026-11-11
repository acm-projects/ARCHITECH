import assert from "node:assert/strict";
import test from "node:test";

import { breakdownDraftKey, readBreakdownDraft, writeBreakdownDraft } from "../src/components/breakdowns/breakdownDraft.ts";
import { breakdownMode, breakdownModeQuery } from "../src/components/breakdowns/breakdownMode.ts";
import { netflixStreamingChallenge } from "../src/components/challenge/challenges.ts";
import { challengeDefinition } from "../src/lib/architecture/challenge/catalog.ts";
import { validateChallengeDefinition } from "../src/lib/architecture/challenge/evaluate.ts";
import { gradeSubmission } from "../src/lib/architecture/challenge/submissions.ts";

const node = (id: string, type: string, properties?: Record<string, number>) => ({
  id, type: "architecture", position: { x: 0, y: 0 }, data: { type, label: id, ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

test("the Netflix challenge is graded by the server and is well formed", () => {
  const definition = challengeDefinition(netflixStreamingChallenge.id);
  assert.equal(definition, netflixStreamingChallenge.definition);
  assert.deepEqual(validateChallengeDefinition(netflixStreamingChallenge.definition), []);
});

test("the Netflix challenge rewards delivering video from the edge", () => {
  const challenge = netflixStreamingChallenge.definition;
  const direct = gradeSubmission(challenge, {
    nodes: [node("viewer", "client"), node("api", "server"), node("db", "database")],
    edges: [edge("viewer", "api"), edge("api", "db")],
  });
  const edgeOnly = gradeSubmission(challenge, {
    nodes: [node("viewer", "client"), node("cdn", "cdn"), node("video", "object-storage"), node("api", "server"), node("db", "database")],
    edges: [edge("viewer", "cdn"), edge("cdn", "video"), edge("viewer", "api"), edge("api", "db")],
  });
  const streaming = gradeSubmission(challenge, {
    nodes: [
      node("viewer", "client"), node("cdn", "cdn"), node("video", "object-storage"), node("gateway", "api-gateway"),
      node("api", "server", { replicas: 4 }), node("cache", "cache"), node("db", "database"), node("encoder", "worker"),
    ],
    edges: [
      edge("viewer", "cdn"), edge("cdn", "video"), edge("viewer", "gateway"), edge("gateway", "api"),
      edge("api", "cache"), edge("cache", "db"), edge("encoder", "video"),
    ],
  });
  assert.equal(direct.passed, false);
  assert.ok(direct.failedRequirements.includes("edge-delivery"));
  assert.equal(edgeOnly.passed, false, "a single API server cannot carry the API share");
  assert.ok(direct.score < edgeOnly.score && edgeOnly.score < streaming.score);
  assert.equal(streaming.passed, true);
  assert.deepEqual(streaming.failedRequirements, []);
});

test("a breakdown's challenge design round-trips through storage without canvas state", () => {
  const storage = memoryStorage();
  const nodes = [{ ...node("viewer", "client"), selected: true, measured: { width: 192, height: 56 } }, node("cdn", "cdn")];
  const edges = [edge("viewer", "cdn"), edge("viewer", "missing")];
  assert.equal(writeBreakdownDraft(storage, "netflix-streaming", nodes, edges), true);
  const draft = readBreakdownDraft(storage, "netflix-streaming");
  assert.deepEqual(draft.nodes.map((n) => n.id), ["viewer", "cdn"]);
  assert.equal("selected" in draft.nodes[0], false);
  assert.deepEqual(draft.edges.map((e) => e.id), ["viewer->cdn"], "a connection to a missing component is dropped");
  // Clearing the canvas forgets the design.
  assert.equal(writeBreakdownDraft(storage, "netflix-streaming", [], []), true);
  assert.equal(storage.items.has(breakdownDraftKey("netflix-streaming")), false);
});

test("an unreadable or blocked draft starts empty and a refused write is reported", () => {
  const storage = memoryStorage();
  storage.setItem(breakdownDraftKey("netflix-streaming"), "{not json");
  assert.deepEqual(readBreakdownDraft(storage, "netflix-streaming"), { nodes: [], edges: [] });
  storage.setItem(breakdownDraftKey("netflix-streaming"), JSON.stringify({ nodes: [{ id: "x", position: {}, data: {} }] }));
  assert.deepEqual(readBreakdownDraft(storage, "netflix-streaming"), { nodes: [], edges: [] });
  assert.deepEqual(readBreakdownDraft(null, "netflix-streaming"), { nodes: [], edges: [] });
  const full = { ...storage, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(writeBreakdownDraft(full, "netflix-streaming", [node("viewer", "client")], []), false);
  assert.equal(writeBreakdownDraft(null, "netflix-streaming", [node("viewer", "client")], []), false);
});

test("the breakdown mode lives in the URL beside the walkthrough step", () => {
  assert.equal(breakdownMode(null), "learn");
  assert.equal(breakdownMode("challenge"), "challenge");
  assert.equal(breakdownMode("anything"), "learn");
  assert.equal(breakdownModeQuery("?step=cdn&built=assets", "challenge"), "?step=cdn&built=assets&mode=challenge");
  assert.equal(breakdownModeQuery("?step=cdn&mode=challenge", "learn"), "?step=cdn");
  assert.equal(breakdownModeQuery("?mode=challenge", "learn"), "");
});
