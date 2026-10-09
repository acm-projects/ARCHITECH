"use client";

import type { Direction, MetricDelta } from "../../lib/architecture/evaluation/comparison";
import { demandVsCapacity, type ResultsView } from "../../lib/architecture/evaluation/resultsView";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";

type RunResultsPanelProps = {
  view: ResultsView;
  onRun: () => void;
  // The load a new run would use. When it differs from the result's, the result is out of date
  // because of the traffic, not the architecture.
  liveTraffic?: TrafficProfile;
};

const rps = (value: number) => `${Math.round(value).toLocaleString("en-US")} req/s`;

const SCORE_ROWS = [
  { key: "scalability", label: "Scalability" },
  { key: "reliability", label: "Reliability" },
  { key: "performance", label: "Performance" },
  { key: "costEfficiency", label: "Cost efficiency" },
] as const;

const WORD: Record<Direction, string> = {
  improved: "better",
  regressed: "worse",
  unchanged: "same",
};

// "+12 better", "-3 worse" or "same"; nothing when there is no earlier run to compare with.
function change(delta: MetricDelta | undefined, unit = ""): string {
  if (!delta || delta.direction === "unchanged") return delta ? " · same" : "";
  const amount = delta.delta === null ? "" : `${delta.delta > 0 ? "+" : ""}${Math.round(delta.delta * 100) / 100}${unit} `;
  return ` · ${amount}${WORD[delta.direction]}`;
}

// Plain-text surface for the results of Run Design, shown in the same floating card as the
// Learn and Challenge cards. It only reads the view model; the state lives in the hook.
export default function RunResultsPanel({ view, onRun, liveTraffic }: RunResultsPanelProps) {
  const { result, comparison } = view;
  const trafficChanged =
    result !== null &&
    liveTraffic !== undefined &&
    liveTraffic.requestsPerSecond !== result.traffic.requestsPerSecond;
  const verdict = result ? demandVsCapacity(result.metrics) : null;
  if (!result && !view.isRunning && !view.error) return null;

  return (
    <div className="ax-card ax-learn" aria-live="polite" data-run-state={view.runButtonState}>
      <span className="ax-panel-title">System review</span>

      {view.isRunning && <p className="ax-card-label mt-3">Analyzing…</p>}

      {view.error && (
        <p role="alert" className="ax-card-label mt-3">
          Analysis failed: {view.error}
          {view.hasResult ? " Showing the last completed analysis." : ""}
        </p>
      )}

      {view.isStale && !view.isRunning && (
        <p role="status" className="ax-card-label mt-3">
          {trafficChanged ? "Traffic changed — run again." : "Architecture changed — run again."}
        </p>
      )}

      {result && (
        <>
          {!result.ready && (
            <p className="ax-card-label mt-3">No request reaches a component yet.</p>
          )}

          <div className="mt-4 flex items-baseline justify-between">
            <span className="ax-card-title">Overall</span>
            <span className="text-[16px] font-light tabular-nums">
              {result.overallScore}
              <span className="ax-card-label">{change(comparison?.overallScore)}</span>
            </span>
          </div>
          <p className="ax-card-label mt-1">
            Health: {result.health.status}
            {comparison && comparison.health.direction !== "unchanged"
              ? ` (was ${comparison.health.before})`
              : ""}
          </p>

          <ul className="mt-3 space-y-1 text-(length:--ax-t-sm)">
            {SCORE_ROWS.map(({ key, label }) => (
              <li key={key} className="flex justify-between">
                <span>{label}</span>
                <span className="tabular-nums">
                  {result.scores[key]}
                  {change(comparison?.scores[key])}
                </span>
              </li>
            ))}
          </ul>

          <ul className="mt-4 space-y-1 border-t border-(--ax-line) pt-4 text-(length:--ax-t-sm)">
            <li className="flex justify-between">
              <span>Demand</span>
              <span className="tabular-nums" data-demand={verdict?.state}>
                {rps(result.metrics.requestedRps)}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Served</span>
              <span className="tabular-nums">{rps(result.metrics.effectiveRps)}</span>
            </li>
            <li className="flex justify-between">
              <span>Capacity</span>
              <span className="tabular-nums">
                {result.metrics.capacityRps === null
                  ? "not limited"
                  : `${Math.round(result.metrics.capacityRps).toLocaleString("en-US")} req/s`}
                {change(comparison?.metrics.capacityRps)}
              </span>
            </li>
            <li className="flex justify-between">
              <span>p95 latency</span>
              <span className="tabular-nums">
                {Math.round(result.metrics.p95LatencyMs)} ms
                {change(comparison?.metrics.p95LatencyMs)}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Monthly cost</span>
              <span className="tabular-nums">
                ${result.metrics.estimatedMonthlyCost.toLocaleString("en-US")}
                {change(comparison?.metrics.estimatedMonthlyCost)}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Availability</span>
              <span className="tabular-nums">
                {result.metrics.availability}%{change(comparison?.metrics.availability)}
              </span>
            </li>
          </ul>

          {verdict?.state === "exceeds" && (
            <p role="status" className="ax-card-label mt-3">
              Demand exceeds capacity
              {verdict.utilization !== null
                ? ` (${Math.round(verdict.utilization * 100)}% of capacity)`
                : ""}
              .
            </p>
          )}

          {result.topBottleneck && (
            <p className="ax-card-label mt-3">
              Bottleneck: {result.topBottleneck.nodeId} at{" "}
              {Math.round(result.topBottleneck.utilization * 100)}% of capacity
            </p>
          )}

          {result.topFindings.length > 0 && (
            <ul className="mt-4 space-y-2.5 border-t border-(--ax-line) pt-4">
              {result.topFindings.map((finding, index) => (
                <li key={finding.id} className="text-(length:--ax-t-sm)">
                  <p>
                    {finding.severity}: {finding.title}
                  </p>
                  <p className="ax-card-label mt-0.5 leading-snug">
                    {result.recommendations[index]?.text ?? finding.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onRun}
        aria-disabled={!view.canRun}
        className="ax-card-link"
      >
        {view.runButtonState === "error"
          ? "Retry →"
          : view.hasResult
            ? "Run again →"
            : "Run design →"}
      </button>
    </div>
  );
}
