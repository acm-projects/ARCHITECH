import type { ChatModel, ModelEvent } from "./architectChat.ts";
import { ModelBusyError, retryAfterSeconds } from "./errors.ts";

// The AI Architect on Groq (free plan available): open models such as gpt-oss through Groq's
// OpenAI-compatible Chat Completions API, streamed. Server-only; the key never reaches the browser.
//   GROQ_API_KEY   required to use Groq
//   GROQ_MODEL     optional, default openai/gpt-oss-120b (Groq's recommended production model;
//                  Llama 3.x was retired for free accounts on 2026-08-16)
//   GROQ_BASE_URL  optional, only for tests (default https://api.groq.com/openai/v1)

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export function groqModelName(env: Record<string, string | undefined> = process.env): string {
  return env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

// Groq checks the model's tool call itself and, when the model wrote a malformed one, rejects
// the whole response ("Failed to call a function", code tool_use_failed) instead of passing it on.
export class ToolCallFailedError extends Error {
  constructor(message = "The model wrote a malformed tool call.") {
    super(message);
    this.name = "ToolCallFailedError";
  }
}

const isToolCallFailure = (error: { code?: string; message?: string } | undefined) =>
  error?.code === "tool_use_failed" || /failed to call a function/i.test(error?.message ?? "");

type Delta = {
  content?: string | null;
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
};

// Reads an OpenAI-style server-sent event stream ("data: {...}" lines, ending with
// "data: [DONE]") into text and complete tool calls. Tool call arguments may arrive in pieces.
export async function* readCompletionStream(body: ReadableStream<Uint8Array>): AsyncIterable<ModelEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, { name: string; args: string }>();
  let buffer = "";
  const finishCalls = function* (): Generator<ModelEvent> {
    for (const call of [...calls.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)) {
      let input: unknown = null;
      try {
        input = call.args ? JSON.parse(call.args) : {};
      } catch {
        input = null;
      }
      yield { type: "tool", name: call.name, input };
    }
    calls.clear();
  };
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        yield* finishCalls();
        return;
      }
      let chunk: { choices?: { delta?: Delta }[]; error?: { message?: string; code?: string } };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) {
        if (isToolCallFailure(chunk.error)) throw new ToolCallFailedError(chunk.error.message);
        throw new Error(chunk.error.message ?? "Groq returned an error.");
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) yield { type: "text", text: delta.content };
      for (const call of delta.tool_calls ?? []) {
        const entry = calls.get(call.index) ?? { name: "", args: "" };
        if (call.function?.name) entry.name = call.function.name;
        if (call.function?.arguments) entry.args += call.function.arguments;
        calls.set(call.index, entry);
      }
    }
    if (done) break;
  }
  yield* finishCalls();
}

// null when no key is configured.
export function groqModelFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): ChatModel | null {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  const model = groqModelName(env);
  const baseUrl = (env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

  const request = async function* (
    { system, messages, tools, maxTokens, signal }: Parameters<ChatModel>[0],
    withTools: boolean,
  ): AsyncIterable<ModelEvent> {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        max_completion_tokens: maxTokens,
        // gpt-oss reasons before answering, and that counts toward max_completion_tokens: keep it
        // short so the budget goes to the answer. (Its reasoning arrives separately and is not shown.)
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [
          {
            role: "system",
            content: withTools ? system : `${system}\n\n(Tools are unavailable for this answer: describe any change you recommend in words.)`,
          },
          ...messages,
        ],
        ...(withTools && tools.length > 0
          ? {
              tools: tools.map((tool) => ({
                type: "function",
                function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
              })),
            }
          : {}),
      }),
      signal,
    });
    if (response.status === 429) {
      throw new ModelBusyError(retryAfterSeconds(response.headers.get("retry-after")), "Groq's rate limit was reached.");
    }
    if (!response.ok || !response.body) {
      let error: { message?: string; code?: string } | undefined;
      try {
        error = ((await response.json()) as { error?: { message?: string; code?: string } }).error;
      } catch {
        error = undefined;
      }
      if (isToolCallFailure(error)) throw new ToolCallFailedError(error?.message);
      throw new Error(`Groq request failed (${response.status})${error?.message ? `: ${error.message}` : ""}`);
    }
    yield* readCompletionStream(response.body);
  };

  // A malformed tool call should not cost the user their answer. Before anything has streamed:
  // try again once, then ask without the tool (the answer describes the change in words).
  // After text has streamed: keep the text and drop only the broken suggestion.
  return async function* (input) {
    let streamed = false;
    for (const withTools of [true, true, false]) {
      try {
        for await (const event of request(input, withTools)) {
          streamed = true;
          yield event;
        }
        return;
      } catch (error) {
        if (!(error instanceof ToolCallFailedError)) throw error;
        if (streamed) return;
      }
    }
  };
}
