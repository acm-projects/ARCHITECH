"use client"

// Metrics is the detailed readout. Traffic setup, findings and comparisons belong to Run.

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import { RunMetrics, RunNotices } from "./RunResults"

type MetricsPanelProps = {
  view: ResultsView
  liveTraffic: TrafficProfile
  onRun: () => void
  onOpenRun: () => void
}
export default function MetricsPanel({
  view,
  liveTraffic,
  onRun,
  onOpenRun,
}: MetricsPanelProps) {
  return (
    <div
      className="ax-review"
      aria-live="polite"
      data-run-state={view.runButtonState}
    >
      <div
        className="ax-review-scroll"
        role="region"
        aria-label="Metric details"
        tabIndex={0}
      >
        <RunNotices view={view} onRun={onRun} liveTraffic={liveTraffic} />
        {view.result ? (
          <RunMetrics result={view.result} />
        ) : (
          !view.isRunning &&
          !view.error && (
            <p className="ax-review-content ax-card-label">
              Run a test to see system metrics.
            </p>
          )
        )}
      </div>
      <div className="ax-review-footer">
        <button
          type="button"
          className="ax-review-configure"
          onClick={onOpenRun}
        >
          Open Run
        </button>
      </div>
    </div>
  )
}
