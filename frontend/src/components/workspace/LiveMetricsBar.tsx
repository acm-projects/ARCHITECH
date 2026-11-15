"use client";

import { Activity, Award, Gauge, Timer, TriangleAlert, Users, Wallet } from "lucide-react";

import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import Panel, { PanelChange, PanelHealth, PanelStat, PanelStats, PanelText } from "./panel/Panel";

// Live estimates: the design's score and headline numbers at the current traffic, updated as
// components are added, removed, connected or reconfigured (no Run needed). Each number is a
// small widget, and an arrow shows which way it moved with the last change.

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
    <Panel toolKey="live" icon={<Gauge size={17} aria-hidden="true" />} title="Live estimates" onClose={onClose}>
      {summary?.ready ? (
        <div aria-live="polite" title={`At ${formatRate(requestsPerSecond)} req/s. ${EXPLANATION}`}>
          <PanelStats label="Live estimates">
            <PanelStat
              icon={<Award aria-hidden="true" />}
              label="Score"
              value={<><PanelHealth status={summary.health} />{summary.score}<PanelChange direction={changes?.score} /></>}
            />
            <PanelStat
              icon={<Users aria-hidden="true" />}
              label="Capacity"
              value={<>{summary.capacityRps === null ? "No limit" : `${formatRate(summary.capacityRps)}/s`}<PanelChange direction={changes?.capacityRps} /></>}
              title="Requests per second the design can serve"
            />
            <PanelStat
              icon={<Timer aria-hidden="true" />}
              label="p95 latency"
              value={<>{formatLatency(summary.p95LatencyMs)}<PanelChange direction={changes?.p95LatencyMs} /></>}
            />
            <PanelStat
              icon={<Wallet aria-hidden="true" />}
              label="Monthly cost"
              value={<>{formatMonthlyCost(summary.monthlyCost)}<PanelChange direction={changes?.monthlyCost} /></>}
            />
            <PanelStat
              icon={<Activity aria-hidden="true" />}
              label="Availability"
              value={<>{summary.uptimePercent}%<PanelChange direction={changes?.uptimePercent} /></>}
            />
            {summary.limitingNodeId && (
              <PanelStat
                icon={<TriangleAlert aria-hidden="true" />}
                label="Bottleneck"
                value={componentName(summary.limitingNodeId)}
                title={summary.topIssue?.title}
              />
            )}
          </PanelStats>
        </div>
      ) : (
        <PanelText>Connect a client to your components to see live metrics.</PanelText>
      )}
    </Panel>
  );
}
