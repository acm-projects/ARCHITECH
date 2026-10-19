import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GROQ_MODEL, groqModelFromEnv, groqModelName, readCompletionStream } from "../src/lib/ai/groqModel.ts";
import { chatModelFromEnv } from "../src/lib/ai/model.ts";
import { PROPOSE_CHANGES_TOOL } from "../src/lib/ai/architectPrompt.ts";

function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}
const data = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

test("Groq stream: text deltas, tool arguments split across chunks and lines, ends at [DONE]", async () => {
  const body = [
    data({ choices: [{ delta: { role: "assistant", content: "" } }] }),
    data({ choices: [{ delta: { content: "Add a " } }] }),
    data({ choices: [{ delta: { content: "cache." } }] }),
    data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "propose_changes", arguments: '{"title":"Ca' } }] } }] }),
    data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'che","changes":[]}' } }] } }] }),
    "data: [DONE]\n\n",
  ].join("");
  // Split mid-line to prove buffering works.
  const events = await collect(readCompletionStream(sse([body.slice(0, 37), body.slice(37, 200), body.slice(200)])));
  assert.deepEqual(events, [
    { type: "text", text: "Add a " },
    { type: "text", text: "cache." },
    { type: "tool", name: "propose_changes", input: { title: "Cache", changes: [] } },
  ]);
});

test("Groq stream: malformed tool JSON becomes input null (later rejected as an invalid suggestion)", async () => {
  const events = await collect(
    readCompletionStream(sse([data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "propose_changes", arguments: "{bad" } }] } }] }), "data: [DONE]\n"])),
  );
  assert.deepEqual(events, [{ type: "tool", name: "propose_changes", input: null }]);
});

test("Groq stream: an error chunk throws", async () => {
  await assert.rejects(collect(readCompletionStream(sse([data({ error: { message: "rate limited" } })]))), /rate limited/);
});

test("Groq config: needs a key, default model, sends OpenAI-format tools with bearer auth", async () => {
  assert.equal(groqModelFromEnv({}), null);
  assert.equal(groqModelName({}), DEFAULT_GROQ_MODEL);
  assert.equal(groqModelName({ GROQ_MODEL: "qwen/qwen3.8-27b" }), "qwen/qwen3.8-27b");

  let seen: { url: string; init: RequestInit } | null = null;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(sse([data({ choices: [{ delta: { content: "hi" } }] }), "data: [DONE]\n"]), { status: 200 });
  }) as unknown as typeof fetch;
  const model = groqModelFromEnv({ GROQ_API_KEY: "gk", GROQ_BASE_URL: "http://fake/v1/" }, fakeFetch);
  assert.ok(model);
  const events = await collect(
    model({ system: "SYS", messages: [{ role: "user", content: "q" }], tools: [PROPOSE_CHANGES_TOOL], maxTokens: 100 }),
  );
  assert.deepEqual(events, [{ type: "text", text: "hi" }]);
  assert.ok(seen);
  const { url, init } = seen as { url: string; init: RequestInit };
  assert.equal(url, "http://fake/v1/chat/completions");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer gk");
  const sent = JSON.parse(String(init.body));
  assert.equal(sent.model, DEFAULT_GROQ_MODEL);
  assert.equal(sent.stream, true);
  assert.equal(sent.max_completion_tokens, 100);
  assert.equal(sent.reasoning_effort, "low", "gpt-oss keeps its reasoning short");
  assert.deepEqual(sent.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "q" }]);
  assert.deepEqual(sent.tools, [
    { type: "function", function: { name: "propose_changes", description: PROPOSE_CHANGES_TOOL.description, parameters: PROPOSE_CHANGES_TOOL.input_schema } },
  ]);
});

test("Groq config: models other than gpt-oss get no reasoning setting", async () => {
  let body: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(sse(["data: [DONE]\n"]), { status: 200 });
  }) as unknown as typeof fetch;
  const model = groqModelFromEnv({ GROQ_API_KEY: "gk", GROQ_MODEL: "qwen/qwen3.8-27b" }, fakeFetch)!;
  await collect(model({ system: "s", messages: [{ role: "user", content: "q" }], tools: [], maxTokens: 10 }));
  assert.equal(body.model, "qwen/qwen3.8-27b");
  assert.ok(!("reasoning_effort" in body));
});

test("Groq config: an HTTP error surfaces status and message", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })) as unknown as typeof fetch;
  const model = groqModelFromEnv({ GROQ_API_KEY: "bad" }, fakeFetch)!;
  await assert.rejects(
    collect(model({ system: "s", messages: [{ role: "user", content: "q" }], tools: [], maxTokens: 10 })),
    /Groq request failed \(401\): Invalid API Key/,
  );
});

test("provider choice: explicit AI_PROVIDER, otherwise Anthropic then Groq, otherwise off", () => {
  assert.equal(chatModelFromEnv({}), null);
  assert.equal(chatModelFromEnv({ GROQ_API_KEY: "g" })?.name, `groq:${DEFAULT_GROQ_MODEL}`);
  assert.equal(chatModelFromEnv({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" })?.provider, "anthropic");
  assert.equal(chatModelFromEnv({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", AI_PROVIDER: "groq" })?.provider, "groq");
  assert.equal(chatModelFromEnv({ ANTHROPIC_API_KEY: "a", AI_PROVIDER: "groq" }), null);
  assert.equal(chatModelFromEnv({ GROQ_API_KEY: "g", GROQ_MODEL: "qwen/qwen3.8-27b" })?.name, "groq:qwen/qwen3.8-27b");
});

test("the provider's own rate limit is 'busy' with its wait, not a failure", async () => {
  const { ModelBusyError, retryAfterSeconds } = await import("../src/lib/ai/errors.ts");
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), { status: 429, headers: { "retry-after": "12" } })) as unknown as typeof fetch;
  const model = groqModelFromEnv({ GROQ_API_KEY: "gk" }, fakeFetch)!;
  await assert.rejects(
    collect(model({ system: "s", messages: [{ role: "user", content: "q" }], tools: [], maxTokens: 10 })),
    (error: unknown) => error instanceof ModelBusyError && error.retryAfterSeconds === 12,
  );
  assert.equal(retryAfterSeconds("7"), 7);
  assert.equal(retryAfterSeconds(new Date(Date.UTC(2026, 9, 19, 12, 0, 30)).toUTCString(), Date.UTC(2026, 9, 19, 12, 0, 0)), 30);
  assert.equal(retryAfterSeconds("soon"), null);
  assert.equal(new ModelBusyError(null).retryAfterSeconds, 30, "a default wait when the provider gives none");
  assert.equal(new ModelBusyError(0.2).retryAfterSeconds, 1);
});

test("a malformed tool call is retried, then answered without the tool; streamed text is kept", async () => {
  const failure = () =>
    new Response(JSON.stringify({ error: { message: "Failed to call a function. Please adjust your prompt.", code: "tool_use_failed" } }), { status: 400 });
  const answer = (text: string) => new Response(sse([data({ choices: [{ delta: { content: text } }] }), "data: [DONE]\n"]), { status: 200 });
  const run = async (responses: (() => Response)[]) => {
    const bodies: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return responses[bodies.length - 1]();
    }) as unknown as typeof fetch;
    const model = groqModelFromEnv({ GROQ_API_KEY: "gk" }, fakeFetch)!;
    const events = await collect(model({ system: "SYS", messages: [{ role: "user", content: "q" }], tools: [PROPOSE_CHANGES_TOOL], maxTokens: 10 }));
    return { events, bodies };
  };

  const once = await run([failure, () => answer("Second try.")]);
  assert.deepEqual(once.events, [{ type: "text", text: "Second try." }]);
  assert.equal(once.bodies.length, 2);
  assert.ok(once.bodies[1].tools, "the retry still offers the tool");

  const twice = await run([failure, failure, () => answer("In words: add a replica.")]);
  assert.deepEqual(twice.events, [{ type: "text", text: "In words: add a replica." }]);
  assert.equal(twice.bodies.length, 3);
  assert.ok(!("tools" in twice.bodies[2]), "the last try has no tool");
  assert.match(String((twice.bodies[2].messages as { content: string }[])[0].content), /Tools are unavailable/);

  // Text first, then Groq reports the broken tool call in the stream: keep the text, no error.
  const late = await run([
    () => new Response(sse([data({ choices: [{ delta: { content: "Checkout API is a single point of failure." } }] }), data({ error: { message: "Failed to call a function.", code: "tool_use_failed" } })]), { status: 200 }),
  ]);
  assert.deepEqual(late.events, [{ type: "text", text: "Checkout API is a single point of failure." }]);
  assert.equal(late.bodies.length, 1, "not asked again, so the text is not repeated");

  // Other errors are not retried.
  const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(collect(groqModelFromEnv({ GROQ_API_KEY: "bad" }, fakeFetch)!({ system: "s", messages: [{ role: "user", content: "q" }], tools: [], maxTokens: 10 })), /401/);
});
