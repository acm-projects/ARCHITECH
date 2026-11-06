import Anthropic from "@anthropic-ai/sdk";

import type { ChatModel } from "./architectChat";
import { ModelBusyError, retryAfterSeconds } from "./errors.ts";

// The AI Architect's model: Claude through Anthropic's official SDK, streamed. Server-only:
// the API key is read from the environment and never sent to the browser.
//   ANTHROPIC_API_KEY  required to enable the AI Architect
//   ANTHROPIC_MODEL    optional, default claude-sonnet-5-5 (claude-haiku-5-5 is cheaper)
//   ANTHROPIC_BASE_URL optional, only for the integration tests' fake model

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export function anthropicModelName(env: Record<string, string | undefined> = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

// null when no key is configured, so the route can say the feature is off.
export function anthropicModelFromEnv(env: Record<string, string | undefined> = process.env): ChatModel | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model = anthropicModelName(env);
  const baseURL = env.ANTHROPIC_BASE_URL?.trim();
  // One retry for brief overloads; a longer rate limit is reported as busy instead of holding the request.
  const client = new Anthropic({ apiKey, maxRetries: 1, ...(baseURL ? { baseURL } : {}) });

  return async function* ({ system, messages, tools, maxTokens, signal }) {
    let stream;
    try {
      stream = await client.messages.create({ model, max_tokens: maxTokens, system, messages, tools, stream: true }, { signal });
    } catch (error) {
      // Anthropic's rate limit (429) or overload (529): busy, not broken.
      const status = (error as { status?: number }).status;
      if (status === 429 || status === 529) {
        const headers = (error as { headers?: Headers | Record<string, string> }).headers;
        const header = headers instanceof Headers ? headers.get("retry-after") : headers?.["retry-after"];
        throw new ModelBusyError(retryAfterSeconds(header), "Anthropic's rate limit was reached.");
      }
      throw error;
    }
    // Tool calls arrive as JSON in pieces; collect each block and hand it over when it ends.
    const toolsInProgress = new Map<number, { name: string; json: string }>();
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        toolsInProgress.set(event.index, { name: event.content_block.name, json: "" });
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") yield { type: "text", text: event.delta.text };
        else if (event.delta.type === "input_json_delta") {
          const tool = toolsInProgress.get(event.index);
          if (tool) tool.json += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        const tool = toolsInProgress.get(event.index);
        if (tool) {
          toolsInProgress.delete(event.index);
          let input: unknown = null;
          try {
            input = tool.json ? JSON.parse(tool.json) : {};
          } catch {
            input = null;
          }
          yield { type: "tool", name: tool.name, input };
        }
      }
    }
  };
}
