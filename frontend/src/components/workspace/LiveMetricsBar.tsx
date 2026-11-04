"use client";

import { ChevronDown, Gauge } from "lucide-react";

import type { Direction } from "../../lib/architecture/evaluation/comparison";
import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import ToolPanelHeader from "./ToolPanelHeader";
import "./live-metrics.css";

// Live metrics over the canvas: the design's score and headline numbers at the current traffic,
// updated as components are added, removed, connected or reconfigured (no Run Design needed).
// An arrow shows which way each number moved with the last change.

const EXPLANATION =
  "Estimated live by ARCHITECH's metrics engine from each component's technology and settings and the traffic. " +
  "Directionally correct and explainable, not exact: real systems depend on much more. " +
  "Run Design gives the full breakdown; docs/metrics-model.md lists every assumption.";

function Change({ direction }: { direction: Direction | undefined }) {
  if (!direction || direction === "unchanged") return null;
  return (
    <span className="ax-live-change" data-direction={direction} aria-label={direction === "improved" ? "better" : "worse"}>
      {direction === "improved" ? "▲" : "▼"}
    </span>
  );
}

function Metric({ label, value, direction }: { label: string; value: string; direction?: Direction }) {
  return (
    <div className="ax-live-metric">
      <span className="ax-live-label">{label}</span>
      <span className="ax-live-value">
        {value}
        <Change direction={direction} />
      </span>
    </div>
  );
}

export function LiveMetricsBar({
  result,
  changes,
  componentName,
}: {
  result: LiveResult | null;
  changes: LiveChanges | null;
  // Display name for a component id (the limiting component).
  componentName: (id: string) => string;
}) {
  if (!result) return null;
  const { summary } = result;
  return (
    <section className="ax-live" aria-label="Live metrics" aria-live="polite" data-health={summary.health}>
      {summary.ready ? (
        <>
          <div className="ax-live-row ax-panel-metrics">
            <Metric
              label="Capacity"
              value={summary.capacityRps === null ? "no limit" : `${formatRate(summary.capacityRps)} req/s`}
              direction={changes?.capacityRps}
            />
            <Metric label="p95 latency" value={formatLatency(summary.p95LatencyMs)} direction={changes?.p95LatencyMs} />
            <Metric label="Monthly cost" value={formatMonthlyCost(summary.monthlyCost)} direction={changes?.monthlyCost} />
          </div>
          <details className="ax-panel-disclosure ax-live-details">
            <summary>More metrics<ChevronDown size={13} aria-hidden="true" /></summary>
            <div className="ax-live-row ax-panel-metrics">
              <Metric label="Score" value={String(summary.score)} direction={changes?.score} />
              <Metric label="Uptime" value={`${summary.uptimePercent}%`} direction={changes?.uptimePercent} />
            </div>
            {(summary.limitingNodeId || summary.topIssue) && (
              <p className="ax-live-note">
                {summary.limitingNodeId && <>Bottleneck: {componentName(summary.limitingNodeId)}. </>}
                {summary.topIssue && <>{summary.topIssue.title}</>}
              </p>
            )}
          </details>
        </>
      ) : (
        <p className="ax-live-note">Connect a client to your components to see live metrics.</p>
      )}
    </section>
  );
}

const HEALTH_LABEL = { incomplete: "Incomplete", healthy: "Healthy", warning: "Warning", critical: "Critical" } as const;

// The colored dot also names the state, for hover and screen readers.
function HealthDot({ status }: { status: keyof typeof HEALTH_LABEL | undefined }) {
  const label = `Health: ${HEALTH_LABEL[status ?? "incomplete"]}`;
  return <span className="ax-live-dot" role="img" aria-label={label} title={label} />;
}

// The bottom bar's Live estimates panel: the shared tool header (traffic and health as its
// state, the estimate's basis on hover) above the metrics, matching Design check.
export function LiveEstimatesPanel({
  result,
  changes,
  requestsPerSecond,
  componentName,
  onClose,
}: {
  result: LiveResult | null;
  changes: LiveChanges | null;
  requestsPerSecond: number;
  componentName: (id: string) => string;
  onClose: () => void;
}) {
  return (
    <section className="ax-tool-panel" aria-label="Live estimates" data-health={result?.summary.health}>
      <ToolPanelHeader
        toolKey="live"
        icon={<Gauge size={16} aria-hidden="true" />}
        title="Live estimates"
        meta={<><HealthDot status={result?.summary.health} />{formatRate(requestsPerSecond)} req/s</>}
        metaTitle={EXPLANATION}
        onClose={onClose}
      />
      <LiveMetricsBar result={result} changes={changes} componentName={componentName} />
    </section>
  );
}
