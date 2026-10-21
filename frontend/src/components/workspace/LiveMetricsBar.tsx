"use client";

import { Info } from "lucide-react";

import type { Direction } from "../../lib/architecture/evaluation/comparison";
import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
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
  requestsPerSecond,
  componentName,
}: {
  result: LiveResult | null;
  changes: LiveChanges | null;
  requestsPerSecond: number;
  // Display name for a component id (the limiting component).
  componentName: (id: string) => string;
}) {
  if (!result) return null;
  const { summary } = result;
  return (
    <section className="ax-live" aria-label="Live metrics" aria-live="polite" data-health={summary.health}>
      <div className="ax-live-head">
        <span className="ax-live-dot" aria-hidden="true" />
        <span>Live · {formatRate(requestsPerSecond)} req/s</span>
        <span>{summary.health}</span>
        <span className="ax-live-info" title={EXPLANATION} aria-label={EXPLANATION} role="img">
          <Info size={12} aria-hidden="true" />
        </span>
      </div>
      {summary.ready ? (
        <>
          <div className="ax-live-row">
            <Metric label="Score" value={String(summary.score)} direction={changes?.score} />
            <Metric
              label="Capacity"
              value={summary.capacityRps === null ? "no limit" : `${formatRate(summary.capacityRps)} req/s`}
              direction={changes?.capacityRps}
            />
            <Metric label="p95" value={formatLatency(summary.p95LatencyMs)} direction={changes?.p95LatencyMs} />
            <Metric label="Cost" value={formatMonthlyCost(summary.monthlyCost)} direction={changes?.monthlyCost} />
            <Metric label="Uptime" value={`${summary.uptimePercent}%`} direction={changes?.uptimePercent} />
          </div>
          {(summary.limitingNodeId || summary.topIssue) && (
            <p className="ax-live-note">
              {summary.limitingNodeId && <>Fills up first: {componentName(summary.limitingNodeId)}. </>}
              {summary.topIssue && <>{summary.topIssue.title}</>}
            </p>
          )}
        </>
      ) : (
        <p className="ax-live-note">Connect a client to your components to see live metrics.</p>
      )}
    </section>
  );
}
