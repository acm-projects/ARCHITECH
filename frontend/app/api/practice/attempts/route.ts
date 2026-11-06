import { NextResponse } from "next/server";

import { ATTEMPT_KINDS, summarizeAttempts } from "@/lib/architecture/practice/attempts";
import { prisma } from "@/lib/prisma";
import { serverError } from "@/lib/server/log";
import { practiceUser } from "@/lib/server/practice";

// GET /api/practice/attempts?kind=prediction|incident: the signed-in user's practice history.
//   200 { attempts: [{ id, kind, scenarioId, projectId, correct, total, passed, answer, result, createdAt }],
//         summary: { predictions: { attempts, accuracy, recentAccuracy, earlierAccuracy, byQuestion },
//                    incidents: { attempts, passedScenarios } } }
//   attempts: the last 30 (of the kind, when given), newest first; summary: all of them.
//   400 unknown kind · 401 not signed in

export async function GET(request: Request) {
  const user = await practiceUser();
  if (!user.ok) return user.response;
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== null && !(ATTEMPT_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: `kind must be one of ${ATTEMPT_KINDS.join(", ")}.` }, { status: 400 });
  }
  try {
    const [recent, all] = await Promise.all([
      prisma.practiceAttempt.findMany({
        where: { userId: user.userId, ...(kind ? { kind } : {}) },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, kind: true, scenarioId: true, projectId: true, correct: true, total: true, passed: true, answer: true, result: true, createdAt: true },
      }),
      prisma.practiceAttempt.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: "desc" },
        take: 1_000,
        select: { kind: true, scenarioId: true, correct: true, total: true, passed: true, result: true, createdAt: true },
      }),
    ]);
    return NextResponse.json(
      { attempts: recent.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), summary: summarizeAttempts(all) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError(request, "Failed to list practice attempts.", error, "Unable to load your practice history.");
  }
}
