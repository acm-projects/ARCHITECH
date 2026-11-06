"use client";

import { Gauge } from "lucide-react";

import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import Panel, { PanelChange, PanelGroup, PanelHealth, PanelRow, PanelText } from "./panel/Panel";

// Live estimates: the design's score and headline numbers at the current traffic, updated as
// components are added, removed, connected or reconfigured (no Run needed). An arrow shows which
// way each number moved with the last change.

const EXPLANATION =
  "Estimated live by ARCHITECH's metrics engine from each component's technology and settings and the traffic. " +
  "Directionally correct and explainable, not exact: real systems depend on much more. " +
  "Run gives the full breakdown; docs/metrics-model.md lists every assumption.";

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
  // Display name for a component id (the limiting component).
  componentName: (id: string) => string;
  onClose: () => void;
}) {
  const summary = result?.summary;
  return (
    <Panel
      toolKey="live"
      icon={<Gauge size={17} aria-hidden="true" />}
      title="Live estimates"
      status={<PanelHealth status={summary?.health}>{formatRate(requestsPerSecond)} req/s</PanelHealth>}
      statusTitle={EXPLANATION}
      onClose={onClose}
    >
      {summary?.ready ? (
        <PanelGroup>
          <div aria-live="polite">
            <PanelRow label="Score" value={<>{summary.score}<PanelChange direction={changes?.score} /></>} />
            <PanelRow
              label="Capacity"
              value={<>{summary.capacityRps === null ? "no limit" : `${formatRate(summary.capacityRps)} req/s`}<PanelChange direction={changes?.capacityRps} /></>}
            />
            <PanelRow label="p95 latency" value={<>{formatLatency(summary.p95LatencyMs)}<PanelChange direction={changes?.p95LatencyMs} /></>} />
            <PanelRow label="Monthly cost" value={<>{formatMonthlyCost(summary.monthlyCost)}<PanelChange direction={changes?.monthlyCost} /></>} />
            <PanelRow label="Availability" value={<>{summary.uptimePercent}%<PanelChange direction={changes?.uptimePercent} /></>} />
            {summary.limitingNodeId && (
              <PanelRow label="Bottleneck" value={componentName(summary.limitingNodeId)} title={summary.topIssue?.title} />
            )}
          </div>
        </PanelGroup>
      ) : (
        <PanelText>Connect a client to your components to see live metrics.</PanelText>
      )}
    </Panel>
  );
}
