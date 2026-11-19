"use client"

import type { ReactNode } from "react"

import type { ResultsView } from "../../lib/architecture/evaluation/resultsView"
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic"
import { RunNotices } from "./RunResults"
import { PanelGroup, PanelSpinner } from "./panel/Panel"
import StressTestPanel from "./StressTestPanel"

type RunPanelProps = {
  view: ResultsView
  traffic: TrafficProfile
  onRateChange: (rate: number) => void
  onRun: () => void
  // Live estimates, under the run controls. Hidden while a run is going.
  live?: ReactNode
}

// A run in progress: a spinner until its result arrives. Each run takes a random time, and
// none of it is shown as progress.
function SimulationProgress() {
  return (
    <PanelGroup title="Simulating">
      <PanelSpinner label="Simulating" />
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
      {view.isRunning && <SimulationProgress />}
      {/* The estimates wait while a run is going; kept mounted so they pick up where they were. */}
      <div hidden={view.isRunning}>{props.live}</div>
      <RunNotices view={view} onRun={props.onRun} />
    </div>
  )
}
