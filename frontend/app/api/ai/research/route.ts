import { createHash } from "node:crypto";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { aiStore } from "@/lib/ai/aiStore";
import {
  MAX_TECHNOLOGIES_PER_REQUEST,
  applyFindings,
  catalogMatch,
  groqResearcher,
  researchModelName,
  researchTechnologies,
  researchableTechnologies,
  type Finding,
  type ResearchOutcome,
} from "@/lib/ai/research";
import { CACHE_TTL_MS, createPruner, currentUsage, limitsFromEnv, reserveQuestion } from "@/lib/ai/usage";
import { MAX_COMPOSE_BYTES } from "@/lib/architecture/export/fromCompose";
import { log, requestIdOf } from "@/lib/server/log";

// POST /api/ai/research  { yaml }
// Looks up the custom technologies in an ARCHITECH compose file (an import preview) and writes
// the results into it for review (src/lib/ai/research.ts): technologies in ARCHITECH's catalog
// become that component (no AI call); the rest are read on Wikipedia and classified together
// in ONE Groq call, using a similar catalog technology's numbers.
//   200 { yaml, findings: [{ technology, finding | null, error? }], stoppedEarly?, remainingToday }
//       (always 200 once the file is valid: what could be looked up is applied, and each
//       technology that could not says why, e.g. Groq's free-plan limit)
//   400 invalid body or file, or nothing to look up · 401 not signed in · 503 no GROQ_API_KEY
// The Groq call counts as one AI question (src/lib/ai/usage.ts limits); catalog matches and
// results cached in the last day cost nothing. At most 12 technologies per request.

const prune = createPruner(aiStore);
const cacheKeyFor = (model: string, technology: string, hint: string) =>
  createHash("sha256").update(JSON.stringify(["research", 1, model, technology.toLowerCase(), hint])).digest("hex");

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const researcher = groqResearcher();
  if (!researcher) return NextResponse.json({ error: "Web research needs GROQ_API_KEY on the server." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }
  const yaml = (body as { yaml?: unknown } | null)?.yaml;
  if (typeof yaml !== "string" || !yaml.trim() || yaml.length > MAX_COMPOSE_BYTES) {
    return NextResponse.json({ error: "yaml must be the compose file's text." }, { status: 400 });
  }
  const wanted = researchableTechnologies(yaml).slice(0, MAX_TECHNOLOGIES_PER_REQUEST);
  if (wanted.length === 0) return NextResponse.json({ error: "There are no custom technologies to look up in this file." }, { status: 400 });

  const limits = limitsFromEnv();
  const modelName = researchModelName();
  prune();

  const outcomes = new Map<string, ResearchOutcome>();
  let stoppedEarly: string | undefined;
  try {
    // Cached in the last day: free.
    const todo: typeof wanted = [];
    for (const item of wanted) {
      const cached = await aiStore.readCache(cacheKeyFor(modelName, item.technology, item.hint), new Date(Date.now() - CACHE_TTL_MS));
      const text = cached?.[0]?.type === "text" ? cached[0].text : null;
      if (text === null) todo.push(item);
      else {
        await aiStore.recordCacheHit(userId);
        outcomes.set(item.technology, { technology: item.technology, finding: JSON.parse(text) as Finding });
      }
    }
    // Catalog matches need no AI call; the rest share one, which counts as one question.
    const needModel = todo.filter((item) => !catalogMatch(item.technology, item.hint));
    let requestId: string | null = null;
    let allowed = todo;
    if (needModel.length > 0) {
      const reserved = await reserveQuestion(aiStore, userId, limits);
      if (reserved.decision.ok) requestId = reserved.requestId;
      else {
        stoppedEarly = reserved.decision.error;
        allowed = todo.filter((item) => !needModel.includes(item));
        for (const item of needModel) outcomes.set(item.technology, { technology: item.technology, finding: null, error: reserved.decision.error });
      }
    }
    if (allowed.length > 0) {
      const result = await researchTechnologies(researcher, allowed, request.signal);
      const modelFailed = result.busy !== undefined || result.outcomes.some((outcome) => !outcome.finding && needModel.some((item) => item.technology === outcome.technology));
      // Groq was busy or failed: the question does not count.
      if (modelFailed && requestId) await aiStore.release(requestId).catch(() => undefined);
      if (result.busy) stoppedEarly = `Groq is busy (its free-plan limit). Try the rest again in ${result.busy.retryAfterSeconds} seconds; this did not count toward your limit.`;
      for (const outcome of result.outcomes) {
        outcomes.set(outcome.technology, outcome);
        const item = allowed.find((candidate) => candidate.technology === outcome.technology)!;
        if (outcome.finding) await aiStore.writeCache(cacheKeyFor(modelName, item.technology, item.hint), [{ type: "text", text: JSON.stringify(outcome.finding) }]).catch(() => undefined);
      }
    }
  } catch (error) {
    log.error("Technology research failed.", error, { requestId: requestIdOf(request) });
    for (const item of wanted) if (!outcomes.has(item.technology)) outcomes.set(item.technology, { technology: item.technology, finding: null, error: "The lookup failed." });
  }
  const results = wanted.map((item) => outcomes.get(item.technology) ?? { technology: item.technology, finding: null, error: "The lookup failed." });

  const updated = applyFindings(yaml, results.flatMap((result) => (result.finding ? [result.finding] : [])));
  if (updated === null) return NextResponse.json({ error: "This is not valid YAML." }, { status: 400 });
  const usage = await currentUsage(aiStore, userId, limits).catch(() => null);
  return NextResponse.json({
    yaml: updated,
    findings: results,
    ...(stoppedEarly ? { stoppedEarly } : {}),
    ...(usage ? { remainingToday: usage.remainingToday } : {}),
  });
}
