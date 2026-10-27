"use client"

import { useLayoutEffect, useRef, useState } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { RunResult } from "../../lib/architecture/evaluation/runSession"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import {
  reviewViewForRun,
  type ReviewSelection,
  type ReviewView,
} from "./inspectorState"
import {
  RunComparison,
  RunFindings,
  RunNotices,
  RunMetrics,
  RunSummary,
} from "./RunResults"
import StressTestPanel from "./StressTestPanel"

type RunPanelProps = {
  view: ResultsView
  completedRun: RunResult | null
  traffic: TrafficProfile
  onRateChange: (rate: number) => void
  onRun: () => void
  onRunAtRate: (rate: number) => void
  componentName: (id: string) => string
}

export default function RunPanel(props: RunPanelProps) {
  const { view, completedRun, traffic } = props
  const { result, comparison } = view
  const viewPicker = useRef<HTMLSelectElement>(null)
  const details = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<ReviewSelection>(() => ({
    run: completedRun,
    view: completedRun ? "overview" : "settings",
  }))
  // Edits preserve the chosen view; a completed test opens its summary.
  const activeView = reviewViewForRun(selection, completedRun)
  useLayoutEffect(() => {
    details.current?.scrollTo({ top: 0 })
  }, [activeView, completedRun])
  const selectView = (next: ReviewView) => {
    // Footer shortcuts can disappear in the selected view. Keep focus on its picker.
    viewPicker.current?.focus()
    setSelection({ run: completedRun, view: next })
  }
  const startRun = (action: () => void) => {
    // The traffic form is hidden after a run, so focus stays on the persistent picker.
    viewPicker.current?.focus()
    action()
  }

  return (
    <div
      className="ax-review"
      aria-live="polite"
      data-run-state={view.runButtonState}
    >
      <label className="ax-review-view">
        <span className="sr-only">Run view</span>
        <select
          ref={viewPicker}
          className="ax-field"
          aria-label="Run view"
          value={activeView}
          onChange={(event) => selectView(event.target.value as ReviewView)}
        >
          <option value="settings">Traffic</option>
          <option value="overview" disabled={!result}>
            Last run
          </option>
          <option value="metrics" disabled={!result}>Metrics</option>
          <option value="comparison" disabled={!result}>
            Compare runs
          </option>
        </select>
      </label>
      <div
        ref={details}
        className="ax-review-scroll"
        role="region"
        aria-label="Run details"
        tabIndex={0}
      >
        <RunNotices
          view={view}
          onRun={() => startRun(props.onRun)}
          liveTraffic={traffic}
        />
        {/* Keep the form mounted so inspecting a result preserves its current input. */}
        <div hidden={activeView !== "settings"}>
          <StressTestPanel
            traffic={traffic}
            embedded
            runLabel="Run"
            running={view.isRunning}
            onRateChange={props.onRateChange}
            onRun={() => startRun(props.onRun)}
            onRunAtRate={(rate) => startRun(() => props.onRunAtRate(rate))}
          />
        </div>
        {result && (
          <>
            <div hidden={activeView !== "overview"}>
              <RunSummary result={result} />
              <RunFindings
                result={result}
                componentName={props.componentName}
              />
            </div>
            <div hidden={activeView !== "metrics"}>
              <RunMetrics result={result} />
            </div>
            <div
              hidden={activeView !== "comparison"}
              className="ax-review-content"
            >
              {comparison ? (
                <RunComparison comparison={comparison} />
              ) : (
                <p className="ax-card-label">
                  Run another test to compare it with this one.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {result && (
        <div className="ax-review-footer">
          {activeView !== "settings" && (
            <button
              type="button"
              className="ax-review-configure"
              onClick={() => selectView("settings")}
            >
              Change traffic
            </button>
          )}
          {activeView !== "metrics" && (
            <button type="button" className="ax-review-configure" onClick={() => selectView("metrics")}>
              Detailed metrics
            </button>
          )}
        </div>
      )}
    </div>
  )
}
