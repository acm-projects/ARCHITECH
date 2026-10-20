import { prisma } from "../../prisma";
import type { BestSubmission, GradedSubmission } from "./submissions";

// Each user's best submission to a challenge (highest score, then earliest), with their name.
export async function bestSubmissions(challengeId: string): Promise<BestSubmission[]> {
  const rows = await prisma.$queryRaw<{ user_id: string; name: string | null; score: number; passed: boolean; metrics: GradedSubmission["metrics"]; created_at: Date }[]>`
    SELECT best.user_id, u.name, best.score, best.passed, best.metrics, best.created_at
    FROM (
      SELECT DISTINCT ON (user_id) user_id, score, passed, metrics, created_at
      FROM challenge_submissions
      WHERE challenge_id = ${challengeId}
      ORDER BY user_id, score DESC, created_at ASC
    ) AS best
    JOIN users u ON u.id = best.user_id`;
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    score: Number(row.score),
    passed: row.passed,
    metrics: row.metrics,
    createdAt: row.created_at,
  }));
}
