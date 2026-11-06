// A learner's practice history, summarized: are their predictions getting better, which kinds of
// question they get wrong, which incident scenarios they have passed. Pure.

export const PRACTICE_ATTEMPTS_PER_HOUR = 120;
export const ATTEMPT_KINDS = ["prediction", "incident"] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export type AttemptRow = {
  kind: string;
  scenarioId: string | null;
  correct: number;
  total: number;
  passed: boolean;
  // Graded answers of a prediction: [{ question, correct }].
  result: unknown;
  createdAt: Date;
};

const RECENT = 10;

export function summarizeAttempts(rows: readonly AttemptRow[]) {
  const newestFirst = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const predictions = newestFirst.filter((row) => row.kind === "prediction");
  const accuracy = (list: readonly AttemptRow[]) => {
    const total = list.reduce((sum, row) => sum + row.total, 0);
    return total === 0 ? null : Math.round((list.reduce((sum, row) => sum + row.correct, 0) / total) * 100);
  };
  const byQuestion: Record<string, { correct: number; total: number }> = {};
  for (const row of predictions) {
    const answers = (row.result as { answers?: { question?: unknown; correct?: unknown }[] } | null)?.answers ?? [];
    for (const answer of answers) {
      if (typeof answer.question !== "string") continue;
      const entry = (byQuestion[answer.question] ??= { correct: 0, total: 0 });
      entry.total += 1;
      if (answer.correct === true) entry.correct += 1;
    }
  }
  const incidents = newestFirst.filter((row) => row.kind === "incident");
  return {
    predictions: {
      attempts: predictions.length,
      // Percent of answers right, over everything and over the last 10 attempts.
      accuracy: accuracy(predictions),
      recentAccuracy: accuracy(predictions.slice(0, RECENT)),
      earlierAccuracy: predictions.length > RECENT ? accuracy(predictions.slice(RECENT)) : null,
      byQuestion,
    },
    incidents: {
      attempts: incidents.length,
      passedScenarios: [...new Set(incidents.filter((row) => row.passed && row.scenarioId).map((row) => row.scenarioId as string))].sort(),
    },
  };
}
