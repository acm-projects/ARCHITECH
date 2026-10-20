import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { challengeDefinition } from "@/lib/architecture/challenge/catalog";
import { bestSubmissions } from "@/lib/architecture/challenge/leaderboardStore";
import { rankBest } from "@/lib/architecture/challenge/submissions";
import { serverError } from "@/lib/server/log";

// GET /api/challenges/[challengeId]/leaderboard: the top 10 users by their best server-graded
// score (ties: first to reach it), and the signed-in user's own best and rank.
// 200 { challengeId, title, top: [{ rank, name, score, passed, p95LatencyMs, monthlyCost, you }],
//       me, participants } · 401 not signed in · 404 unknown challenge.
// Names are shown as "First L." only.
type Context = { params: Promise<{ challengeId: string }> };

export async function GET(request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { challengeId } = await params;
  const challenge = challengeDefinition(challengeId);
  if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  try {
    const ranking = rankBest(await bestSubmissions(challengeId), userId);
    return NextResponse.json({ challengeId, title: challenge.title, ...ranking }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(request, "Failed to load a leaderboard.", error, "Unable to load the leaderboard.");
  }
}
