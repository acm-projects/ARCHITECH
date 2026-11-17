"use client";

import { Gauge } from "lucide-react";

import { downtimePerYear } from "../../lib/architecture/designCheck";
import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { demandVsCapacity } from "../../lib/architecture/evaluation/resultsView";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import Panel, { PanelChange, PanelGroup, PanelHealth, PanelMeter, PanelRow, PanelText } from "./panel/Panel";

// Live estimates: what the design does at the current traffic, re-read on every edit (no Run
// needed). The panel leads with the question the canvas keeps asking, how much of the capacity
// this traffic uses, and lists the rest under it. The score stays in the header, so it can be
// read with the panel folded. An arrow marks a number the last change moved.

const EXPLANATION =
  "Estimated live by ARCHITECH's metrics engine from each component's technology and settings and the traffic. " +
  "Directionally correct and explainable, not exact: real systems depend on much more. " +
  "Run gives the full breakdown; docs/metrics-model.md lists every assumption.";

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
// "2.8×" close to the limit, where the decimal matters, and "14×" far from it.
const multiple = (value: number) => `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}×`;

// The line under the load meter: how full the design is, and how far the traffic can grow
// before it is (or how much of it already goes unserved).
function loadCaption(requestsPerSecond: number, capacityRps: number): string {
  if (capacityRps <= 0) return "Nothing on the request path can serve traffic";
  const utilization = requestsPerSecond / capacityRps;
  if (utilization > 1) return `${percent(utilization)} of capacity · ${formatRate(requestsPerSecond - capacityRps)} req/s not served`;
  if (utilization <= 0) return "No traffic";
  return `${percent(utilization)} of capacity · ${multiple(1 / utilization)} headroom`;
}

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
  const summary = result?.summary.ready ? result.summary : null;
  const capacity = summary?.capacityRps ?? null;
  const load = demandVsCapacity({ requestedRps: requestsPerSecond, capacityRps: capacity });
  return (
    <Panel
      toolKey="live"
      icon={<Gauge size={17} aria-hidden="true" />}
      title="Live estimates"
      status={summary && <><PanelHealth status={summary.health}>Score {summary.score}</PanelHealth><PanelChange direction={changes?.score} /></>}
      onClose={onClose}
    >
      {summary ? (
        <div aria-live="polite" title={`At ${formatRate(requestsPerSecond)} req/s. ${EXPLANATION}`}>
          <PanelGroup>
            <PanelRow
              label="Load"
              value={<>
                {capacity === null
                  ? `${formatRate(requestsPerSecond)} req/s · no limit`
                  : `${formatRate(requestsPerSecond)} of ${formatRate(capacity)} req/s`}
                <PanelChange direction={changes?.capacityRps} />
              </>}
              title="Traffic against the requests per second the design can serve"
            />
            {capacity !== null && (
              <PanelMeter
                label="Load against capacity"
                // No capacity at all reads as fully over.
                fraction={load.utilization ?? (load.state === "exceeds" ? Infinity : 0)}
                caption={loadCaption(requestsPerSecond, capacity)}
              />
            )}
          </PanelGroup>
          <PanelGroup>
            {summary.limitingNodeId && (
              <PanelRow
                label="Bottleneck"
                value={componentName(summary.limitingNodeId)}
                title="The component that reaches its capacity first as traffic grows"
              />
            )}
            <PanelRow
              label="p95 latency"
              value={<>{formatLatency(summary.p95LatencyMs)}<PanelChange direction={changes?.p95LatencyMs} /></>}
            />
            <PanelRow
              label="Availability"
              value={<>{summary.uptimePercent}%<PanelChange direction={changes?.uptimePercent} /></>}
              title={`Downtime: ${downtimePerYear(summary.uptimePercent / 100)}`}
            />
            <PanelRow
              label="Monthly cost"
              value={<>{formatMonthlyCost(summary.monthlyCost)}<PanelChange direction={changes?.monthlyCost} /></>}
            />
          </PanelGroup>
        </div>
      ) : (
        <PanelText>No request path yet. Connect a client to a component.</PanelText>
      )}
    </Panel>
  );
}
