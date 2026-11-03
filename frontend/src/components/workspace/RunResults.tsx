import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Direction, EvaluationComparison, MetricDelta } from "../../lib/architecture/evaluation/comparison";
import { demandVsCapacity, type ResultsSummary, type ResultsView } from "../../lib/architecture/evaluation/resultsView";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";

// Shared presentation of completed evaluations; both panels use the same run session.
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
};

const METRIC_ROWS: readonly MetricDefinition[] = [
  { key: "effectiveRps", label: "Served", format: rps },
  { key: "capacityRps", label: "Capacity", format: rps },
  { key: "p95LatencyMs", label: "p95 latency", format: (value) => `${Math.round(value)} ms` },
  { key: "estimatedMonthlyCost", label: "Monthly cost", format: (value) => `$${value.toLocaleString("en-US")}` },
  { key: "availability", label: "Availability", format: (value) => `${value}%` },
];

const formatValue = (value: number | null, format: (value: number) => string) =>
  value === null ? "not limited" : format(value);

export function RunNotices({ view, onRun, liveTraffic }: { view: ResultsView; onRun: () => void; liveTraffic?: TrafficProfile }) {
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

// One section of the Simulation panel: a head (title, optional meta) and its body. Every
// part of a run (traffic, last run, findings, scores, comparison) uses it, so they read alike.
export function ReviewSection({ title, meta, className = "", children }: {
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ax-review-section ${className}`.trim()} aria-label={title}>
      <div className="ax-review-section-head">
        <h3>{title}</h3>
        {meta !== undefined && <span>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

// Every metric of the run in one list; the head carries the tested traffic and health.
export function RunSummary({ result }: { result: ResultsSummary }) {
  const verdict = demandVsCapacity(result.metrics);
  return (
    <ReviewSection
      title="Last run"
      meta={<>{rps(result.metrics.requestedRps)} · <span className="ax-review-health" data-demand={verdict.state}>{result.health.status}</span></>}
    >
      <dl className="ax-panel-metrics">
        {METRIC_ROWS.map(({ key, label, format }) => (
          <div key={key}><dt>{label}</dt><dd>{formatValue(result.metrics[key], format)}</dd></div>
        ))}
      </dl>
      {verdict.state === "exceeds" && (
        <p role="status" className="ax-review-note">
          Demand exceeds capacity
          {verdict.utilization !== null ? ` (${Math.round(verdict.utilization * 100)}% of capacity)` : ""}.
        </p>
      )}
    </ReviewSection>
  );
}

export function RunMetrics({ result }: { result: ResultsSummary }) {
  return (
    <ReviewSection title="Scores">
      <dl className="ax-panel-metrics ax-review-scores">
        <div><dt>Overall</dt><dd>{result.overallScore}</dd></div>
        {SCORE_ROWS.map(({ key, label }) => (
          <div key={key}><dt>{label}</dt><dd>{result.scores[key]}</dd></div>
        ))}
      </dl>
    </ReviewSection>
  );
}

export function RunFindings({ result, componentName }: { result: ResultsSummary; componentName: (id: string) => string }) {
  return (
    <ReviewSection title="Findings" meta={String(result.topFindings.length)} className="ax-review-issues">
      {result.topBottleneck && (
        <p className="ax-review-note">
          Bottleneck: {componentName(result.topBottleneck.nodeId)} at{" "}
          {Math.round(result.topBottleneck.utilization * 100)}% of capacity
        </p>
      )}
      {result.topFindings.length > 0 ? (
        <ul className="ax-inspector-findings">
          {result.topFindings.map((finding, index) => (
            <li key={finding.id}>
              <details className="ax-review-finding">
                <summary className="ax-review-finding-title">
                  <span className="ax-review-finding-name">{finding.title}</span>
                  <span className="ax-review-severity">{finding.severity}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </summary>
                <p className="ax-card-label">{result.recommendations[index]?.text ?? finding.recommendation}</p>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ax-review-note">
          {result.ready ? "No findings in this run." : "No findings available for this run."}
        </p>
      )}
    </ReviewSection>
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

export function RunComparison({ comparison }: { comparison: EvaluationComparison }) {
  return (
    <ReviewSection title="Compare runs" meta="Previous → Latest">
      <dl className="ax-panel-metrics ax-review-comparison">
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
    </ReviewSection>
  );
}
