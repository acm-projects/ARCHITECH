import type { RunResult } from "../../lib/architecture/evaluation/runSession.ts";

export type InspectorSectionId = "metrics" | "run";
export type InspectorState = {
  section: InspectorSectionId | null;
  archieOpen: boolean;
  historyOpen: boolean;
  selectionKey: string;
  configuring: boolean;
};

export const INITIAL_INSPECTOR_STATE: InspectorState = {
  section: null,
  archieOpen: false,
  historyOpen: false,
  selectionKey: "",
  configuring: false,
};

type InspectorAction =
  | { type: "open-section"; section: InspectorSectionId | null }
  | { type: "toggle-section"; section: InspectorSectionId; hasSelection: boolean }
  | { type: "open-archie" }
  | { type: "close-archie" }
  | { type: "open-history" }
  | { type: "close-history" }
  | { type: "selection-changed"; selectionKey: string }
  | { type: "open-configure" }
  | { type: "close-configure" }
  | { type: "reset" };

export function inspectorReducer(state: InspectorState, action: InspectorAction): InspectorState {
  switch (action.type) {
    case "open-section":
      return { ...state, section: action.section, archieOpen: false, historyOpen: false, configuring: false };
    case "toggle-section":
      return {
        ...state,
        section: !state.archieOpen && !state.historyOpen && !action.hasSelection && state.section === action.section ? null : action.section,
        archieOpen: false,
        historyOpen: false,
        configuring: false,
      };
    case "open-archie":
      return { ...state, archieOpen: true, historyOpen: false, configuring: false };
    case "close-archie":
      return { ...state, archieOpen: false };
    case "open-history":
      return { ...state, archieOpen: false, historyOpen: true, configuring: false };
    case "close-history":
      return { ...state, historyOpen: false };
    case "selection-changed":
      if (state.selectionKey === action.selectionKey) return state;
      return { ...state, selectionKey: action.selectionKey, configuring: false };
    case "open-configure":
      if (!state.selectionKey) return state;
      return { ...state, configuring: true, archieOpen: false, historyOpen: false };
    case "close-configure":
      return state.configuring ? { ...state, configuring: false } : state;
    case "reset":
      return INITIAL_INSPECTOR_STATE;
  }
}

export type ReviewView = "overview" | "settings" | "comparison";
export type ReviewSelection = { run: RunResult | null; view: ReviewView };

// Stale projections and failed retries still belong to the same completed run.
export function reviewViewForRun(selection: ReviewSelection, run: RunResult | null): ReviewView {
  return selection.run === run ? selection.view : run ? "overview" : "settings";
}
