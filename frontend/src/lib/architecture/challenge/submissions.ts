import { fingerprintEvaluationInput } from "../evaluation/fingerprint.ts";
import type { ChallengeDefinition } from "./contract.ts";
import { evaluateChallenge } from "./evaluate.ts";

// Server-side challenge grading and the leaderboard. The server grades the submitted design
// itself with the same evaluator the app uses, so a score cannot be faked from the browser.

export const SUBMISSIONS_PER_HOUR = 30;
export const LEADERBOARD_SIZE = 10;

export type GradedSubmission = {
  fingerprint: string;
  score: number;
  passed: boolean;
  requirementScore: number;
  architectureScore: number;
  metrics: { p95LatencyMs: number; monthlyCost: number; capacityRps: number | null; uptimePercent: number; components: number };
  failedRequirements: string[];
};

export function gradeSubmission(challenge: ChallengeDefinition, graph: { nodes: unknown[]; edges: unknown[] }): GradedSubmission {
  const result = evaluateChallenge({ challenge, graph: graph as never });
  const { metrics } = result.architectureEvaluation;
  return {
    fingerprint: fingerprintEvaluationInput({ graph, traffic: challenge.traffic }),
    score: result.score.score,
    passed: result.score.passed,
    requirementScore: result.score.requirementScore,
    architectureScore: result.score.architectureScore,
    metrics: {
      p95LatencyMs: Math.round(metrics.p95LatencyMs * 10) / 10,
      monthlyCost: Math.round(metrics.estimatedMonthlyCost),
      capacityRps: metrics.capacityRps === null ? null : Math.round(metrics.capacityRps),
      uptimePercent: metrics.uptimeAvailability,
      components: graph.nodes.length,
    },
    failedRequirements: result.requirementResults.filter((r) => !r.passed).map((r) => r.requirementId),
  };
}

// "Shivam Singh" -> "Shivam S.", so the leaderboard does not show full names or emails.
export function displayName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  const first = parts[0].slice(0, 24);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
}

export type BestSubmission = { userId: string; name: string | null; score: number; passed: boolean; metrics: GradedSubmission["metrics"]; createdAt: Date };

export type LeaderboardEntry = { rank: number; name: string; score: number; passed: boolean; p95LatencyMs: number; monthlyCost: number; you: boolean };

// Each user's best submission, ranked by score; ties go to whoever reached it first. Pure.
export function rankBest(best: readonly BestSubmission[], userId: string, size = LEADERBOARD_SIZE) {
  const sorted = [...best].sort((a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime());
  const entries: LeaderboardEntry[] = sorted.map((entry, index) => ({
    rank: index + 1,
    name: displayName(entry.name),
    score: entry.score,
    passed: entry.passed,
    p95LatencyMs: entry.metrics.p95LatencyMs,
    monthlyCost: entry.metrics.monthlyCost,
    you: entry.userId === userId,
  }));
  return { top: entries.slice(0, size), me: entries.find((entry) => entry.you) ?? null, participants: entries.length };
}

// Picks each user's best from all submissions (highest score, then earliest). Pure.
export function bestPerUser(submissions: readonly BestSubmission[]): BestSubmission[] {
  const best = new Map<string, BestSubmission>();
  for (const submission of submissions) {
    const current = best.get(submission.userId);
    if (!current || submission.score > current.score || (submission.score === current.score && submission.createdAt < current.createdAt)) {
      best.set(submission.userId, submission);
    }
  }
  return [...best.values()];
}
