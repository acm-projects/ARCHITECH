import type { Direction, EvaluationComparison, MetricDelta } from "../../lib/architecture/evaluation/comparison";
import { SEVERITY_WORD } from "../../lib/architecture/designCheck";
import { demandVsCapacity, type ResultsSummary, type ResultsView } from "../../lib/architecture/evaluation/resultsView";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";
import { PanelAction, PanelActions, PanelChange, PanelGroup, PanelLink, PanelRow, PanelText } from "./panel/Panel";

// The parts of a completed run, each a list of rows in the Simulation panel.
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
  { key: "estimatedMonthlyCost", label: "Monthly cost", format: (value) => `$${value.toLocaleString("en-US")}/mo` },
  { key: "availability", label: "Availability", format: (value) => `${value}%` },
];

const formatValue = (value: number | null, format: (value: number) => string) =>
  value === null ? "not limited" : format(value);

// Why the result on screen is out of date. It sits on the line that titles the result, because
// a row appearing here would move the panels below it while someone is clicking on them.
export function staleNotice(view: ResultsView, liveTraffic: TrafficProfile): string | undefined {
  if (!view.isStale || view.isRunning) return undefined;
  return view.result && liveTraffic.requestsPerSecond !== view.result.traffic.requestsPerSecond
    ? "Traffic changed — run again"
    : "Architecture changed — run again";
}

export function RunNotices({ view, onRun }: { view: ResultsView; onRun: () => void }) {
  const { result } = view;
  if (!view.error && result?.ready !== false) return null;

  return (
    <>
      {view.error && (
        <PanelText role="alert" tone="danger">
          Analysis failed: {view.error}
          {view.hasResult ? " Showing the last completed analysis." : ""}
        </PanelText>
      )}
      {result && !result.ready && <PanelText>No request reaches a component yet.</PanelText>}
      {view.error && (
        <PanelActions>
          <PanelAction onClick={onRun} disabled={!view.canRun}>Retry</PanelAction>
        </PanelActions>
      )}
    </>
  );
}

// What a run adds to Live estimates: whether it served the traffic, how fast, and what it found.
// An arrow marks a number that moved since the run before.
const HEADLINE_METRICS = METRIC_ROWS.filter(({ key }) => key === "effectiveRps" || key === "p95LatencyMs");

export function RunSummary({ result, comparison, numbersTitle, onOpen }: {
  result: ResultsSummary;
  comparison: EvaluationComparison | null;
  // The row to the full numbers: a comparison once there is a run to compare with.
  numbersTitle: string;
  onOpen: (view: "metrics" | "findings" | "comparison") => void;
}) {
  const verdict = demandVsCapacity(result.metrics);
  return (
    <>
      <PanelLink
        label="Score"
        value={<>{result.overallScore}<PanelChange direction={comparison?.overallScore.direction} /></>}
        onClick={() => onOpen("metrics")}
      />
      {HEADLINE_METRICS.map(({ key, label, format }) => (
        <PanelRow
          key={key}
          label={label}
          value={<>{formatValue(result.metrics[key], format)}<PanelChange direction={comparison?.metrics[key].direction} /></>}
        />
      ))}
      {verdict.state === "exceeds" && (
        <PanelText role="status" tone="danger">
          Demand exceeds capacity
          {verdict.utilization !== null ? ` (${Math.round(verdict.utilization * 100)}% of capacity)` : ""}.
        </PanelText>
      )}
      <PanelLink label="Findings" value={result.topFindings.length} onClick={() => onOpen("findings")} />
      <PanelLink label={numbersTitle} onClick={() => onOpen("comparison")} />
    </>
  );
}

export function RunMetrics({ result }: { result: ResultsSummary }) {
  return (
    <PanelGroup>
      <PanelRow label="Overall" value={result.overallScore} />
      {SCORE_ROWS.map(({ key, label }) => (
        <PanelRow key={key} label={label} value={result.scores[key]} />
      ))}
    </PanelGroup>
  );
}

// A run's findings are the design check's, measured at the traffic of this run: each is a title
// with its recommendation, and the fixes stay in Design check.
export function RunFindings({ result, componentName }: { result: ResultsSummary; componentName: (id: string) => string }) {
  return (
    <>
      {result.topBottleneck && (
        <PanelGroup>
          <PanelRow
            label="Bottleneck"
            value={`${componentName(result.topBottleneck.nodeId)} · ${Math.round(result.topBottleneck.utilization * 100)}%`}
            title="Share of its capacity in use"
          />
        </PanelGroup>
      )}
      {result.topFindings.length > 0 ? (
        result.topFindings.map((finding, index) => (
          <PanelGroup key={finding.id}>
            <PanelRow item label={finding.title} value={SEVERITY_WORD[finding.severity]} title={finding.title} />
            <PanelText>{result.recommendations[index]?.text ?? finding.recommendation}</PanelText>
          </PanelGroup>
        ))
      ) : (
        <PanelText>{result.ready ? "No findings in this run." : "No findings available for this run."}</PanelText>
      )}
    </>
  );
}

// One number when it did not move, both when it did.
function ComparisonRow({ label, delta, format = formatNumber }: {
  label: string;
  delta: MetricDelta;
  format?: (value: number) => string;
}) {
  const after = formatValue(delta.after, format);
  return (
    <PanelRow
      label={label}
      title={DIRECTION_LABELS[delta.direction]}
      value={delta.direction === "unchanged" ? after : <>{formatValue(delta.before, format)} → {after}<PanelChange direction={delta.direction} /></>}
    />
  );
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function RunComparison({ comparison }: { comparison: EvaluationComparison }) {
  const { before, after, direction } = comparison.health;
  return (
    <>
      <PanelGroup>
        <ComparisonRow label="Score" delta={comparison.overallScore} />
        <PanelRow
          label="Health"
          title={DIRECTION_LABELS[direction]}
          value={direction === "unchanged" ? capitalized(after) : <>{capitalized(before)} → {capitalized(after)}<PanelChange direction={direction} /></>}
        />
        {METRIC_ROWS.map(({ key, label, format }) => (
          <ComparisonRow key={key} label={label} delta={comparison.metrics[key]} format={format} />
        ))}
      </PanelGroup>
      <PanelGroup>
        {SCORE_ROWS.map(({ key, label }) => (
          <ComparisonRow key={key} label={label} delta={comparison.scores[key]} />
        ))}
      </PanelGroup>
    </>
  );
}

// The first run has nothing to compare with, so its numbers stand alone.
export function RunAllMetrics({ result }: { result: ResultsSummary }) {
  return (
    <PanelGroup>
      {METRIC_ROWS.map(({ key, label, format }) => (
        <PanelRow key={key} label={label} value={formatValue(result.metrics[key], format)} />
      ))}
    </PanelGroup>
  );
}
