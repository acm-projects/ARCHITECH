import type { ChallengeEvaluation } from "../../lib/architecture/challenge/contract.ts";

export type FindingSeverity = "good" | "suggestion" | "warning";

export type Finding = {
  severity: FindingSeverity;
  title: string;
  explanation: string;
};

// What the challenge card displays: four bars, an overall score and a short list of findings.
export type Evaluation = {
  scalability: number;
  reliability: number;
  latency: number;
  costEfficiency: number;
  overallScore: number;
  // Most important first (warnings, suggestions, then good observations).
  findings: Finding[];
};

const MAX_IMPROVEMENTS = 2;

// The shape the challenge card already displays, filled from a challenge evaluation: the
// overall score is the challenge score, the four bars are the architecture evaluation's
// scores (performance is shown as "Latency"), and the listed findings are first the
// requirements that failed, then what to improve, then what is going well.
export function toCardResult(result: ChallengeEvaluation): Evaluation {
  const { architectureEvaluation, feedback, score } = result;
  const findings: Finding[] = [
    ...feedback.failedRequirements.map(
      (failed): Finding => ({ severity: "warning", title: failed.label, explanation: failed.explanation }),
    ),
    ...feedback.improvements.slice(0, MAX_IMPROVEMENTS).map(
      (improvement): Finding => ({
        severity: "suggestion",
        title: improvement.reason,
        explanation: improvement.tradeoff ? `${improvement.text} ${improvement.tradeoff}` : improvement.text,
      }),
    ),
    ...result.requirementResults
      .filter((requirement) => requirement.passed)
      .map((requirement): Finding => ({ severity: "good", title: requirement.label, explanation: requirement.explanation })),
  ];

  return {
    scalability: architectureEvaluation.scores.scalability,
    reliability: architectureEvaluation.scores.reliability,
    latency: architectureEvaluation.scores.performance,
    costEfficiency: architectureEvaluation.scores.costEfficiency,
    overallScore: score.score,
    findings,
  };
}
