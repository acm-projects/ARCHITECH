"use client"

import { useEffect, useState, type ReactNode } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import { RunNotices } from "./RunResults"
import { progressAt, progressPlan } from "../../lib/architecture/evaluation/runProgress"
import { PanelGroup, PanelProgressRing } from "./panel/Panel"
import StressTestPanel from "./StressTestPanel"

type RunPanelProps = {
  view: ResultsView
  traffic: TrafficProfile
  onRateChange: (rate: number) => void
  onRun: () => void
  // Live estimates, under the run controls. Hidden while a run is going.
  live?: ReactNode
  // The run in progress: when it started and how long it takes, for its progress ring.
  simulation?: { startedAt: number; durationMs: number } | null
}

// A run in progress: a ring that fills in bursts and pauses, its own way each run, and is full
// as the result arrives. Remounted for each run (keyed by its start), so each gets a new plan.
function SimulationProgress({ startedAt, durationMs }: { startedAt: number; durationMs: number }) {
  const [plan] = useState(() => progressPlan())
  const [fraction, setFraction] = useState(0)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const time = durationMs > 0 ? (Date.now() - startedAt) / durationMs : 1
      setFraction(progressAt(plan, time))
      if (time < 1) frame = window.requestAnimationFrame(tick)
    }
    tick()
    return () => window.cancelAnimationFrame(frame)
  }, [plan, startedAt, durationMs])
  return (
    <PanelGroup title="Simulating">
      <PanelProgressRing label="Simulation progress" fraction={fraction} />
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
      {view.isRunning && props.simulation && <SimulationProgress key={props.simulation.startedAt} {...props.simulation} />}
      {/* The estimates wait while a run is going; kept mounted so they pick up where they were. */}
      <div hidden={view.isRunning}>{props.live}</div>
      <RunNotices view={view} onRun={props.onRun} />
    </div>
  )
}
