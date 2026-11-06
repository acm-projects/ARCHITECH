"use client"

import { useState } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { RunResult } from "../../lib/architecture/evaluation/runSession"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import {
  RunAllMetrics,
  RunComparison,
  RunFindings,
  RunNotices,
  RunMetrics,
  RunSummary,
  staleNotice,
} from "./RunResults"
import {
  reviewViewForRun,
  type ReviewSelection,
  type ReviewView,
} from "./inspectorState"
import { PanelDetail, PanelGroup } from "./panel/Panel"
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

// The Simulation panel: the traffic to run and what the last run found. Scores, findings and
// the full numbers, compared with the run before, are details, one at a time.
export default function RunPanel(props: RunPanelProps) {
  const { view, completedRun, traffic } = props
  const { result, comparison } = view
  const [selection, setSelection] = useState<ReviewSelection>(() => ({
    run: completedRun,
    view: completedRun ? "overview" : "settings",
  }))
  // Edits preserve the chosen view; a completed test opens its summary.
  const activeView = reviewViewForRun(selection, completedRun)
  const select = (next: ReviewView) => setSelection({ run: completedRun, view: next })
  const titles: Partial<Record<ReviewView, string>> = {
    metrics: "Scores",
    findings: "Findings",
    comparison: comparison ? "Compare runs" : "All metrics",
  }
  const detail = result ? titles[activeView] : undefined
  const stale = staleNotice(view, traffic)

  return (
    <div aria-live="polite" data-run-state={view.runButtonState}>
      {/* Keep the form mounted so looking at a detail preserves what was typed. */}
      <div hidden={Boolean(detail)}>
        <StressTestPanel
          traffic={traffic}
          runLabel={view.isRunning ? "Running…" : "Run simulation"}
          running={view.isRunning}
          onRateChange={props.onRateChange}
          onRun={props.onRun}
          onRunAtRate={props.onRunAtRate}
        />
        <RunNotices view={view} onRun={props.onRun} />
        {result && (
          <PanelGroup title="Last run" meta={stale && <strong role="status">{stale}</strong>}>
            <RunSummary result={result} comparison={comparison} numbersTitle={titles.comparison ?? ""} onOpen={select} />
          </PanelGroup>
        )}
      </div>
      {result && detail && (
        <PanelDetail title={detail} onBack={() => select("overview")}>
          {activeView === "metrics" && <RunMetrics result={result} />}
          {activeView === "findings" && <RunFindings result={result} componentName={props.componentName} />}
          {activeView === "comparison" && (comparison ? <RunComparison comparison={comparison} /> : <RunAllMetrics result={result} />)}
        </PanelDetail>
      )}
    </div>
  )
}
