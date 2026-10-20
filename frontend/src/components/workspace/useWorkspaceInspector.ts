import { useCallback, useMemo, useReducer } from "react";

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView";
import { INITIAL_INSPECTOR_STATE, inspectorReducer, inspectorRunAction, type InspectorSectionId } from "./inspectorState";

// Own presentation transitions here; graph selection and evaluation keep their existing owners.
export function useWorkspaceInspector({ hasSelection, onClearSelection }: {
  hasSelection: boolean;
  onClearSelection: () => void;
}) {
  const [state, dispatch] = useReducer(inspectorReducer, INITIAL_INSPECTOR_STATE);
  const askArchie = useCallback(() => dispatch({ type: "open-archie" }), []);
  const closeArchie = useCallback(() => dispatch({ type: "close-archie" }), []);
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
    openSection("metrics");
    run();
  }, [openSection]);
  const runDesign = (view: Pick<ResultsView, "isRunning" | "hasResult">, run: () => void) => {
    switch (inspectorRunAction(state, { ...view, hasSelection })) {
      case "ignore": return;
      case "configure": openSection("stress"); return;
      case "run": showResults(run);
    }
  };
  const nodeActions = useMemo(() => ({
    archieOpen: state.archieOpen,
    inspectComponent: closeArchie,
    askArchie,
  }), [state.archieOpen, closeArchie, askArchie]);

  return { ...state, askArchie, closeArchie, reset, openSection, toggleSection, showResults, runDesign, nodeActions };
}

export type WorkspaceInspectorController = ReturnType<typeof useWorkspaceInspector>;
