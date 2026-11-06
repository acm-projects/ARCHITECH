import { createHash } from "node:crypto";

import { canonicalJson } from "../projects/syncPlan.ts";
import type { ChatEvent, ChatRequest } from "./architectChat.ts";

// Rate limiting and caching for the AI Architect, so an API key (or a free plan's quota) cannot be
// run up, and the same question about the same design is answered from the cache. Stored in
// PostgreSQL (aiStore.ts), so it works the same with several servers. Passed a store, so it can
// be tested without one.
//
// Limits (model calls; cached answers and failed calls do not count):
//   AI_LIMIT_PER_MINUTE      per user, default 5
//   AI_LIMIT_PER_DAY         per user, default 50
//   AI_LIMIT_GLOBAL_PER_DAY  all users together, default 1000 (protects the shared provider quota)
// Windows slide: "the last 60 seconds" and "the last 24 hours".
// Reserving a question is atomic (one transaction under a lock), so simultaneous questions cannot
// all slip past a limit. A question whose model call fails is released (refunded).
//
// Cache: a complete reply is reused for 24 hours for the same model, experience level, design,
// traffic, conversation and focus. Layout (positions, edge ids) does not matter.

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const CACHE_TTL_MS = DAY_MS;
// Request rows are kept a little longer than the day window, then deleted.
export const REQUEST_RETENTION_MS = 2 * DAY_MS;

export type Limits = { perMinute: number; perDay: number; globalPerDay: number };

// The model calls (not cached answers) in the last day: this user's, and everyone's. Oldest first.
export type RecentCalls = { user: Date[]; all: Date[] };

export type Usage = { remainingToday: number; perDay: number; perMinute: number };

export type Decision =
  | { ok: true; usage: Usage }
  | { ok: false; scope: "minute" | "day" | "global"; retryAfterSeconds: number; error: string; usage: Usage };

export type AiStore = {
  // Atomically: reads the recent calls, asks `decide`, and records a new call if it allows.
  reserve: (userId: string, since: Date, decide: (recent: RecentCalls) => Decision) => Promise<{ decision: Decision; requestId: string | null }>;
  // Deletes a reserved call (the model failed, so it should not count).
  release: (requestId: string) => Promise<void>;
  recent: (userId: string, since: Date) => Promise<RecentCalls>;
  recordCacheHit: (userId: string) => Promise<void>;
  // The cached events for this key, if saved after `since`.
  readCache: (key: string, since: Date) => Promise<ChatEvent[] | null>;
  writeCache: (key: string, events: ChatEvent[]) => Promise<void>;
  // Deletes request rows and cache entries older than the given times.
  prune: (before: { requests: Date; cache: Date }) => Promise<void>;
};

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  return {
    perMinute: positive(env.AI_LIMIT_PER_MINUTE, 5),
    perDay: positive(env.AI_LIMIT_PER_DAY, 50),
    globalPerDay: positive(env.AI_LIMIT_GLOBAL_PER_DAY, 1_000),
  };
}

// Seconds until enough of `times` (oldest first) leave the window for one more call.
function waitSeconds(times: readonly Date[], limit: number, windowMs: number, now: Date): number {
  const freedBy = times[times.length - limit];
  return Math.max(1, Math.ceil((freedBy.getTime() + windowMs - now.getTime()) / 1000));
}

const wait = (seconds: number) => (seconds < 90 ? `${seconds} second${seconds === 1 ? "" : "s"}` : seconds < 5_400 ? `${Math.ceil(seconds / 60)} minutes` : `${Math.ceil(seconds / 3_600)} hours`);

// Whether one more model call is allowed, given the calls in the last day. Pure.
export function decideLimits(recent: RecentCalls, limits: Limits, now: Date): Decision {
  const inLast = (times: readonly Date[], ms: number) => times.filter((time) => time.getTime() > now.getTime() - ms);
  const userDay = inLast(recent.user, DAY_MS);
  const userMinute = inLast(recent.user, MINUTE_MS);
  const allDay = inLast(recent.all, DAY_MS);
  const usage = (extra: number): Usage => ({
    remainingToday: Math.max(0, Math.min(limits.perDay - userDay.length, limits.globalPerDay - allDay.length) - extra),
    perDay: limits.perDay,
    perMinute: limits.perMinute,
  });
  if (userMinute.length >= limits.perMinute) {
    const seconds = waitSeconds(userMinute, limits.perMinute, MINUTE_MS, now);
    return { ok: false, scope: "minute", retryAfterSeconds: seconds, usage: usage(0), error: `You can ask the AI Architect ${limits.perMinute} questions a minute. Try again in ${wait(seconds)}.` };
  }
  if (userDay.length >= limits.perDay) {
    const seconds = waitSeconds(userDay, limits.perDay, DAY_MS, now);
    return { ok: false, scope: "day", retryAfterSeconds: seconds, usage: usage(0), error: `You have used today's ${limits.perDay} AI Architect questions. Try again in ${wait(seconds)}.` };
  }
  if (allDay.length >= limits.globalPerDay) {
    const seconds = waitSeconds(allDay, limits.globalPerDay, DAY_MS, now);
    return { ok: false, scope: "global", retryAfterSeconds: seconds, usage: usage(0), error: `The AI Architect has answered as many questions as it can today for everyone. Try again in ${wait(seconds)}.` };
  }
  return { ok: true, usage: usage(1) };
}

export async function reserveQuestion(store: AiStore, userId: string, limits: Limits, now = new Date()) {
  return store.reserve(userId, new Date(now.getTime() - DAY_MS), (recent) => decideLimits(recent, limits, now));
}

// Questions left without asking one (for the panel, and after a cached answer).
export async function currentUsage(store: AiStore, userId: string, limits: Limits, now = new Date()): Promise<Usage> {
  const recent = await store.recent(userId, new Date(now.getTime() - DAY_MS));
  const decision = decideLimits(recent, limits, now);
  return decision.ok ? { ...decision.usage, remainingToday: decision.usage.remainingToday + 1 } : decision.usage;
}

// Deletes old rows at most once per interval per server, in the background.
export function createPruner(store: AiStore, everyMs = 60 * 60 * 1000) {
  let last = 0;
  return (now = new Date()) => {
    if (now.getTime() - last < everyMs) return;
    last = now.getTime();
    void store
      .prune({ requests: new Date(now.getTime() - REQUEST_RETENTION_MS), cache: new Date(now.getTime() - CACHE_TTL_MS) })
      .catch((error) => console.error("Pruning AI Architect usage failed.", error));
  };
}

// Everything that decides the answer, in a canonical form, hashed. Key order, the canvas order of
// components and the layout (positions, edge ids) do not matter: the model
// never sees them.
export function cacheKey(input: { model: string; level: string; request: ChatRequest }): string {
  const { graph, traffic, messages, focus } = input.request;
  const nodes = [...graph.nodes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((node) => ({ id: node.id, data: node.data }));
  const edges = graph.edges.map((edge) => `${edge.source} -> ${edge.target}`).sort();
  const material = canonicalJson({
    version: 2,
    model: input.model,
    level: input.level,
    graph: { schemaVersion: graph.schemaVersion, nodes, edges, customTechnologies: (graph as { customTechnologies?: unknown }).customTechnologies ?? null },
    traffic: traffic ?? null,
    messages,
    focus: focus ? [...focus.nodeIds].sort() : null,
  });
  return createHash("sha256").update(material).digest("hex");
}

// Replays cached events as a stream.
export async function* replay(events: readonly ChatEvent[]): AsyncIterable<ChatEvent> {
  for (const event of events) yield event;
}

// Passes events through, and saves them to the cache once the reply is complete.
export async function* recording(
  events: AsyncIterable<ChatEvent>,
  save: (all: ChatEvent[]) => Promise<void>,
): AsyncIterable<ChatEvent> {
  const all: ChatEvent[] = [];
  for await (const event of events) {
    all.push(event);
    yield event;
  }
  if (all.at(-1)?.type === "done") await save(all).catch(() => undefined);
}
