"use client"

import { useEffect, useState, type ReactNode } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import { RunNotices } from "./RunResults"
import { PanelGroup, PanelProgressRing } from "./panel/Panel"
import StressTestPanel from "./StressTestPanel"

type RunPanelProps = {
  view: ResultsView
  traffic: TrafficProfile
  onRateChange: (rate: number) => void
  onRun: () => void
  // Live estimates, under the run controls. Hidden while a run is going.
  live?: ReactNode
  // The run in progress, for its progress bar.
  simulation?: { startedAt: number; durationMs: number } | null
}

// How far the run in progress is: a ring that fills over the run's length, with the time left
// in its middle. Remounted for each run (keyed by its start), so it always starts empty.
function SimulationProgress({ startedAt, durationMs }: { startedAt: number; durationMs: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])
  const elapsed = Math.min(Math.max(now - startedAt, 0), durationMs)
  const fraction = durationMs > 0 ? elapsed / durationMs : 1
  const left = Math.max(0, (durationMs - elapsed) / 1000)
  const reading = `${left.toFixed(1)} s`
  return (
    <PanelGroup title="Simulating">
      <PanelProgressRing label="Simulation progress" fraction={fraction} caption={`${reading} left`}>
        {reading}
      </PanelProgressRing>
    </PanelGroup>
  )
}

// The Simulation panel: the traffic to run, the run's progress, then Live estimates. The run's
// health shows in the panel's header; its numbers are the ones Live estimates show.
export default function RunPanel(props: RunPanelProps) {
  const { view, traffic } = props

  return (
    <div aria-live="polite" data-run-state={view.runButtonState}>
      {/* The header's Run button starts each run; the panel only sets the traffic for it. */}
      <StressTestPanel
        traffic={traffic}
        running={view.isRunning}
        onRateChange={props.onRateChange}
      />
      {props.simulation && view.isRunning && <SimulationProgress key={props.simulation.startedAt} {...props.simulation} />}
      {/* The estimates wait while a run is going; kept mounted so they pick up where they were. */}
      <div hidden={view.isRunning}>{props.live}</div>
      <RunNotices view={view} onRun={props.onRun} />
    </div>
  )
}
