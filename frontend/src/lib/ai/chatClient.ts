import type { ChatEvent, ChatMessage } from "./architectChat.ts";
import type { GraphDocument } from "../projects/projectPayload.ts";

// The browser side of POST /api/ai/chat: sends the design and conversation, then reads the
// newline-delimited JSON stream and hands each event over as it arrives.

export type StreamEvent = ChatEvent | { type: "error"; error: string };

export type UsageInfo = { remainingToday: number; perDay: number };

// The X-AI-Remaining-Today / X-AI-Limit-Per-Day headers, if present.
export function usageFromHeaders(headers: Headers): UsageInfo | null {
  const remaining = Number(headers.get("x-ai-remaining-today"));
  const perDay = Number(headers.get("x-ai-limit-per-day"));
  return headers.has("x-ai-remaining-today") && Number.isFinite(remaining) && Number.isFinite(perDay) && perDay > 0
    ? { remainingToday: remaining, perDay }
    : null;
}

// GET /api/ai/usage; null if it cannot be read (not signed in, offline).
export async function fetchUsage(signal?: AbortSignal): Promise<UsageInfo | null> {
  try {
    const response = await fetch("/api/ai/usage", { signal, cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { remainingToday?: unknown; perDay?: unknown };
    return typeof body.remainingToday === "number" && typeof body.perDay === "number"
      ? { remainingToday: body.remainingToday, perDay: body.perDay }
      : null;
  } catch {
    return null;
  }
}

// "42 of 50 questions left today".
export function usageLabel(usage: UsageInfo): string {
  return `${usage.remainingToday} of ${usage.perDay} question${usage.perDay === 1 ? "" : "s"} left today`;
}

// Splits streamed text into complete lines; keeps a partial last line for the next chunk.
export function createLineSplitter() {
  let buffer = "";
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.filter((line) => line.trim().length > 0);
    },
    flush(): string[] {
      const rest = buffer.trim();
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}

export function parseEventLine(line: string): StreamEvent | null {
  try {
    const event = JSON.parse(line) as { type?: unknown };
    return typeof event?.type === "string" ? (event as StreamEvent) : null;
  } catch {
    return null;
  }
}

// What the panel shows for a request that was refused before streaming.
export function refusalMessage(status: number, serverMessage: string | undefined): string {
  if (status === 401) return "Sign in to use the AI Architect.";
  if (status === 503) return "The AI Architect isn't set up on this server yet (it needs an API key).";
  // A limit, or the AI provider is busy: the server says which and how long to wait.
  if (status === 429) return serverMessage ?? "You've reached the AI Architect's limit. Try again later.";
  return serverMessage ?? "The AI Architect is unavailable right now. Please try again.";
}

export async function askArchitect(input: {
  graph: GraphDocument;
  traffic: unknown;
  messages: ChatMessage[];
  // The components the user boxed on the canvas, if any.
  focus?: string[];
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  onUsage?: (usage: UsageInfo) => void;
}): Promise<void> {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      graph: input.graph,
      traffic: input.traffic,
      messages: input.messages,
      ...(input.focus?.length ? { focus: { nodeIds: input.focus } } : {}),
    }),
    signal: input.signal,
  });
  const usage = usageFromHeaders(response.headers);
  if (usage) input.onUsage?.(usage);
  if (!response.ok || !response.body) {
    let message: string | undefined;
    try {
      message = ((await response.json()) as { error?: string }).error;
    } catch {
      message = undefined;
    }
    input.onEvent({ type: "error", error: refusalMessage(response.status, message) });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lines = createLineSplitter();
  for (;;) {
    const { done, value } = await reader.read();
    const parts = done ? [...lines.push(decoder.decode()), ...lines.flush()] : lines.push(decoder.decode(value, { stream: true }));
    for (const line of parts) {
      const event = parseEventLine(line);
      if (event) input.onEvent(event);
    }
    if (done) break;
  }
}
