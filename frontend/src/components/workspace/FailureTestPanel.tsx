"use client";

import { ZapOff } from "lucide-react";

import type { FailureImpact } from "../../lib/architecture/evaluation/failure";
import { formatLatency, formatRate } from "../../lib/architecture/implementationStats";
import Panel, { PanelAction, PanelActions, PanelGroup, PanelMeter, PanelRow, PanelText } from "./panel/Panel";

// Failure test: one component is down, and this says how much of the traffic still gets an
// answer, who picks up its work, and what the rest of the design can do without it.

const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(2)}%`;

function servedCaption(impact: FailureImpact, name: string, names: string[]): string {
  if (impact.servedPercent <= 0) return `Every request needs ${name}`;
  if (impact.servedPercent >= 100) {
    return names.length > 0 ? `${names.join(", ")} take${names.length === 1 ? "s" : ""} over` : `Nothing depends on ${name}`;
  }
  return `${percent(100 - impact.servedPercent)} of requests need ${name}`;
}

export function FailureTestPanel({
  impact,
  requestsPerSecond,
  componentName,
  onRestore,
}: {
  // Null while the first reading is being taken.
  impact: FailureImpact | null;
  requestsPerSecond: number;
  componentName: (id: string) => string;
  onRestore: () => void;
}) {
  return (
    <Panel
      icon={<ZapOff size={17} aria-hidden="true" />}
      title="Failure test"
      status={impact ? `${percent(impact.servedPercent)} served` : undefined}
      closeLabel="End failure test"
      onClose={onRestore}
    >
      {impact ? (
        <div aria-live="polite">
          <PanelGroup>
            <PanelRow label="Down" value={componentName(impact.nodeId)} />
            <PanelRow label="Requests served" value={percent(impact.servedPercent)} />
            <PanelMeter
              label="Requests still served"
              fraction={impact.servedPercent / 100}
              caption={servedCaption(impact, componentName(impact.nodeId), impact.takeover.map(componentName))}
            />
          </PanelGroup>
          {impact.remaining && (
            <PanelGroup title="Without it">
              <PanelRow
                label="Capacity"
                value={impact.remaining.capacityRps === null
                  ? "No limit"
                  : `${formatRate(impact.remaining.capacityRps)} req/s`}
                title={`Traffic is ${formatRate(requestsPerSecond)} req/s`}
              />
              {impact.remaining.capacityRps !== null && impact.remaining.capacityRps < requestsPerSecond && (
                <PanelText tone="danger">
                  {formatRate(requestsPerSecond - impact.remaining.capacityRps)} req/s over what is left
                </PanelText>
              )}
              <PanelRow label="p95 latency" value={formatLatency(impact.remaining.p95LatencyMs)} />
            </PanelGroup>
          )}
          <PanelActions>
            <PanelAction onClick={onRestore}>Restore {componentName(impact.nodeId)}</PanelAction>
          </PanelActions>
        </div>
      ) : (
        <PanelText role="status">Measuring…</PanelText>
      )}
    </Panel>
  );
}
