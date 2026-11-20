"use client";

import { Activity, CircleDollarSign, Hourglass, ShieldCheck, Timer } from "lucide-react";

import { downtimePerYear } from "../../lib/architecture/designCheck";
import type { ArchitectureEvaluation, NodeEvaluation } from "../../lib/architecture/evaluation/contract";
import type { LiveChanges, LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import { demandVsCapacity } from "../../lib/architecture/evaluation/resultsView";
import { formatLatency, formatRate } from "../../lib/architecture/implementationStats";
import { PanelChange, PanelGroup, PanelHealth, PanelText, PanelTile, PanelTiles, type PanelTileHue } from "./panel/Panel";

// Live estimates: what the design does at the current traffic, re-read on every edit (no Run
// needed), inside the Simulation panel, as widget tiles read at a glance. Load leads, across the full width with its ring;
// latency, availability, cost and the bottleneck sit two to a row under it. Load and the
// bottleneck take their color from how full they are; the others keep one color each so they
// can be told apart. Hovering or focusing a tile shows where its number comes from. The score
// stays in the header, so it can be read with the panel folded. An arrow marks a number the
// last change moved.

const EXPLANATION =
  "Estimated live by ARCHITECH's metrics engine from each component's technology and settings and the traffic. " +
  "Directionally correct and explainable, not exact: real systems depend on much more. " +
  "Run gives the full breakdown; docs/metrics-model.md lists every assumption.";

// Past this share of capacity a component is getting tight: latency starts to climb.
const TIGHT = 0.7;
const MAX_COST_ROWS = 3;

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
// "2.8×" close to the limit, where the decimal matters, and "14×" far from it.
const multiple = (value: number) => `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}×`;
// The latency figure without its unit, which the tile sets small beside it.
const latencyFigure = (ms: number) => formatLatency(ms).replace(/ ms$/, "");
const dollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const nines = (fraction: number) => `${Math.round(fraction * 100_000) / 1_000}%`;

// How full something is, as a color and a word.
function fullness(utilization: number | null, over: boolean): { hue: PanelTileHue; word: string } {
  if (over || (utilization !== null && utilization > 1)) return { hue: "over", word: "Over capacity" };
  if (utilization === null) return { hue: "good", word: "No limit" };
  if (utilization >= TIGHT) return { hue: "warn", word: "Getting tight" };
  return { hue: "good", word: "Comfortable" };
}

// How far the traffic can grow before the design is full, or how much of it already goes unserved.
function headroom(requestsPerSecond: number, capacityRps: number): string {
  if (capacityRps <= 0) return "Nothing on the request path can serve traffic";
  const utilization = requestsPerSecond / capacityRps;
  if (utilization > 1) return `${formatRate(requestsPerSecond - capacityRps)} req/s not served`;
  if (utilization <= 0) return "No traffic";
  return `${multiple(1 / utilization)} headroom`;
}

// The components requests pass through and wait on, never the client itself.
const served = (evaluation: ArchitectureEvaluation) =>
  evaluation.nodes.filter((node) => node.reachable && node.type !== "client");

function latencyDetail(evaluation: ArchitectureEvaluation, name: (id: string) => string): string {
  const path = evaluation.criticalPath.map(name);
  const onPath = served(evaluation).filter((node) => evaluation.criticalPath.includes(node.nodeId));
  const slowest = onPath.reduce<NodeEvaluation | null>((worst, node) => (!worst || node.latencyMs > worst.latencyMs ? node : worst), null);
  const route = path.length > 0 ? `Slowest path: ${path.join(" → ")}` : "";
  return slowest ? `${route}. Most time in ${name(slowest.nodeId)} (${formatLatency(slowest.latencyMs)}).` : route;
}

function uptimeDetail(evaluation: ArchitectureEvaluation, name: (id: string) => string, downtime: string): string {
  const weakest = served(evaluation).reduce<NodeEvaluation | null>((worst, node) => (!worst || node.availability < worst.availability ? node : worst), null);
  return weakest
    ? `Down ${downtime}. Weakest link: ${name(weakest.nodeId)} at ${nines(weakest.availability)}.`
    : `Down ${downtime}.`;
}

function costDetail(evaluation: ArchitectureEvaluation, name: (id: string) => string): string {
  const priciest = [...evaluation.nodes]
    .filter((node) => node.monthlyCost > 0)
    .sort((a, b) => b.monthlyCost - a.monthlyCost)
    .slice(0, MAX_COST_ROWS);
  if (priciest.length === 0) return "Nothing in the design costs anything yet.";
  return `Most of it: ${priciest.map((node) => `${name(node.nodeId)} ${dollars(node.monthlyCost)}`).join(" · ")}`;
}

function limitDetail(node: NodeEvaluation | undefined, name: (id: string) => string): string {
  if (!node) return "Nothing fills up at any traffic: no component on the path has a limit.";
  const capacity = node.capacityRps === null ? "no limit" : `${formatRate(node.capacityRps)} req/s`;
  const instances = node.instances === 1 ? "1 instance" : `${node.instances} instances`;
  return `${name(node.nodeId)} serves ${formatRate(node.demandRps)} of ${capacity} on ${instances}. It caps the whole design.`;
}

// Live estimates sit at the top of the Simulation panel: what the design does right now, before
// (and while) a run checks it.
export function LiveEstimates({
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
  const summary = result?.summary.ready ? result.summary : null;
  const evaluation = summary ? result?.evaluation : undefined;
  const capacity = summary?.capacityRps ?? null;
  const load = demandVsCapacity({ requestedRps: requestsPerSecond, capacityRps: capacity });
  const loadState = fullness(capacity === null ? null : load.utilization, load.state === "exceeds");
  const downtime = summary ? downtimePerYear(summary.uptimePercent / 100) : "";
  const limiting = evaluation?.nodes.find((node) => node.nodeId === summary?.limitingNodeId);
  const limitState = fullness(limiting ? limiting.utilization : null, false);
  return (
    <PanelGroup
      title="Live estimates"
      meta={summary && <><PanelHealth status={summary.health}>Score {summary.score}</PanelHealth><PanelChange direction={changes?.score} /></>}
    >
      {summary && evaluation ? (
        <div aria-live="polite" title={`At ${formatRate(requestsPerSecond)} req/s. ${EXPLANATION}`}>
          <PanelTiles label="Live estimates">
            <PanelTile
              wide
              icon={<Activity />}
              hue={loadState.hue}
              label={`Load · ${loadState.word}`}
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
              detail={capacity === null
                ? "No component on the request path has a limit, so any traffic gets through."
                : `The design takes up to ${formatRate(capacity)} req/s before ${summary.limitingNodeId ? componentName(summary.limitingNodeId) : "it"} fills up. Past ${percent(TIGHT)} latency starts to climb.`}
            />
            <PanelTile
              icon={<Timer />}
              hue="latency"
              label="p95 latency"
              value={latencyFigure(summary.p95LatencyMs)}
              unit="ms"
              change={<PanelChange direction={changes?.p95LatencyMs} />}
              caption="95 in 100 requests"
              detail={latencyDetail(evaluation, componentName)}
            />
            <PanelTile
              icon={<ShieldCheck />}
              hue="uptime"
              label="Availability"
              value={`${summary.uptimePercent}%`}
              change={<PanelChange direction={changes?.uptimePercent} />}
              caption={`${downtime.replace(" a year", "")} down/yr`}
              detail={uptimeDetail(evaluation, componentName, downtime)}
            />
            <PanelTile
              icon={<CircleDollarSign />}
              hue="cost"
              label="Monthly cost"
              value={dollars(summary.monthlyCost)}
              unit="/mo"
              change={<PanelChange direction={changes?.monthlyCost} />}
              caption={`${dollars(summary.monthlyCost * 12)} a year`}
              detail={costDetail(evaluation, componentName)}
            />
            <PanelTile
              icon={<Hourglass />}
              hue={limiting ? limitState.hue : "good"}
              label="Bottleneck"
              value={summary.limitingNodeId ? componentName(summary.limitingNodeId) : "None"}
              caption={limiting ? `${percent(limiting.utilization)} full · fills first` : "Nothing limits it"}
              detail={limitDetail(limiting, componentName)}
            />
          </PanelTiles>
        </div>
      ) : (
        <PanelText>No request path yet. Connect a client to a component.</PanelText>
      )}
    </PanelGroup>
  );
}
