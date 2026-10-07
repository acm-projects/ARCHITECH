import { useCallback, useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";

import { buildChallengeView } from "../../lib/architecture/challenge/view";
import { toCardResult } from "../challenge/cardResult";
import { urlShortenerChallenge, type Challenge } from "../challenge/challenges";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { useRunSession } from "./useRunSession";

// Challenge mode of a project: brief -> build -> submit -> score and feedback -> modify ->
// stale -> submit again. A submission is a run of the shared evaluation at the challenge's own
// traffic, in a session of its own, so it never shows in Learn and Learn's runs never show here.
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
  const runs = useRunSession({
    scopeKey,
    enabled,
    nodes,
    edges,
    initialTraffic: challenge.definition.traffic,
  });
  const { state, fingerprint, labels, run, reset: clearSubmission } = runs;

  // The brief shows until something has been submitted, and again on request.
  const [showBrief, setShowBrief] = useState(true);

  const view = useMemo(
    () => (enabled ? buildChallengeView(state, fingerprint, challenge.definition, labels) : null),
    [enabled, state, fingerprint, challenge, labels],
  );

  const submit = useCallback(() => {
    setShowBrief(false);
    run();
  }, [run]);
  const backToBrief = useCallback(() => setShowBrief(true), []);

  return {
    challenge,
    runs,
    view,
    // What the card shows: the brief, or the latest result.
    cardResult: !showBrief && view?.result ? toCardResult(view.result) : null,
    submit,
    backToBrief,
    // Forgets the submission (and the result before it). Reset also shows the brief again.
    clearSubmission,
  };
}
