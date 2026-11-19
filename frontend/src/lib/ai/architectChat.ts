import type { ArchitectureEvaluation } from "../architecture/evaluation/contract.ts";
import { asksForFix, bestFix, suggestionsFromText } from "./textSuggestions.ts";
import { evaluateArchitecture } from "../architecture/evaluation/evaluate.ts";
import { validateGraph, type GraphDocument } from "../projects/projectPayload.ts";
import type { ExperienceLevel } from "../../types.ts";
import { PROPOSE_CHANGES_TOOL, buildArchitectSystemPrompt } from "./architectPrompt.ts";
import { applyChanges, parseSuggestion, type Change } from "./changes.ts";

// One turn of the AI Architect chat, independent of HTTP and of the AI provider (tested with a
// fake model). The route adds sign-in, rate limiting, caching and streaming.
//
// Request: { graph, traffic?, messages }
//   graph     The canvas design in the graph spec format, validated like a saved project.
//   traffic   Optional, as for Run Design.
//   messages  The conversation so far, oldest first, ending with the user's new message.
//   focus     Optional { nodeIds }: the part of the canvas the user boxed. The answer is about that
//             part only, and suggestions must stay within it (or connect to it).
//
// The reply is a stream of events:
//   { type: "text", text }                 part of the answer, in order
//   { type: "suggestion", ... }            a change the user can apply, already checked against
//                                          the design and previewed with the engine
//   { type: "note", text }                 a short remark beside the answer (none are sent today)
//   { type: "done" }

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ModelEvent = { type: "text"; text: string } | { type: "tool"; name: string; input: unknown };

export type ChatModel = (input: {
  system: string;
  messages: ChatMessage[];
  tools: (typeof PROPOSE_CHANGES_TOOL)[];
  maxTokens: number;
  signal?: AbortSignal;
}) => AsyncIterable<ModelEvent>;

export type MetricsSnapshot = { score: number; p95LatencyMs: number; monthlyCost: number; capacityRps: number | null; uptimePercent: number };

export type SuggestionEvent = {
  type: "suggestion";
  id: string;
  title: string;
  reason: string;
  changes: Change[];
  preview: { before: MetricsSnapshot; after: MetricsSnapshot };
};

export type ChatEvent =
  | { type: "text"; text: string }
  | SuggestionEvent
  | { type: "note"; text: string }
  | { type: "done" };

export const MAX_MESSAGES = 4;
export const MAX_MESSAGE_LENGTH = 4_000;
// One sentence plus at most one proposed change.
export const MAX_REPLY_TOKENS = 800;
export const MAX_SUGGESTIONS = 2;
// Fixes named only in the answer's words, turned into changes (textSuggestions.ts). An answer
// can name a few at once ("a load balancer, a read replica and a cache"), each applied alone.
export const MAX_TEXT_SUGGESTIONS = 3;

export type ChatRequest = {
  graph: GraphDocument;
  traffic?: Record<string, unknown>;
  messages: ChatMessage[];
  focus?: { nodeIds: string[] };
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validateChatRequest(raw: unknown): Result<ChatRequest> {
  if (!isRecord(raw)) return { ok: false, error: "The request body must be a JSON object." };
  const unknownKey = Object.keys(raw).find((key) => !["graph", "traffic", "messages", "focus"].includes(key));
  if (unknownKey) return { ok: false, error: `Unknown field "${unknownKey}".` };
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) return { ok: false, error: "messages must be a non-empty array." };
  if (raw.messages.length > MAX_MESSAGES) {
    return { ok: false, error: `messages can hold at most ${MAX_MESSAGES} messages; start a new conversation.` };
  }
  const messages: ChatMessage[] = [];
  for (const [index, message] of raw.messages.entries()) {
    if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) {
      return { ok: false, error: `messages[${index}].role must be "user" or "assistant".` };
    }
    if (typeof message.content !== "string" || !message.content.trim()) {
      return { ok: false, error: `messages[${index}].content must be non-empty text.` };
    }
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: `messages[${index}].content can be at most ${MAX_MESSAGE_LENGTH} characters.` };
    }
    messages.push({ role: message.role, content: message.content });
  }
  if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return { ok: false, error: "The conversation must start and end with a user message." };
  }
  if (raw.traffic !== undefined && !isRecord(raw.traffic)) return { ok: false, error: "traffic must be an object when given." };
  const graph = validateGraph(raw.graph);
  if (!graph.ok) return { ok: false, error: graph.error };
  let focus: string[] | undefined;
  if (raw.focus !== undefined) {
    if (!isRecord(raw.focus) || !Array.isArray(raw.focus.nodeIds) || raw.focus.nodeIds.length === 0) {
      return { ok: false, error: "focus.nodeIds must be a non-empty array of component ids." };
    }
    const known = new Set(graph.value.nodes.map((node) => node.id));
    for (const id of raw.focus.nodeIds) {
      if (typeof id !== "string" || !known.has(id)) {
        return { ok: false, error: `focus.nodeIds: "${String(id)}" is not a component in the design.` };
      }
    }
    focus = [...new Set(raw.focus.nodeIds as string[])].sort();
  }
  return {
    ok: true,
    value: { graph: graph.value, ...(raw.traffic ? { traffic: raw.traffic } : {}), messages, ...(focus ? { focus: { nodeIds: focus } } : {}) },
  };
}

export function snapshot(evaluation: ArchitectureEvaluation): MetricsSnapshot {
  return {
    score: evaluation.overallScore,
    p95LatencyMs: Math.round(evaluation.metrics.p95LatencyMs * 10) / 10,
    monthlyCost: Math.round(evaluation.metrics.estimatedMonthlyCost),
    capacityRps: evaluation.metrics.capacityRps === null ? null : Math.round(evaluation.metrics.capacityRps),
    uptimePercent: evaluation.metrics.uptimeAvailability,
  };
}

// With a focus, a change may only touch selected components or ones it adds; a connection needs
// at least one end that is selected or new. Returns the first change that breaks this.
export function outsideFocus(changes: Change[], focus: string[]): string | null {
  const inside = new Set(focus);
  const allowed = (id: string) => inside.has(id) || id.startsWith("new-");
  for (const change of changes) {
    if (change.op === "add_component") continue;
    if (change.op === "connect" || change.op === "disconnect") {
      if (!allowed(change.from) && !allowed(change.to)) return `${change.op} ${change.from} -> ${change.to}`;
    } else if (!inside.has(change.node)) {
      return `${change.op} on ${change.node}`;
    }
  }
  return null;
}

// Checks a proposed change against the design and previews it with the engine.
export function prepareSuggestion(
  raw: unknown,
  graph: GraphDocument,
  traffic: unknown,
  before: MetricsSnapshot,
  id: string,
  focus?: string[],
): { ok: true; event: SuggestionEvent } | { ok: false; error: string } {
  const parsed = parseSuggestion(raw);
  if (!parsed.ok) return parsed;
  if (focus?.length) {
    const outside = outsideFocus(parsed.value.changes, focus);
    if (outside) return { ok: false, error: `it changes a part of the design outside your selection (${outside}).` };
  }
  const applied = applyChanges(graph, parsed.value.changes);
  if (!applied.ok) return applied;
  const after = { schemaVersion: graph.schemaVersion, nodes: applied.nodes, edges: applied.edges };
  const valid = validateGraph(JSON.parse(JSON.stringify(after)));
  if (!valid.ok) return { ok: false, error: valid.error };
  const evaluation = evaluateArchitecture({ graph: valid.value as never, traffic });
  return {
    ok: true,
    event: { type: "suggestion", id, title: parsed.value.title, reason: parsed.value.reason, changes: parsed.value.changes, preview: { before, after: snapshot(evaluation) } },
  };
}

export function runArchitectChat(input: {
  request: ChatRequest;
  level: ExperienceLevel;
  model: ChatModel;
  signal?: AbortSignal;
}): AsyncIterable<ChatEvent> {
  const { graph, traffic, messages } = input.request;
  const focus = input.request.focus?.nodeIds;
  const evaluation = evaluateArchitecture({ graph: graph as never, traffic });
  const system = buildArchitectSystemPrompt({ graph, evaluation, level: input.level, focus });
  const before = snapshot(evaluation);
  const stream = input.model({ system, messages, tools: [PROPOSE_CHANGES_TOOL], maxTokens: MAX_REPLY_TOKENS, signal: input.signal });

  return (async function* () {
    let suggestions = 0;
    let answer = "";
    for await (const event of stream) {
      if (event.type === "text") {
        answer += event.text ?? "";
        if (event.text) yield { type: "text", text: event.text };
      } else if (event.name === PROPOSE_CHANGES_TOOL.name) {
        if (suggestions >= MAX_SUGGESTIONS) continue;
        const prepared = prepareSuggestion(event.input, graph, traffic, before, `s${suggestions + 1}`, focus);
        // A change that does not fit the design is left out quietly: the answer still stands, and
        // the fallback below can offer one that does.
        if (prepared.ok) {
          suggestions += 1;
          yield prepared.event;
        }
      }
    }
    // The answer named fixes but sent none to apply: build them from the design, so what Archie
    // recommends can still be applied with one click. Checked and previewed like any other.
    if (suggestions === 0) {
      let made = 0;
      for (const suggestion of suggestionsFromText(answer, graph)) {
        if (made >= MAX_TEXT_SUGGESTIONS) break;
        const prepared = prepareSuggestion(suggestion, graph, traffic, before, `t${made + 1}`, focus);
        if (!prepared.ok) continue;
        made += 1;
        yield prepared.event;
      }
      // Asked how to fix it, and still nothing to apply: offer the design's best fix anyway.
      const question = messages.at(-1)?.content ?? "";
      if (made === 0 && asksForFix(question)) {
        const limiting = evaluation.nodes.find((node) => node.nodeId === evaluation.limitingNodeId)?.type ?? null;
        const fix = bestFix(graph, limiting);
        const prepared = fix && prepareSuggestion(fix, graph, traffic, before, "t1", focus);
        if (prepared && prepared.ok) yield prepared.event;
      }
    }
    yield { type: "done" };
  })();
}
