import type { LeaderboardEntry } from "./submissions.ts";

// The browser side of /api/challenges/[challengeId]/...

export type OfficialResult =
  | { status: "pending" }
  | { status: "graded"; score: number; passed: boolean; best: number; rank: number | null; participants: number }
  | { status: "failed"; message: string };

export type Leaderboard = { title: string; top: LeaderboardEntry[]; me: LeaderboardEntry | null; participants: number };

export async function submitToServer(challengeId: string, graph: unknown, projectId?: string): Promise<OfficialResult> {
  try {
    const response = await fetch(`/api/challenges/${encodeURIComponent(challengeId)}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph, ...(projectId ? { projectId } : {}) }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      submission?: { score: number; passed: boolean };
      best?: number;
      rank?: number | null;
      participants?: number;
    };
    if (!response.ok || !body.submission) {
      return { status: "failed", message: body.error ?? "Your submission could not be recorded. Your local result is shown." };
    }
    return {
      status: "graded",
      score: body.submission.score,
      passed: body.submission.passed,
      best: body.best ?? body.submission.score,
      rank: body.rank ?? null,
      participants: body.participants ?? 0,
    };
  } catch {
    return { status: "failed", message: "You're offline, so this submission was not recorded. Your local result is shown." };
  }
}

export async function fetchLeaderboard(challengeId: string, signal?: AbortSignal): Promise<Leaderboard | null> {
  try {
    const response = await fetch(`/api/challenges/${encodeURIComponent(challengeId)}/leaderboard`, { signal, cache: "no-store" });
    return response.ok ? ((await response.json()) as Leaderboard) : null;
  } catch {
    return null;
  }
}
