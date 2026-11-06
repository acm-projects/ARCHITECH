import type { ExplanationSource } from "../archie/contract.ts";
import type { RunState } from "../evaluation/runSession.ts";
import type { ChallengeDefinition, ChallengeEvaluation } from "./contract.ts";
import { judgeChallenge } from "./evaluate.ts";

// A challenge attempt is a submission of the design, run like Run Design: the design is
// copied when submitted, the latest result is kept, and editing afterwards makes it out of
// date until the design is submitted again. The submission lifecycle is the run session in
// evaluation/runSession (with the challenge's own traffic); this turns its state into what a
// challenge screen needs. Nothing here is saved.
//
// BACKEND: attempts, scores and the best score would be stored per user and challenge.

export type ChallengePhase = "building" | "evaluating" | "results" | "error";

export type ScoreChange = {
  before: number;
  after: number;
  delta: number;
  direction: "improved" | "regressed" | "unchanged";
};

export type ChallengeView = {
  // building: nothing submitted yet. evaluating: a submission is being judged. results: there is
  // a result (check isStale). error: the latest submission failed.
  phase: ChallengePhase;
  // Submitting is allowed, unless one is in progress.
  canSubmit: boolean;
  isRunning: boolean;
  hasResult: boolean;
  // The design has changed since the result was produced.
  isStale: boolean;
  error: string | null;
  // The latest successful submission, and the one before it.
  result: ChallengeEvaluation | null;
  previousResult: ChallengeEvaluation | null;
  scoreChange: ScoreChange | null;
};

// `liveFingerprint` identifies the design and the challenge's traffic as they are now.
export function buildChallengeView(
  state: RunState,
  liveFingerprint: string,
  challenge: ChallengeDefinition,
  labels?: ExplanationSource["labels"],
): ChallengeView {
  const isRunning = state.status === "analyzing";
  const current = state.current;
  const result = current ? judgeChallenge(challenge, current.evaluation, labels) : null;
  const previousResult = state.previous ? judgeChallenge(challenge, state.previous.evaluation, labels) : null;

  const scoreChange =
    result && previousResult
      ? {
          before: previousResult.score.score,
          after: result.score.score,
          delta: result.score.score - previousResult.score.score,
          direction:
            result.score.score > previousResult.score.score
              ? ("improved" as const)
              : result.score.score < previousResult.score.score
                ? ("regressed" as const)
                : ("unchanged" as const),
        }
      : null;

  return {
    phase: state.status === "error" ? "error" : isRunning ? "evaluating" : current ? "results" : "building",
    canSubmit: !isRunning,
    isRunning,
    hasResult: current !== null,
    isStale: current !== null && current.fingerprint !== liveFingerprint,
    error: state.status === "error" ? (state.error?.message ?? "The submission failed.") : null,
    result,
    previousResult,
    scoreChange,
  };
}
