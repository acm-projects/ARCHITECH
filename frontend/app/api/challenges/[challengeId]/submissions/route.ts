import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { challengeDefinition } from "@/lib/architecture/challenge/catalog";
import { bestSubmissions } from "@/lib/architecture/challenge/leaderboardStore";
import { SUBMISSIONS_PER_HOUR, gradeSubmission, rankBest } from "@/lib/architecture/challenge/submissions";
import { prisma } from "@/lib/prisma";
import { isValidProjectId, validateGraph } from "@/lib/projects/projectPayload";
import { serverError } from "@/lib/server/log";

// Challenge submissions, graded on the server.
//   POST body { graph, projectId? }: grades the design at the challenge's traffic with the app's
//        evaluator and stores it. 201 { submission, best, rank, participants }.
//        400 invalid graph · 404 unknown challenge · 429 more than 30 submissions an hour.
//   GET  200 { submissions }: the signed-in user's last 20 submissions, newest first.
// 401 not signed in.

type Context = { params: Promise<{ challengeId: string }> };

const SUBMISSION_SELECT = {
  id: true,
  score: true,
  passed: true,
  requirementScore: true,
  architectureScore: true,
  metrics: true,
  createdAt: true,
} as const;

export async function POST(request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { challengeId } = await params;
  const challenge = challengeDefinition(challengeId);
  if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const raw = (typeof body === "object" && body !== null ? body : {}) as { graph?: unknown; projectId?: unknown };
  const unknown = Object.keys(raw).find((key) => key !== "graph" && key !== "projectId");
  if (unknown) return NextResponse.json({ error: `Unknown field "${unknown}".` }, { status: 400 });
  const graph = validateGraph(raw.graph);
  if (!graph.ok) return NextResponse.json({ error: graph.error }, { status: 400 });
  if (raw.projectId !== undefined && (typeof raw.projectId !== "string" || !isValidProjectId(raw.projectId))) {
    return NextResponse.json({ error: "projectId must be a project id." }, { status: 400 });
  }

  try {
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const recent = await prisma.challengeSubmission.findMany({
      where: { userId, createdAt: { gte: hourAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (recent.length >= SUBMISSIONS_PER_HOUR) {
      const wait = Math.max(1, Math.ceil((recent[recent.length - SUBMISSIONS_PER_HOUR].createdAt.getTime() + 60 * 60_000 - Date.now()) / 1000));
      return NextResponse.json(
        { error: `You can submit ${SUBMISSIONS_PER_HOUR} times an hour. Try again in ${Math.ceil(wait / 60)} minutes.` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }

    const graded = gradeSubmission(challenge, graph.value);
    const row = await prisma.challengeSubmission.create({
      data: {
        userId,
        challengeId,
        projectId: (raw.projectId as string | undefined) ?? null,
        graph: graph.value as unknown as Prisma.InputJsonValue,
        fingerprint: graded.fingerprint,
        score: graded.score,
        passed: graded.passed,
        requirementScore: graded.requirementScore,
        architectureScore: graded.architectureScore,
        metrics: graded.metrics as unknown as Prisma.InputJsonValue,
      },
      select: SUBMISSION_SELECT,
    });
    const ranking = rankBest(await bestSubmissions(challengeId), userId);
    return NextResponse.json(
      {
        submission: { ...row, createdAt: row.createdAt.toISOString(), failedRequirements: graded.failedRequirements },
        best: ranking.me?.score ?? graded.score,
        rank: ranking.me?.rank ?? null,
        participants: ranking.participants,
      },
      { status: 201 },
    );
  } catch (error) {
    return serverError(request, "Failed to grade a challenge submission.", error, "Unable to submit right now. Please try again.");
  }
}

export async function GET(request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { challengeId } = await params;
  if (!challengeDefinition(challengeId)) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  try {
    const rows = await prisma.challengeSubmission.findMany({
      where: { userId, challengeId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: SUBMISSION_SELECT,
    });
    return NextResponse.json(
      { submissions: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError(request, "Failed to list challenge submissions.", error, "Unable to load your submissions.");
  }
}
