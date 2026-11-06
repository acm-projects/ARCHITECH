import type { ChatMessage, MetricsSnapshot, SuggestionEvent } from "./architectChat.ts";
import { MAX_MESSAGES } from "./architectChat.ts";

// A project's saved AI Architect conversation: the panel's turns, so a reload or another device
// shows the same chat. Validated before it is stored (PUT /api/projects/[id]/conversation).

export type SavedUserTurn = { role: "user"; text: string; focusCount: number };
export type SavedAssistantTurn = {
  role: "assistant";
  text: string;
  suggestions: SuggestionEvent[];
  notes: string[];
  error?: string;
  // Suggestion id -> "applied", or why it could not be applied.
  applied: Record<string, string>;
};
export type SavedTurn = SavedUserTurn | SavedAssistantTurn;

export type ChatHistoryTurn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      done: boolean;
      error?: string;
      notes?: readonly string[];
      suggestions?: readonly Pick<SuggestionEvent, "title">[];
    };

function isSuccessfulAssistant(turn: ChatHistoryTurn | undefined): turn is Extract<ChatHistoryTurn, { role: "assistant" }> {
  return turn?.role === "assistant" && turn.done && !turn.error && !turn.notes?.includes("Stopped.");
}

export function buildChatHistory(turns: readonly ChatHistoryTurn[], question: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const [index, turn] of turns.entries()) {
    if (turn.role === "user") {
      if (isSuccessfulAssistant(turns[index + 1])) messages.push({ role: "user", content: turn.text });
    } else if (isSuccessfulAssistant(turn) && turns[index - 1]?.role === "user") {
      const proposed = turn.suggestions?.map((suggestion) => `(Proposed: ${suggestion.title})`).join(" ") ?? "";
      const content = [turn.text.trim(), proposed].filter(Boolean).join("\n");
      if (content) messages.push({ role: "assistant", content });
    }
  }
  messages.push({ role: "user", content: question });
  // Keep the provider context small; the latest question is always retained.
  let recent = messages.slice(-MAX_MESSAGES);
  while (recent.length > 0 && recent[0].role !== "user") recent = recent.slice(1);
  return recent;
}

export const MAX_SAVED_TURNS = 200;
export const MAX_CONVERSATION_BYTES = 256 * 1024;
const MAX_TEXT = 20_000;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = MAX_TEXT): value is string => typeof value === "string" && value.length <= max;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isSnapshot(value: unknown): value is MetricsSnapshot {
  return (
    isRecord(value) &&
    isNumber(value.score) &&
    isNumber(value.p95LatencyMs) &&
    isNumber(value.monthlyCost) &&
    (value.capacityRps === null || isNumber(value.capacityRps)) &&
    isNumber(value.uptimePercent)
  );
}

function isSuggestion(value: unknown): value is SuggestionEvent {
  return (
    isRecord(value) &&
    value.type === "suggestion" &&
    isText(value.id, 20) &&
    isText(value.title, 500) &&
    isText(value.reason, 2_000) &&
    Array.isArray(value.changes) &&
    value.changes.length <= 12 &&
    value.changes.every(isRecord) &&
    isRecord(value.preview) &&
    isSnapshot(value.preview.before) &&
    isSnapshot(value.preview.after)
  );
}

export function validateConversation(raw: unknown): Result<SavedTurn[]> {
  if (!isRecord(raw) || !Array.isArray(raw.turns)) return { ok: false, error: "The body must be { turns: [...] }." };
  if (raw.turns.length > MAX_SAVED_TURNS) return { ok: false, error: `A conversation can hold at most ${MAX_SAVED_TURNS} turns.` };
  if (JSON.stringify(raw.turns).length > MAX_CONVERSATION_BYTES) return { ok: false, error: "The conversation is too large to save." };
  const turns: SavedTurn[] = [];
  for (const [index, turn] of raw.turns.entries()) {
    const where = `turns[${index}]`;
    if (!isRecord(turn)) return { ok: false, error: `${where} must be an object.` };
    if (turn.role === "user") {
      if (!isText(turn.text) || !turn.text.trim()) return { ok: false, error: `${where}.text must be non-empty text.` };
      const focusCount = turn.focusCount ?? 0;
      if (!Number.isInteger(focusCount) || (focusCount as number) < 0) return { ok: false, error: `${where}.focusCount must be a whole number.` };
      turns.push({ role: "user", text: turn.text, focusCount: focusCount as number });
    } else if (turn.role === "assistant") {
      if (!isText(turn.text)) return { ok: false, error: `${where}.text must be text.` };
      const suggestions = turn.suggestions ?? [];
      const notes = turn.notes ?? [];
      const applied = turn.applied ?? {};
      if (!Array.isArray(suggestions) || suggestions.length > 2 || !suggestions.every(isSuggestion)) {
        return { ok: false, error: `${where}.suggestions must be at most 2 suggestions as the AI Architect sends them.` };
      }
      if (!Array.isArray(notes) || notes.length > 10 || !notes.every((note) => isText(note, 2_000))) {
        return { ok: false, error: `${where}.notes must be a list of short texts.` };
      }
      if (!isRecord(applied) || !Object.values(applied).every((value) => isText(value, 500))) {
        return { ok: false, error: `${where}.applied must map suggestion ids to text.` };
      }
      if (turn.error !== undefined && !isText(turn.error, 2_000)) return { ok: false, error: `${where}.error must be text.` };
      turns.push({
        role: "assistant",
        text: turn.text,
        suggestions,
        notes,
        applied: applied as Record<string, string>,
        ...(typeof turn.error === "string" ? { error: turn.error } : {}),
      });
    } else {
      return { ok: false, error: `${where}.role must be "user" or "assistant".` };
    }
  }
  return { ok: true, value: turns };
}
