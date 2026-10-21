import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SAVED_TURNS, buildChatHistory, validateConversation } from "../src/lib/ai/conversation.ts";

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

test("chat history omits cancelled or failed exchanges while retaining successful context", () => {
  const messages = buildChatHistory(
    [
      { role: "user", text: "What is an API server?" },
      { role: "assistant", text: "A server that handles API requests.", done: true },
      { role: "user", text: "What does my database connect to?" },
      { role: "assistant", text: "Partial answer", done: true, notes: ["Stopped."] },
      { role: "user", text: "What is a cache?" },
      { role: "assistant", text: "", done: true, error: "The provider is busy." },
      { role: "user", text: "Previous question that never finished" },
      { role: "assistant", text: "", done: false },
    ],
    "What is a database?",
  );

  assert.deepEqual(messages, [
    { role: "user", content: "What is an API server?" },
    { role: "assistant", content: "A server that handles API requests." },
    { role: "user", content: "What is a database?" },
  ]);
});

test("chat history sends no more than four messages including the latest question", () => {
  const messages = buildChatHistory(
    [
      { role: "user", text: "First question" },
      { role: "assistant", text: "First answer", done: true },
      { role: "user", text: "Second question" },
      { role: "assistant", text: "Second answer", done: true },
      { role: "user", text: "Third question" },
      { role: "assistant", text: "Third answer", done: true },
    ],
    "Latest question",
  );

  assert.ok(messages.length <= 4);
  assert.deepEqual(messages[messages.length - 1], { role: "user", content: "Latest question" });
  assert.equal(messages[0].role, "user");
});
