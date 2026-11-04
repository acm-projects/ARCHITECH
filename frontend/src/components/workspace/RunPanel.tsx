"use client"

import { useLayoutEffect, useRef, useState } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { RunResult } from "../../lib/architecture/evaluation/runSession"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import {
  ReviewSection,
  RunComparison,
  RunFindings,
  RunNotices,
  RunMetrics,
  RunSummary,
} from "./RunResults"
import {
  reviewViewForRun,
  type ReviewSelection,
  type ReviewView,
} from "./inspectorState"
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

// The Simulation panel: a tab per part of a run. Every tab is built from the same sections
// (RunResults' ReviewSection), so Traffic, Last run, Scores and Compare runs read alike.
const VIEWS = [
  ["settings", "Traffic"],
  ["overview", "Last run"],
  ["metrics", "Scores"],
  ["comparison", "Compare runs"],
] as const

export default function RunPanel(props: RunPanelProps) {
  const { view, completedRun, traffic } = props
  const { result, comparison } = view
  const viewPicker = useRef<HTMLButtonElement>(null)
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
    // Keep keyboard focus within the persistent view controls.
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
      <div className="ax-review-view" role="group" aria-label="Run view" hidden={!result}>
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            ref={value === activeView ? viewPicker : undefined}
            type="button"
            aria-pressed={activeView === value}
            disabled={value !== "settings" && !result}
            onClick={() => selectView(value)}
          >{label}</button>
        ))}
      </div>
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
            runLabel={view.isRunning ? "Running…" : "Run simulation"}
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
              <RunFindings result={result} componentName={props.componentName} />
            </div>
            <div hidden={activeView !== "metrics"}>
              <RunMetrics result={result} />
            </div>
            <div hidden={activeView !== "comparison"}>
              {comparison ? (
                <RunComparison comparison={comparison} />
              ) : (
                <ReviewSection title="Compare runs">
                  <p className="ax-review-note">Run another test to compare it with this one.</p>
                </ReviewSection>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
