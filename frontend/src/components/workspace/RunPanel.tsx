"use client"

import { useEffect, useState, type ReactNode } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import { RunNotices } from "./RunResults"
import { PanelGroup, PanelMeter } from "./panel/Panel"
import StressTestPanel from "./StressTestPanel"

type RunPanelProps = {
  view: ResultsView
  traffic: TrafficProfile
  onRateChange: (rate: number) => void
  onRun: () => void
  onRunAtRate: (rate: number) => void
  // Live estimates, under the run controls. Hidden while a run is going.
  live?: ReactNode
  // The run in progress, for its progress bar.
  simulation?: { startedAt: number; durationMs: number } | null
}

// How far the run in progress is: a bar that fills over the run's length, and the seconds left.
function SimulationProgress({ startedAt, durationMs }: { startedAt: number; durationMs: number }) {
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
      <PanelMeter label="Simulation progress" fraction={fraction} />
    </PanelGroup>
  )
}

// The Simulation panel: the traffic to run, the run's progress, then Live estimates. The run's
// health shows in the panel's header; its numbers are the ones Live estimates show.
export default function RunPanel(props: RunPanelProps) {
  const { view, traffic } = props

  return (
    <div aria-live="polite" data-run-state={view.runButtonState}>
      <StressTestPanel
        traffic={traffic}
        runLabel={view.isRunning ? "Running…" : "Run simulation"}
        running={view.isRunning}
        onRateChange={props.onRateChange}
        onRun={props.onRun}
        onRunAtRate={props.onRunAtRate}
      />
      {props.simulation && <SimulationProgress {...props.simulation} />}
      {/* The estimates wait while a run is going; kept mounted so they pick up where they were. */}
      <div hidden={view.isRunning}>{props.live}</div>
      <RunNotices view={view} onRun={props.onRun} />
    </div>
  )
}
