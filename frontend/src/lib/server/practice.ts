import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../../app/api/auth/[...nextauth]/route";
import { PRACTICE_ATTEMPTS_PER_HOUR, type AttemptKind } from "../architecture/practice/attempts";
import { EVALUATION_MODEL_VERSION } from "../architecture/evaluation/contract";
import { prisma } from "../prisma";
import { isValidProjectId, validateGraph, type GraphDocument } from "../projects/projectPayload";

// Shared by the /api/practice routes: the signed-in user, the request body, the hourly limit and
// saving an attempt.

export async function practiceUser(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  return userId ? { ok: true, userId } : { ok: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// The JSON object body, with only the allowed fields.
export async function readFields(request: Request, allowed: readonly string[]): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: badRequest("Invalid request body.") };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, response: badRequest("The body must be a JSON object.") };
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  if (unknown) return { ok: false, response: badRequest(`Unknown field "${unknown}".`) };
  return { ok: true, body: body as Record<string, unknown> };
}

export function readGraph(raw: unknown, field = "graph"): { ok: true; graph: GraphDocument } | { ok: false; response: NextResponse } {
  if (raw === undefined) return { ok: false, response: badRequest(`${field} is required.`) };
  const graph = validateGraph(raw);
  return graph.ok ? { ok: true, graph: graph.value } : { ok: false, response: badRequest(field === "graph" ? graph.error : `${field}: ${graph.error}`) };
}

export function readProjectId(raw: unknown): { ok: true; projectId: string | null } | { ok: false; response: NextResponse } {
  if (raw === undefined) return { ok: true, projectId: null };
  return typeof raw === "string" && isValidProjectId(raw) ? { ok: true, projectId: raw } : { ok: false, response: badRequest("projectId must be a project id.") };
}

// 429 once a user has made PRACTICE_ATTEMPTS_PER_HOUR attempts in the last hour.
export async function practiceLimit(userId: string): Promise<NextResponse | null> {
  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await prisma.practiceAttempt.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true }, orderBy: { createdAt: "asc" } });
  if (recent.length < PRACTICE_ATTEMPTS_PER_HOUR) return null;
  const wait = Math.max(1, Math.ceil((recent[recent.length - PRACTICE_ATTEMPTS_PER_HOUR]!.createdAt.getTime() + 60 * 60_000 - Date.now()) / 1000));
  return NextResponse.json(
    { error: `You can make ${PRACTICE_ATTEMPTS_PER_HOUR} practice attempts an hour. Try again in ${Math.ceil(wait / 60)} minutes.` },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}

export async function saveAttempt(attempt: {
  userId: string;
  kind: AttemptKind;
  scenarioId?: string | null;
  projectId?: string | null;
  graph: unknown;
  traffic: unknown;
  answer: unknown;
  result: unknown;
  correct: number;
  total: number;
  passed: boolean;
}) {
  const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  const row = await prisma.practiceAttempt.create({
    data: {
      userId: attempt.userId,
      kind: attempt.kind,
      scenarioId: attempt.scenarioId ?? null,
      projectId: attempt.projectId ?? null,
      graph: json(attempt.graph),
      traffic: json(attempt.traffic),
      modelVersion: EVALUATION_MODEL_VERSION,
      answer: json(attempt.answer),
      result: json(attempt.result),
      correct: attempt.correct,
      total: attempt.total,
      passed: attempt.passed,
    },
    select: { id: true, createdAt: true },
  });
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}
