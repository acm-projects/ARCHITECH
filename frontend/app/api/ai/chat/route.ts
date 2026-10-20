import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { aiStore } from "@/lib/ai/aiStore";
import { ModelBusyError } from "@/lib/ai/errors";
import { chatModelFromEnv } from "@/lib/ai/model";
import { runArchitectChat, validateChatRequest, type ChatEvent } from "@/lib/ai/architectChat";
import {
  CACHE_TTL_MS,
  cacheKey,
  createPruner,
  currentUsage,
  limitsFromEnv,
  recording,
  replay,
  reserveQuestion,
  type Usage,
} from "@/lib/ai/usage";
import { isExperienceLevel } from "@/lib/experienceLevel";
import { log, requestIdOf, serverError } from "@/lib/server/log";

// POST /api/ai/chat: one turn of the AI Architect conversation about the design on the canvas.
// Body: { graph, traffic?, messages, focus? } (see src/lib/ai/architectChat.ts).
// Streams newline-delimited JSON (application/x-ndjson), one event per line:
//   {"type":"text","text":"..."}            part of the answer
//   {"type":"suggestion",...}               a checked, previewed change the canvas can apply
//   {"type":"note","text":"..."}            a proposed change that could not be used
//   {"type":"error","error":"..."}          the model stopped part-way
//   {"type":"done"}
// The model is Claude or Groq, chosen by the server's environment (src/lib/ai/model.ts).
// Errors before streaming: 401 not signed in · 400 invalid request · 503 AI not configured ·
// 429 a limit was reached, or the AI provider is busy (Retry-After header, exact) ·
// 502 the model failed before replying.
// Limits and cache: src/lib/ai/usage.ts. A cached answer (header X-AI-Cache: hit) does not call
// the model or count; a question whose model call fails is refunded. Every response carries
// X-AI-Remaining-Today and X-AI-Limit-Per-Day.

const prune = createPruner(aiStore);

const usageHeaders = (usage: Usage) => ({
  "X-AI-Remaining-Today": String(usage.remainingToday),
  "X-AI-Limit-Per-Day": String(usage.perDay),
});
const unavailable = () => NextResponse.json({ error: "The AI Architect is unavailable right now. Please try again." }, { status: 502 });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const choice = chatModelFromEnv();
  if (!choice) return NextResponse.json({ error: "The AI Architect is not configured on this server." }, { status: 503 });
  const { model } = choice;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }
  const parsed = validateChatRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const userId = session.user.id;
  const level = isExperienceLevel(session.user.experienceLevel) ? session.user.experienceLevel : "Intermediate";
  const key = cacheKey({ model: choice.name, level, request: parsed.value });
  const limits = limitsFromEnv();
  prune();

  let source: AsyncIterable<ChatEvent>;
  let usage: Usage;
  let requestId: string | null = null;
  let cacheHit = false;
  try {
    const cached = await aiStore.readCache(key, new Date(Date.now() - CACHE_TTL_MS));
    if (cached) {
      cacheHit = true;
      await aiStore.recordCacheHit(userId);
      usage = await currentUsage(aiStore, userId, limits);
      source = replay(cached);
    } else {
      const reserved = await reserveQuestion(aiStore, userId, limits);
      if (!reserved.decision.ok) {
        return NextResponse.json(
          { error: reserved.decision.error },
          { status: 429, headers: { "Retry-After": String(reserved.decision.retryAfterSeconds), ...usageHeaders(reserved.decision.usage) } },
        );
      }
      requestId = reserved.requestId;
      usage = reserved.decision.usage;
      source = recording(runArchitectChat({ request: parsed.value, level, model, signal: request.signal }), (all) =>
        aiStore.writeCache(key, all),
      );
    }
  } catch (error) {
    return serverError(request, "AI Architect usage check failed.", error, "The AI Architect is unavailable right now. Please try again.");
  }
  // The provider failed, so the question should not count.
  const refund = async () => {
    if (!requestId) return;
    const id = requestId;
    requestId = null;
    await aiStore.release(id).catch((error) => log.error("Refunding an AI Architect question failed.", error, { requestId: requestIdOf(request) }));
    usage = { ...usage, remainingToday: usage.remainingToday + 1 };
  };
  const events = source[Symbol.asyncIterator]();

  // Wait for the first event before answering, so a model that fails straight away (bad key,
  // outage, rate limit) gets a proper error status instead of an empty 200.
  let first: IteratorResult<ChatEvent>;
  try {
    first = await events.next();
  } catch (error) {
    await refund();
    if (error instanceof ModelBusyError) {
      return NextResponse.json(
        { error: `The AI Architect is busy right now (the AI provider's limit). Try again in ${error.retryAfterSeconds} seconds. This question didn't count toward your limit.` },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), ...usageHeaders(usage) } },
      );
    }
    log.error("AI Architect request failed.", error, { requestId: requestIdOf(request), provider: choice.provider });
    return unavailable();
  }

  const encoder = new TextEncoder();
  const line = (event: ChatEvent | { type: "error"; error: string }) => encoder.encode(`${JSON.stringify(event)}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let next = first; !next.done; next = await events.next()) controller.enqueue(line(next.value));
      } catch (error) {
        // Stopped by the user: the provider did the work, so it counts. Otherwise refund it.
        if (!request.signal.aborted) {
          await refund();
          log.error("AI Architect reply failed.", error, { requestId: requestIdOf(request), provider: choice.provider });
          controller.enqueue(line({ type: "error", error: "The AI Architect stopped unexpectedly. Please try again (this question didn't count)." }));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AI-Cache": cacheHit ? "hit" : "miss",
      ...usageHeaders(usage),
    },
  });
}
