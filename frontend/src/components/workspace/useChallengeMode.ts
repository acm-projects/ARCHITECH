import { useCallback, useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";

import { buildChallengeView } from "../../lib/architecture/challenge/view";
import { toCardResult } from "../challenge/cardResult";
import {
  urlShortenerChallenge,
  type Challenge,
} from "../challenge/challenges";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { useRunSession } from "./useRunSession";

// Controls everything that belongs specifically to Challenge mode.
//
// The flow is:
// brief -> build -> submit -> score/feedback -> edit -> result becomes stale -> submit again
//
// Challenge uses the same project canvas as Learn, but it gets its own run session.
// That keeps Challenge submissions/results separate from anything the user ran in Learn.
export function useChallengeMode({
  enabled,
  scopeKey,
  nodes,
  edges,
  challenge = urlShortenerChallenge,
}: {
  enabled: boolean;
  scopeKey: string | null;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  challenge?: Challenge;
}) {
  // Challenge uses the same evaluation system as Run Design, but starts with
  // the traffic requirements defined by this specific challenge.
  //
  // Its run session is separate from Learn, so results never leak between modes.
  const runs = useRunSession({
    scopeKey,
    enabled,
    nodes,
    edges,
    initialTraffic: challenge.definition.traffic,
  });

  const {
    state,
    fingerprint,
    labels,
    run,
    reset: clearSubmission,
  } = runs;

  // Start by showing the challenge requirements.
  // After Submit, the card switches from the brief to the latest result.
  const [showBrief, setShowBrief] = useState(true);

  // Turn the current run state into the Challenge-specific view.
  //
  // This is where the shared evaluation gets interpreted using the challenge's
  // requirements, so Challenge can decide the score, feedback, and whether an
  // old submission is stale after the architecture changes.
  const view = useMemo(
    () =>
      enabled
        ? buildChallengeView(
            state,
            fingerprint,
            challenge.definition,
            labels,
          )
        : null,
    [
      enabled,
      state,
      fingerprint,
      challenge,
      labels,
    ],
  );

  // Submit the architecture exactly as it looks now.
  // Hide the brief and run the shared evaluator for this Challenge session.
  const submit = useCallback(() => {
    setShowBrief(false);
    run();
  }, [run]);

  // Let the user look at the original challenge requirements again
  // without deleting their architecture or previous submission.
  const backToBrief = useCallback(() => {
    setShowBrief(true);
  }, []);

  // ArchitectureWorkspace gets the Challenge state/actions it needs for the card.
  return {
    challenge,
    runs,
    view,

    // While the brief is open we intentionally hide the result.
    // After Submit, convert the evaluator result into what ChallengeCard expects.
    cardResult:
      !showBrief && view?.result
        ? toCardResult(view.result)
        : null,

    submit,
    backToBrief,

    // Reset uses this to forget the previous submission/result.
    // The actual architecture reset is handled separately by ArchitectureWorkspace.
    clearSubmission,
  };
}