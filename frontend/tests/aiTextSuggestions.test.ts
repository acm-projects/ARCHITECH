import assert from "node:assert/strict";
import test from "node:test";

import { runArchitectChat, validateChatRequest, type ChatEvent, type ChatModel, type ModelEvent } from "../src/lib/ai/architectChat.ts";
import { applyChanges } from "../src/lib/ai/changes.ts";
import { suggestionsFromText } from "../src/lib/ai/textSuggestions.ts";
import type { GraphDocument } from "../src/lib/projects/projectPayload.ts";

// Archie names a fix in words without sending it as a change: it is built from the design and
// offered to apply, so "add a load balancer" actually adds a load balancer.

const node = (id: string, type: string, label: string, extra: Record<string, unknown> = {}) => ({
  id, type: "architecture" as const, position: { x: 0, y: 0 }, data: { type, label, ...extra },
});
const graph = (): GraphDocument =>
  ({
    schemaVersion: 1,
    nodes: [
      node("client-1", "client", "Client"),
      node("server-1", "server", "API Server", { implementation: "nodejs-express" }),
      node("database-1", "database", "Database"),
    ],
    edges: [
      { id: "e1", source: "client-1", target: "server-1" },
      { id: "e2", source: "server-1", target: "database-1" },
    ],
  }) as GraphDocument;

function textModel(text: string, extra: ModelEvent[] = []): ChatModel {
  return async function* () {
    yield { type: "text", text };
    for (const event of extra) yield event;
  };
}
async function collect(stream: AsyncIterable<ChatEvent>) {
  const events: ChatEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}
const request = () => {
  const parsed = validateChatRequest({ graph: graph(), messages: [{ role: "user", content: "How do I make this reliable?" }] });
  assert.ok(parsed.ok);
  return parsed.value;
};

test("a load balancer named in words is added for real, with a second server behind it", () => {
  const [suggestion] = suggestionsFromText("Put a load balancer in front of the API server.", graph());
  assert.ok(suggestion);
  const applied = applyChanges(graph(), suggestion.changes);
  assert.ok(applied.ok, applied.ok ? "" : applied.error);
  const types = applied.nodes.map((n) => n.data.type).sort();
  assert.deepEqual(types, ["client", "database", "load-balancer", "server", "server"]);
  const balancer = applied.nodes.find((n) => n.data.type === "load-balancer")!;
  const second = applied.nodes.find((n) => n.data.type === "server" && n.id !== "server-1")!;
  const has = (from: string, to: string) => applied.edges.some((e) => e.source === from && e.target === to);
  assert.ok(has("client-1", balancer.id), "the client now goes through the load balancer");
  assert.ok(!has("client-1", "server-1"), "and no longer straight to the server");
  assert.ok(has(balancer.id, "server-1") && has(balancer.id, second.id), "the balancer feeds both servers");
  assert.ok(has(second.id, "database-1"), "the second server does the same work");
  assert.equal(second.data.implementation, "nodejs-express");
});

test("each fix named is offered in the order named, and nothing is offered twice", () => {
  const titles = suggestionsFromText(
    "Add a cache, a read replica for the database, and a load balancer with a second server.",
    graph(),
  ).map((s) => s.title);
  assert.deepEqual(titles, [
    "Put a cache in front of Database",
    "Add a read replica of Database",
    "Load-balance API Server across two servers",
  ]);
  assert.deepEqual(suggestionsFromText("This design looks fine as it is.", graph()), []);
});

test("Archie's answer without a tool call still ends with changes to apply", async () => {
  const model = textModel("Database is a single point of failure: add a read replica, and put a load balancer in front of two API servers.");
  const events = await collect(runArchitectChat({ request: request(), level: "Beginner", model }));
  const suggestions = events.filter((e): e is Extract<ChatEvent, { type: "suggestion" }> => e.type === "suggestion");
  assert.deepEqual(suggestions.map((s) => s.title), ["Add a read replica of Database", "Load-balance API Server across two servers"]);
  assert.ok(suggestions.every((s) => s.preview.after.monthlyCost > s.preview.before.monthlyCost), "each adds cost, previewed");
  assert.equal(events.at(-1)?.type, "done");
});

test("a tool suggestion wins: the words are not turned into more changes", async () => {
  const tool = { title: "Add a cache", reason: "Reads.", changes: [{ op: "add_component", ref: "new-cache", type: "cache" }, { op: "connect", from: "server-1", to: "new-cache" }] };
  const model = textModel("Add a cache and a load balancer.", [{ type: "tool", name: "propose_changes", input: tool }]);
  const events = await collect(runArchitectChat({ request: request(), level: "Beginner", model }));
  assert.deepEqual(events.filter((e) => e.type === "suggestion").map((e) => (e as { id: string }).id), ["s1"]);
});

test("asked how to fix it, Archie always ends with a change to apply, even when its words name none", async () => {
  const parsed = validateChatRequest({ graph: graph(), messages: [{ role: "user", content: "how to fix it?" }] });
  assert.ok(parsed.ok);
  const model = textModel("The API server is doing all the work alone.");
  const events = await collect(runArchitectChat({ request: parsed.value, level: "Beginner", model }));
  const suggestions = events.filter((e): e is Extract<ChatEvent, { type: "suggestion" }> => e.type === "suggestion");
  assert.equal(suggestions.length, 1);
  const applied = applyChanges(graph(), suggestions[0].changes);
  assert.ok(applied.ok);
  assert.ok(applied.nodes.length > graph().nodes.length, "applying adds components");
  assert.ok(applied.edges.length > graph().edges.length, "and connects them");
});

test("a question that asks for no change gets no made-up change", async () => {
  const parsed = validateChatRequest({ graph: graph(), messages: [{ role: "user", content: "What does the client do?" }] });
  assert.ok(parsed.ok);
  const events = await collect(runArchitectChat({ request: parsed.value, level: "Beginner", model: textModel("It sends requests to the API server.") }));
  assert.equal(events.filter((e) => e.type === "suggestion").length, 0);
});
