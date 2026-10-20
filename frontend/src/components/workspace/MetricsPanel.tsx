"use client";

import { useState, type ReactNode } from "react";

import type { Direction, EvaluationComparison, MetricDelta } from "../../lib/architecture/evaluation/comparison";
import { demandVsCapacity, type ResultsSummary, type ResultsView } from "../../lib/architecture/evaluation/resultsView";
import type { RunResult } from "../../lib/architecture/evaluation/runSession";
import { reviewViewForRun, type ReviewSelection, type ReviewView } from "./inspectorState";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";

type MetricsPanelProps = {
  view: ResultsView;
  completedRun: RunResult | null;
  onRun: () => void;
  onConfigureRun: () => void;
  liveTraffic?: TrafficProfile;
  componentName?: (id: string) => string;
  liveEstimates: ReactNode;
};

const rps = (value: number) => `${Math.round(value).toLocaleString("en-US")} req/s`;
const formatNumber = (value: number) => String(Math.round(value * 100) / 100);
const DIRECTION_LABELS: Record<Direction, string> = { improved: "better", regressed: "worse", unchanged: "same" };

const SCORE_ROWS = [
  { key: "scalability", label: "Scalability" },
  { key: "reliability", label: "Reliability" },
  { key: "performance", label: "Performance" },
  { key: "costEfficiency", label: "Cost efficiency" },
] as const;

type MetricDefinition = {
  key: keyof EvaluationComparison["metrics"];
  label: string;
  format: (value: number) => string;
  primary?: boolean;
};

const METRIC_ROWS: readonly MetricDefinition[] = [
  { key: "effectiveRps", label: "Served", format: rps },
  { key: "capacityRps", label: "Capacity", format: rps, primary: true },
  { key: "p95LatencyMs", label: "p95 latency", format: (value) => `${Math.round(value)} ms`, primary: true },
  { key: "estimatedMonthlyCost", label: "Monthly cost", format: (value) => `$${value.toLocaleString("en-US")}`, primary: true },
  { key: "availability", label: "Availability", format: (value) => `${value}%` },
];

const formatValue = (value: number | null, format: (value: number) => string) =>
  value === null ? "not limited" : format(value);

function RunNotices({ view, onRun, liveTraffic }: Pick<MetricsPanelProps, "view" | "onRun" | "liveTraffic">) {
  const { result } = view;
  const trafficChanged = result !== null && liveTraffic !== undefined &&
    liveTraffic.requestsPerSecond !== result.traffic.requestsPerSecond;
  const showStale = view.isStale && !view.isRunning;
  if (!view.isRunning && !view.error && !showStale && result?.ready !== false) return null;

  return (
    <div className="ax-review-content ax-review-notices">
      {view.isRunning && <p role="status" className="ax-card-label">Analyzing…</p>}
      {view.error && (
        <p role="alert" className="ax-card-label">
          Analysis failed: {view.error}
          {view.hasResult ? " Showing the last completed analysis." : ""}
        </p>
      )}
      {showStale && (
        <p role="status" className="ax-card-label">
          {trafficChanged ? "Traffic changed — run again." : "Architecture changed — run again."}
        </p>
      )}
      {result && !result.ready && <p className="ax-card-label">No request reaches a component yet.</p>}
      {view.error && (
        <button type="button" onClick={onRun} disabled={!view.canRun} className="ax-review-run">Retry →</button>
      )}
    </div>
  );
}

function RunSummary({ result }: { result: ResultsSummary }) {
  const verdict = demandVsCapacity(result.metrics);
  return (
    <div className="ax-review-content ax-review-summary">
      <div className="ax-review-context" data-demand={verdict.state}>
        <span>Tested at {rps(result.metrics.requestedRps)}</span>
        <strong title="System health">{result.health.status}</strong>
      </div>
      <dl className="ax-review-metrics">
        {METRIC_ROWS.filter((metric) => metric.primary).map(({ key, label, format }) => (
          <div key={key}><dt>{label}</dt><dd>{formatValue(result.metrics[key], format)}</dd></div>
        ))}
      </dl>
      {verdict.state === "exceeds" && (
        <p role="status" className="ax-card-label">
          Demand exceeds capacity
          {verdict.utilization !== null ? ` (${Math.round(verdict.utilization * 100)}% of capacity)` : ""}.
        </p>
      )}
    </div>
  );
}

function RunMetrics({ result }: { result: ResultsSummary }) {
  return (
    <div className="ax-review-content">
      <h3>System metrics</h3>
      <dl className="ax-review-metrics ax-review-metrics-full">
        <div><dt>Tested traffic</dt><dd>{rps(result.metrics.requestedRps)}</dd></div>
        {METRIC_ROWS.map(({ key, label, format }) => (
          <div key={key}><dt>{label}</dt><dd>{formatValue(result.metrics[key], format)}</dd></div>
        ))}
      </dl>
      <h3 className="ax-review-group-title">Scores</h3>
      <dl className="ax-review-score-grid">
        <div><dt>Overall score</dt><dd>{result.overallScore}</dd></div>
        {SCORE_ROWS.map(({ key, label }) => (
          <div key={key}><dt>{label}</dt><dd>{result.scores[key]}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function RunFindings({ result, componentName }: { result: ResultsSummary; componentName: (id: string) => string }) {
  return (
    <div className="ax-review-content ax-review-issues">
      <div className="ax-review-findings-heading"><h3>Findings</h3><span>{result.topFindings.length}</span></div>
      {result.topBottleneck && (
        <p className="ax-card-label">
          Bottleneck: {componentName(result.topBottleneck.nodeId)} at{" "}
          {Math.round(result.topBottleneck.utilization * 100)}% of capacity
        </p>
      )}
      {result.topFindings.length > 0 ? (
        <ul className="ax-inspector-findings">
          {result.topFindings.map((finding, index) => (
            <li key={finding.id}>
              <div className="ax-review-finding-title">
                <p>{finding.title}</p>
                <span>{finding.severity}</span>
              </div>
              <p className="ax-card-label">{result.recommendations[index]?.text ?? finding.recommendation}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ax-card-label">
          {result.ready ? "No findings in this run." : "No findings available for this run."}
        </p>
      )}
    </div>
  );
}

function ComparisonRow({ label, delta, format = formatNumber }: {
  label: string;
  delta: MetricDelta;
  format?: (value: number) => string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{formatValue(delta.before, format)} → {formatValue(delta.after, format)}</span>
        <small>{DIRECTION_LABELS[delta.direction]}</small>
      </dd>
    </div>
  );
}

function RunComparison({ comparison }: { comparison: EvaluationComparison }) {
  return (
    <div className="ax-review-comparison-block">
      <div className="ax-review-comparison-heading">
        <h3>Changes since last run</h3><span>Previous → Latest</span>
      </div>
      <dl className="ax-review-rows ax-review-comparison">
        <ComparisonRow label="Overall score" delta={comparison.overallScore} />
        <div>
          <dt>Health</dt>
          <dd>
            <span>{comparison.health.before} → {comparison.health.after}</span>
            <small>{DIRECTION_LABELS[comparison.health.direction]}</small>
          </dd>
        </div>
        {METRIC_ROWS.map(({ key, label, format }) => (
          <ComparisonRow key={key} label={label} delta={comparison.metrics[key]} format={format} />
        ))}
        {SCORE_ROWS.map(({ key, label }) => (
          <ComparisonRow key={key} label={label} delta={comparison.scores[key]} />
        ))}
      </dl>
    </div>
  );
}

// Presentation only: evaluation, comparisons, and run state come from the existing session.
export default function MetricsPanel({ componentName = (id) => id, ...props }: MetricsPanelProps) {
  const { view, completedRun } = props;
  const { result, comparison } = view;
  const [selection, setSelection] = useState<ReviewSelection>(
    () => ({ run: completedRun, view: completedRun ? "overview" : "live" }),
  );
  // New runs show their summary; edits retain the chosen view of the last completed run.
  const activeView = reviewViewForRun(selection, completedRun);

  return (
    <div className="ax-review" aria-live="polite" data-run-state={view.runButtonState}>
      <RunNotices view={view} onRun={props.onRun} liveTraffic={props.liveTraffic} />
      <label className="ax-review-view">
        <span>View</span>
        <select
          className="ax-field"
          aria-label="Metrics view"
          value={activeView}
          onChange={(event) => setSelection({ run: completedRun, view: event.target.value as ReviewView })}
        >
          <option value="live">Live estimates</option>
          <option value="overview" disabled={!result}>Last run</option>
          <option value="metrics" disabled={!result}>Full metrics</option>
          <option value="comparison" disabled={!result}>Compare runs</option>
        </select>
      </label>
      <div hidden={activeView !== "live"}>{props.liveEstimates}</div>
      {result && (
        <>
          <div hidden={activeView !== "overview"}>
            <RunSummary result={result} />
            <RunFindings result={result} componentName={componentName} />
          </div>
          <div hidden={activeView !== "metrics"}><RunMetrics result={result} /></div>
          <div hidden={activeView !== "comparison"} className="ax-review-content">
            {comparison ? <RunComparison comparison={comparison} /> : (
              <p className="ax-card-label">Run another test to compare it with this one.</p>
            )}
          </div>
        </>
      )}
      <div className="ax-review-footer">
        <button
          type="button"
          className="ax-review-configure"
          disabled={!view.canRun}
          onClick={result ? props.onConfigureRun : props.onRun}
        >
          {result ? "Run again" : "Run design"} {"\u2192"}
        </button>
      </div>
    </div>
  );
}
