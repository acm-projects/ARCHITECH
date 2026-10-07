import { toSnapshot, snapshotKey } from "./graphHistory.ts";
import type { EdgeLike, NodeLike } from "./nodeOperations.ts";

// What Reset does, in each mode. Reset always means "back to the mode's starting state":
//
//   workspace  The starter architecture (Client, API Server, Database). A canvas that already
//              is the starter does nothing. Replacing a design asks first, because after a
//              reload the old design cannot be brought back; it can be undone until then.
//   learn      An empty canvas and a fresh lesson (history and attempts forgotten).
//   challenge  An empty canvas, the submission cleared, and the brief shown again.
//
// The graph change is one history step, so undo restores the design (the lesson follows the
// restored design by itself; a cleared challenge submission stays cleared).

export type ResetMode = "workspace" | "learn" | "challenge";

export type ResetPlan = {
  // The canvas would change, so it should be replaced by the starting state.
  changesGraph: boolean;
  // Replacing the canvas throws away a design someone built, so ask first.
  needsConfirmation: boolean;
  // The lesson or the submission should be cleared whether or not the canvas changes.
  resetsSession: boolean;
};

type Graph = { nodes: readonly NodeLike[]; edges: readonly EdgeLike[] };

export function planReset(mode: ResetMode, current: Graph, starting: Graph): ResetPlan {
  const changesGraph =
    snapshotKey(toSnapshot(current.nodes, current.edges)) !==
    snapshotKey(toSnapshot(starting.nodes, starting.edges));
  return {
    changesGraph,
    // Only the free workspace is a place work is kept; an empty canvas has nothing to lose.
    needsConfirmation: mode === "workspace" && changesGraph && current.nodes.length > 0,
    resetsSession: mode !== "workspace",
  };
}

// What a Reset does to everything around the canvas. Kept separate from the React layer so the
// rule is testable: whatever analysis belonged to the design that was thrown away must go with
// it, in every mode, whether or not the canvas itself changed.
export type ResetEffects = {
  // Puts the starting state on the canvas as one history step and clears the selection.
  replaceGraph: () => void;
  // Nothing on the canvas changed, but a selection may still be cleared.
  clearSelection: () => void;
  // Forgets the current result, the previous result used for comparison, a run in progress
  // and any stress-test load, so no analysis of the old design stays visible.
  clearAnalysis: () => void;
  // Learn: start the lesson over.
  restartLesson: () => void;
  // Challenge: clear the submission and show the brief again.
  showBrief: () => void;
};

export function applyReset(mode: ResetMode, plan: ResetPlan, effects: ResetEffects): void {
  if (plan.changesGraph) effects.replaceGraph();
  else effects.clearSelection();
  effects.clearAnalysis();
  if (mode === "learn") effects.restartLesson();
  if (mode === "challenge") effects.showBrief();
}
