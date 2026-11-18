"use client"

import { useEffect, useState, type ReactNode } from "react"

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
import { formatRate } from "../../lib/architecture/implementationStats"
import { PanelDetail, PanelGroup, PanelMeter, PanelText } from "./panel/Panel"
import StressTestPanel from "./StressTestPanel"

type RunPanelProps = {
  view: ResultsView
  completedRun: RunResult | null
  traffic: TrafficProfile
  onRateChange: (rate: number) => void
  onRun: () => void
  onRunAtRate: (rate: number) => void
  componentName: (id: string) => string
  // Live estimates, shown above the run so the current numbers and the last run read together.
  live?: ReactNode
  // The run in progress, for its progress bar.
  simulation?: { startedAt: number; durationMs: number } | null
}

// How far the run in progress is: a bar that fills over the run's length, and the seconds left.
function SimulationProgress({ startedAt, durationMs, requestsPerSecond }: { startedAt: number; durationMs: number; requestsPerSecond: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  const elapsed = Math.min(Math.max(now - startedAt, 0), durationMs)
  const fraction = durationMs > 0 ? elapsed / durationMs : 1
  const left = Math.max(0, Math.ceil((durationMs - elapsed) / 1000))
  return (
    <PanelGroup title="Simulating" meta={`${left} s left`}>
      <PanelMeter
        label="Simulation progress"
        fraction={fraction}
        caption={`${formatRate(requestsPerSecond)} req/s through every component on the request path`}
      />
      <PanelText role="status">Results arrive when the run finishes.</PanelText>
    </PanelGroup>
  )
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
        {props.live}
        <StressTestPanel
          traffic={traffic}
          runLabel={view.isRunning ? "Running…" : "Run simulation"}
          running={view.isRunning}
          onRateChange={props.onRateChange}
          onRun={props.onRun}
          onRunAtRate={props.onRunAtRate}
        />
        {props.simulation && (
          <SimulationProgress {...props.simulation} requestsPerSecond={traffic.requestsPerSecond} />
        )}
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
