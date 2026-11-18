"use client";

import { Gauge } from "lucide-react";

import { downtimePerYear } from "../../lib/architecture/designCheck";
import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { demandVsCapacity } from "../../lib/architecture/evaluation/resultsView";
import { formatLatency, formatRate } from "../../lib/architecture/implementationStats";
import Panel, { PanelChange, PanelHealth, PanelText, PanelTile, PanelTiles } from "./panel/Panel";

// Live estimates: what the design does at the current traffic, re-read on every edit (no Run
// needed), as widget tiles read at a glance. Load leads, across the full width with its ring;
// latency, availability, cost and the bottleneck sit two to a row under it. The score stays in
// the header, so it can be read with the panel folded. An arrow marks a number the last change
// moved.

const EXPLANATION =
  "Estimated live by ARCHITECH's metrics engine from each component's technology and settings and the traffic. " +
  "Directionally correct and explainable, not exact: real systems depend on much more. " +
  "Run gives the full breakdown; docs/metrics-model.md lists every assumption.";

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
// "2.8×" close to the limit, where the decimal matters, and "14×" far from it.
const multiple = (value: number) => `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}×`;
// The latency figure without its unit, which the tile sets small beside it.
const latencyFigure = (ms: number) => formatLatency(ms).replace(/ ms$/, "");
const dollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

// How far the traffic can grow before the design is full, or how much of it already goes unserved.
function headroom(requestsPerSecond: number, capacityRps: number): string {
  if (capacityRps <= 0) return "Nothing on the request path can serve traffic";
  const utilization = requestsPerSecond / capacityRps;
  if (utilization > 1) return `${formatRate(requestsPerSecond - capacityRps)} req/s not served`;
  if (utilization <= 0) return "No traffic";
  return `${multiple(1 / utilization)} headroom`;
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
  const downtime = summary ? downtimePerYear(summary.uptimePercent / 100) : "";
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
          <PanelTiles label="Live estimates">
            <PanelTile
              wide
              label="Load"
              value={capacity === null ? "No limit" : load.utilization === null ? "Over" : percent(load.utilization)}
              unit={load.utilization === null ? undefined : "of capacity"}
              change={<PanelChange direction={changes?.capacityRps} />}
              caption={capacity === null
                ? `${formatRate(requestsPerSecond)} req/s · nothing limits it`
                : `${formatRate(requestsPerSecond)} of ${formatRate(capacity)} req/s · ${headroom(requestsPerSecond, capacity)}`}
              tone={load.state === "exceeds" ? "danger" : undefined}
              gauge={capacity === null ? undefined : {
                label: "Load against capacity",
                // No capacity at all reads as fully over.
                fraction: load.utilization ?? (load.state === "exceeds" ? Infinity : 0),
                caption: headroom(requestsPerSecond, capacity),
              }}
              title="Traffic against the requests per second the design can serve"
            />
            <PanelTile
              label="p95 latency"
              value={latencyFigure(summary.p95LatencyMs)}
              unit="ms"
              change={<PanelChange direction={changes?.p95LatencyMs} />}
            />
            <PanelTile
              label="Availability"
              value={`${summary.uptimePercent}%`}
              change={<PanelChange direction={changes?.uptimePercent} />}
              caption={`${downtime.replace(" a year", "")} down/yr`}
              title={`Downtime: ${downtime}`}
            />
            <PanelTile
              label="Monthly cost"
              value={dollars(summary.monthlyCost)}
              unit="/mo"
              change={<PanelChange direction={changes?.monthlyCost} />}
            />
            <PanelTile
              label="Bottleneck"
              value={summary.limitingNodeId ? componentName(summary.limitingNodeId) : "None"}
              caption={summary.limitingNodeId ? "Fills up first" : "Nothing limits it"}
              title="The component that reaches its capacity first as traffic grows"
            />
          </PanelTiles>
        </div>
      ) : (
        <PanelText>No request path yet. Connect a client to a component.</PanelText>
      )}
    </Panel>
  );
}
