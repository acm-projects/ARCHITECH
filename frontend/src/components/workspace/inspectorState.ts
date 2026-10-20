import type { RunResult } from "../../lib/architecture/evaluation/runSession.ts";

export type InspectorSectionId = "metrics";
export type InspectorState = {
  section: InspectorSectionId | null;
  archieOpen: boolean;
};

export const INITIAL_INSPECTOR_STATE: InspectorState = { section: "metrics", archieOpen: false };

type InspectorAction =
  | { type: "open-section"; section: InspectorSectionId | null }
  | { type: "toggle-section"; section: InspectorSectionId; hasSelection: boolean }
  | { type: "open-archie" }
  | { type: "close-archie" }
  | { type: "reset" };

export function inspectorReducer(state: InspectorState, action: InspectorAction): InspectorState {
  switch (action.type) {
    case "open-section":
      return { section: action.section, archieOpen: false };
    case "toggle-section":
      return {
        section: !state.archieOpen && !action.hasSelection && state.section === action.section ? null : action.section,
        archieOpen: false,
      };
    case "open-archie":
      return { ...state, archieOpen: true };
    case "close-archie":
      return { ...state, archieOpen: false };
    case "reset":
      return INITIAL_INSPECTOR_STATE;
  }
}

export type ReviewView = "overview" | "metrics" | "comparison" | "live";
export type ReviewSelection = { run: RunResult | null; view: ReviewView };

// Stale projections and failed retries still belong to the same completed run.
export function reviewViewForRun(selection: ReviewSelection, run: RunResult | null): ReviewView {
  return selection.run === run ? selection.view : run ? "overview" : "live";
}
