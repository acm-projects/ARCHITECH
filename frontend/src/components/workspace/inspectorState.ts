export type InspectorSectionId = "run";
// Each right panel opens and closes on its own, so any combination can show at once.
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
  | { type: "toggle-section"; section: InspectorSectionId }
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
      return { ...state, section: action.section };
    case "toggle-section":
      return { ...state, section: state.section === action.section ? null : action.section };
    case "open-archie":
      return { ...state, archieOpen: true };
    case "close-archie":
      return { ...state, archieOpen: false };
    case "open-history":
      return { ...state, historyOpen: true };
    case "close-history":
      return { ...state, historyOpen: false };
    case "selection-changed":
      if (state.selectionKey === action.selectionKey) return state;
      return { ...state, selectionKey: action.selectionKey, configuring: Boolean(action.selectionKey) && !action.selectionKey.includes("\0") };
    case "open-configure":
      if (!state.selectionKey) return state;
      return { ...state, configuring: true };
    case "close-configure":
      return state.configuring ? { ...state, configuring: false } : state;
    case "reset":
      return INITIAL_INSPECTOR_STATE;
  }
}
