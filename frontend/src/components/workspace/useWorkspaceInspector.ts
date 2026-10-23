import { useCallback, useMemo, useReducer } from "react";

import { INITIAL_INSPECTOR_STATE, inspectorReducer, type InspectorSectionId } from "./inspectorState";

// Own presentation transitions here; graph selection and evaluation keep their existing owners.
export function useWorkspaceInspector({ selectedNodeIds, onClearSelection }: {
  selectedNodeIds: readonly string[];
  onClearSelection: () => void;
}) {
  const [state, dispatch] = useReducer(inspectorReducer, INITIAL_INSPECTOR_STATE);
  const selectionKey = selectedNodeIds.join("\0");
  const hasSelection = selectedNodeIds.length > 0;
  // Selection closes configuration; only an explicit Configure action opens it.
  // Adjust before rendering children so a new selection never flashes the old form.
  if (state.selectionKey !== selectionKey) dispatch({ type: "selection-changed", selectionKey });
  const inspectComponent = useCallback(() => dispatch({ type: "open-configure" }), []);
  const closeConfiguration = useCallback(() => dispatch({ type: "close-configure" }), []);
  const askArchie = useCallback(() => dispatch({ type: "open-archie" }), []);
  const closeArchie = useCallback(() => dispatch({ type: "close-archie" }), []);
  const openHistory = useCallback(() => dispatch({ type: "open-history" }), []);
  const closeHistory = useCallback(() => dispatch({ type: "close-history" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const openSection = useCallback((section: InspectorSectionId | null) => {
    onClearSelection();
    dispatch({ type: "open-section", section });
  }, [onClearSelection]);
  const toggleSection = useCallback((section: InspectorSectionId) => {
    onClearSelection();
    dispatch({ type: "toggle-section", section, hasSelection });
  }, [hasSelection, onClearSelection]);
  const showResults = useCallback((run: () => void) => {
    openSection("run");
    run();
  }, [openSection]);
  const nodeActions = useMemo(() => ({
    archieOpen: state.archieOpen,
    configuring: state.configuring,
    inspectComponent,
    askArchie,
  }), [state.archieOpen, state.configuring, inspectComponent, askArchie]);

  return {
    ...state,
    inspectComponent,
    closeConfiguration,
    askArchie,
    closeArchie,
    openHistory,
    closeHistory,
    reset,
    openSection,
    toggleSection,
    showResults,
    nodeActions,
  };
}

export type WorkspaceInspectorController = ReturnType<typeof useWorkspaceInspector>;
