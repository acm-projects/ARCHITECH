import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SAVED_TURNS, validateConversation } from "../src/lib/ai/conversation.ts";

const snapshot = { score: 70, p95LatencyMs: 40, monthlyCost: 300, capacityRps: 2000, uptimePercent: 99.9 };
const suggestion = {
  type: "suggestion",
  id: "s1",
  title: "Add a cache",
  reason: "Fewer reads hit the database.",
  changes: [{ op: "add_component", ref: "new-cache", type: "cache" }],
  preview: { before: snapshot, after: { ...snapshot, score: 78 } },
};

test("a conversation is validated before it is saved", () => {
  const ok = validateConversation({
    turns: [
      { role: "user", text: "What breaks first?", focusCount: 2 },
      { role: "assistant", text: "The database.", suggestions: [suggestion], notes: [], applied: { s1: "applied" } },
      { role: "user", text: "Thanks" },
    ],
  });
  assert.ok(ok.ok);
  assert.equal(ok.value.length, 3);
  assert.deepEqual(ok.value[2], { role: "user", text: "Thanks", focusCount: 0 }, "defaults are filled in");

  for (const [body, message] of [
    [{}, /\{ turns/],
    [{ turns: [{ role: "system", text: "x" }] }, /role must be/],
    [{ turns: [{ role: "user", text: "  " }] }, /non-empty/],
    [{ turns: [{ role: "assistant", text: "x", suggestions: [{ ...suggestion, preview: {} }] }] }, /suggestions/],
    [{ turns: [{ role: "assistant", text: "x", applied: { s1: 5 } }] }, /applied/],
    [{ turns: Array.from({ length: MAX_SAVED_TURNS + 1 }, () => ({ role: "user", text: "q" })) }, /at most/],
    [{ turns: [{ role: "user", text: "x".repeat(20_001) }] }, /non-empty text/],
  ] as const) {
    const result = validateConversation(body);
    assert.ok(!result.ok, JSON.stringify(body).slice(0, 80));
    assert.match(result.error, message);
  }
});
