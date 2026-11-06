import type { RunState } from "../evaluation/runSession.ts";
import { explainComparison } from "./comparison.ts";
import type { ComparisonExplanation, ExplanationSource, SystemExplanation } from "./contract.ts";
import { buildSystemExplanation, explainFindings } from "./explain.ts";
import { NO_RESULT_MESSAGE, explainNode, type NodeExplanation } from "./node.ts";

// What a screen needs to show Archie, from a run session. Plain data. It decides what Archie
// can say (nothing, about the current design, or about an earlier run) and leaves how to show
// it to the screen.

export const STALE_NOTICE =
  "This explanation is based on your previous run. Run again to analyze your latest changes.";

export type ArchieView = {
  // unavailable: no run to explain. current: explains the design as it is now. stale: explains
  // the last run, and the design has changed since.
  status: "unavailable" | "current" | "stale";
  isStale: boolean;
  // A run is in progress (the explanation shown, if any, is of the previous one).
  isRunning: boolean;
  // The latest run failed. Any earlier result is still explained.
  error: string | null;
  // What to tell the user when there is nothing to explain.
  message: string | null;
  // Set exactly when the explanation is of an earlier run than the current design.
  staleNotice: string | null;
  explanation: SystemExplanation | null;
  // Latest run against the one before it, when there are two.
  comparison: ComparisonExplanation | null;
  // What the explanation was built from, so questions about one component can be answered.
  source: ExplanationSource | null;
};

// `labels` are the components' current names, by id (see components.ts).
export function buildArchieView(
  state: RunState,
  liveFingerprint: string,
  labels?: ExplanationSource["labels"],
): ArchieView {
  const current = state.current;
  const isRunning = state.status === "analyzing";
  const error = state.status === "error" ? (state.error?.message ?? "The evaluation failed.") : null;

  if (!current) {
    return {
      status: "unavailable",
      isStale: false,
      isRunning,
      error,
      message: NO_RESULT_MESSAGE,
      staleNotice: null,
      explanation: null,
      comparison: null,
      source: null,
    };
  }

  const isStale = current.fingerprint !== liveFingerprint;
  const source: ExplanationSource = { evaluation: current.evaluation, labels };
  return {
    status: isStale ? "stale" : "current",
    isStale,
    isRunning,
    error,
    message: null,
    staleNotice: isStale ? STALE_NOTICE : null,
    explanation: buildSystemExplanation(source),
    comparison: state.previous
      ? explainComparison(state.previous.evaluation, current.evaluation, labels)
      : null,
    source,
  };
}

// Archie's answer about one component, from the same run the view explains.
export function explainNodeInView(view: ArchieView, nodeId: string): NodeExplanation & { stale: boolean } {
  const answer = explainNode(
    view.source,
    nodeId,
    view.source ? view.explanation?.explanations ?? explainFindings(view.source) : undefined,
  );
  return { ...answer, stale: view.isStale };
}
