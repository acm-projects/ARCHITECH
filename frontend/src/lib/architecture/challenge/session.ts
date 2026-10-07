import { evaluateDesign, type EvaluateDesign } from "../evaluation/evaluationService.ts";
import { fingerprintEvaluationInput } from "../evaluation/fingerprint.ts";
import { createRunSession, type RunInput } from "../evaluation/runSession.ts";
import type { ChallengeDefinition } from "./contract.ts";

// Submitting a design for a challenge is a run of the architecture evaluation at the
// challenge's own traffic, so it gets the same guarantees as Run Design: the design is copied
// when submitted, a second submission is blocked while one is in progress, a failed one keeps
// the last result, and a late answer from an earlier submission is ignored. One session
// belongs to one attempt in one screen; nothing is shared with the free workspace or Learn.
export function createChallengeSession(
  challenge: ChallengeDefinition,
  evaluate: EvaluateDesign = evaluateDesign,
) {
  const session = createRunSession(evaluate);
  return {
    getState: session.getState,
    subscribe: session.subscribe,
    reset: session.reset,
    // Returns null (and does nothing) while a submission is in progress.
    submit(input: Pick<RunInput, "nodes" | "edges">): Promise<void> | null {
      return session.run({
        projectId: `challenge:${challenge.id}`,
        nodes: input.nodes,
        edges: input.edges,
        traffic: challenge.traffic,
      });
    },
  };
}

// Identity of a design as the challenge sees it, to tell whether a result is still current.
export const challengeFingerprint = (
  challenge: ChallengeDefinition,
  graph: { nodes: unknown; edges: unknown },
) => fingerprintEvaluationInput({ graph, traffic: challenge.traffic });
