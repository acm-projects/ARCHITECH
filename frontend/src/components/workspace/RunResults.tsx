import type { ResultsView } from "../../lib/architecture/evaluation/resultsView";
import { PanelAction, PanelActions, PanelText } from "./panel/Panel";

// What the Simulation panel says about a run beyond its numbers, which Live estimates already
// show: that it failed (with a retry), or that no request reaches a component.
export function RunNotices({ view, onRun }: { view: ResultsView; onRun: () => void }) {
  const { result } = view;
  if (!view.error && result?.ready !== false) return null;

  return (
    <>
      {view.error && (
        <PanelText role="alert" tone="danger">
          Analysis failed: {view.error}
          {view.hasResult ? " Showing the last completed analysis." : ""}
        </PanelText>
      )}
      {result && !result.ready && <PanelText>No request reaches a component yet.</PanelText>}
      {view.error && (
        <PanelActions>
          <PanelAction onClick={onRun} disabled={!view.canRun}>Retry</PanelAction>
        </PanelActions>
      )}
    </>
  );
}
