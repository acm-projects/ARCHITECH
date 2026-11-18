"use client";

import type { Edge } from "@xyflow/react";
import { ViewportPortal } from "@xyflow/react";
import { MessageCircleQuestion, Undo2 } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  checkedFix,
  downtimePerYear,
  formatAvailability,
  SEVERITY_WORD,
  strengthenWeakest,
  uptimeBreakdown,
  type CheckedFix,
} from "../../lib/architecture/designCheck";
import type { EvaluationFinding, Severity } from "../../lib/architecture/evaluation/contract";
import type { LiveResult, LiveSummary } from "../../lib/architecture/evaluation/liveMetrics";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { ARCHITECTURE_NODE_SIZE } from "../../lib/architecture/nodeLayout";
import { PanelAction, PanelActions, PanelDetail, PanelGroup, PanelLink, PanelRow, PanelStats, PanelText } from "./panel/Panel";
import "./design-check.css";

// Design check over the canvas: the engine's findings marked on the components they are about,
// and, inside Archie's panel, a list of them with a one-click fix where one follows from the
// problem (lib/architecture/designCheck.ts) and where the design's uptime comes from. A fix is
// one history step, so Undo takes it back. Any finding can be handed to Archie to explain.

type Graph = { nodes: ArchitectureFlowNode[]; edges: Edge[] };
export type DesignCheckState = ReturnType<typeof useDesignCheck>;

// On or off, remembered in this browser (in memory when storage is unavailable). On by default.
const ENABLED_KEY = "architech.designCheck";
let enabledInMemory: boolean | null = null;
const enabledListeners = new Set<() => void>();
function readEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(ENABLED_KEY);
    if (stored !== null) return stored !== "off";
  } catch {
    // Storage blocked: fall back to memory.
  }
  return enabledInMemory ?? true;
}
function writeEnabled(on: boolean) {
  enabledInMemory = on;
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? "on" : "off");
  } catch {
    // Remembered for this page only.
  }
  for (const listener of enabledListeners) listener();
}
function subscribeEnabled(listener: () => void) {
  enabledListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    enabledListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// `onReveal` brings Archie's panel forward, where the design check lives.
export function useDesignCheck({ onReveal }: { onReveal: () => void }) {
  // The finding open in Archie's panel, whose components are outlined on the canvas.
  const [focus, setFocus] = useState<string | null>(null);
  // Where the uptime comes from, open in Archie's panel.
  const [uptimeOpen, setUptimeOpen] = useState(false);
  // Every open problem at once, open in Archie's panel.
  const [listOpen, setListOpen] = useState(false);
  // Whether the design check shows at all: marks on the canvas and the list in Archie.
  const enabled = useSyncExternalStore(subscribeEnabled, readEnabled, () => true);
  const setEnabled = (on: boolean) => {
    writeEnabled(on);
    if (!on) {
      setFocus(null);
      setUptimeOpen(false);
      setListOpen(false);
    }
  };
  // A mark on the canvas opens its finding in Archie.
  const reveal = (findingId: string) => {
    setUptimeOpen(false);
    setFocus(findingId);
    onReveal();
  };
  return { focus, setFocus, uptimeOpen, setUptimeOpen, listOpen, setListOpen, enabled, setEnabled, reveal };
}

// A finding or the uptime is open, which takes over Archie's panel until its back button.
export const designCheckInDetail = (check: DesignCheckState) => check.enabled && (Boolean(check.focus) || check.uptimeOpen || check.listOpen);

// The on/off switch for the whole design check, beside its title.
function EnabledSwitch({ check }: { check: DesignCheckState }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={check.enabled}
      aria-label="Design check"
      className="axp-switch"
      title={check.enabled ? "Turn the design check off (hides its findings and their marks on the canvas)" : "Turn the design check on (lists problems and marks them on the canvas)"}
      onClick={() => check.setEnabled(!check.enabled)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const bySeverity = (a: EvaluationFinding, b: EvaluationFinding) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

// The components a finding is about, for its marks on the canvas: not every component it
// mentions (a missing cache names every service that reads the database).
function markedNodes(finding: EvaluationFinding, nodes: readonly ArchitectureFlowNode[]): string[] {
  if (finding.id === "cache-opportunity") {
    return finding.nodeIds.filter((id) => nodes.find((node) => node.id === id)?.data.type === "database");
  }
  return finding.id.startsWith("connection-") ? finding.nodeIds.slice(0, 2) : finding.nodeIds.slice(0, 1);
}

// What a fix changes, in the numbers that move: Availability "99.85% → 99.95%", Cost "+$42/mo".
type Effect = { label: string; value: string };
function effect(before: LiveSummary, after: LiveSummary): Effect[] {
  const parts: Effect[] = [];
  if (after.score !== before.score) parts.push({ label: "Score", value: `${before.score} → ${after.score}` });
  if (after.uptimePercent !== before.uptimePercent) parts.push({ label: "Availability", value: `${before.uptimePercent}% → ${after.uptimePercent}%` });
  if (after.capacityRps !== before.capacityRps) {
    const show = (value: number | null) => (value === null ? "no limit" : `${formatRate(value)} req/s`);
    parts.push({ label: "Capacity", value: `${show(before.capacityRps)} → ${show(after.capacityRps)}` });
  }
  if (Math.round(after.p95LatencyMs) !== Math.round(before.p95LatencyMs)) parts.push({ label: "p95 latency", value: `${formatLatency(before.p95LatencyMs)} → ${formatLatency(after.p95LatencyMs)}` });
  const cost = Math.round(after.monthlyCost - before.monthlyCost);
  if (cost !== 0) parts.push({ label: "Monthly cost", value: `${cost > 0 ? "+" : "−"}${formatMonthlyCost(Math.abs(cost))}` });
  return parts;
}

// ---- On the canvas: a mark on each component with a problem, and an outline for the focused one ----

export function DesignCheckBadges({ result, nodes, check }: { result: LiveResult | null; nodes: readonly ArchitectureFlowNode[]; check: DesignCheckState }) {
  const findings = useMemo(
    () => (result?.summary.ready ? [...result.evaluation.findings].filter((finding) => finding.severity !== "low").sort(bySeverity) : []),
    [result],
  );
  if (!check.enabled || findings.length === 0) return null;

  const perNode = new Map<string, EvaluationFinding[]>();
  for (const finding of findings) {
    for (const id of markedNodes(finding, nodes)) perNode.set(id, [...(perNode.get(id) ?? []), finding]);
  }
  const focused = check.focus ? findings.find((finding) => finding.id === check.focus) : undefined;
  const box = (node: ArchitectureFlowNode) => ({
    x: node.position.x,
    y: node.position.y,
    // Before React Flow measures a node, fall back to the architecture node's own size.
    width: node.measured?.width ?? node.width ?? ARCHITECTURE_NODE_SIZE.width,
    height: node.measured?.height ?? node.height ?? ARCHITECTURE_NODE_SIZE.height,
  });

  return (
    <ViewportPortal>
      {focused &&
        focused.nodeIds.map((id) => {
          const node = nodes.find((candidate) => candidate.id === id);
          if (!node) return null;
          const { x, y, width, height } = box(node);
          return (
            <div
              key={`outline-${id}`}
              className="ax-check-outline"
              data-severity={focused.severity}
              style={{ transform: `translate(${x - 6}px, ${y - 6}px)`, width: width + 12, height: height + 12 }}
              aria-hidden="true"
            />
          );
        })}
      {[...perNode].map(([id, list]) => {
        const node = nodes.find((candidate) => candidate.id === id);
        if (!node) return null;
        const { x, y, width } = box(node);
        const worst = list[0]!;
        const titles = list.map((finding) => finding.title).join("\n");
        return (
          <button
            key={`badge-${id}`}
            type="button"
            className="ax-check-badge nodrag nopan"
            data-severity={worst.severity}
            style={{ transform: `translate(${x + width - 10}px, ${y - 10}px)` }}
            title={titles}
            aria-label={`${worst.severity === "high" ? "High" : "Medium"} severity: ${list.length} problem${list.length === 1 ? "" : "s"} with ${node.data.label}: ${titles}`}
            onClick={() => check.reveal(worst.id)}
          >
            {list.length > 1 ? list.length : "!"}
          </button>
        );
      })}
    </ViewportPortal>
  );
}

// ---- The panel ----

// The design check inside Archie's panel: its title with the switch that turns it off, the
// findings, one line each, then where the uptime comes from. A finding opens in place with its fix.
export function DesignCheckSection({
  result,
  nodes,
  edges,
  traffic,
  check,
  onApply,
  onUndo,
  onAsk,
}: {
  result: LiveResult | null;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  traffic: TrafficProfile;
  check: DesignCheckState;
  onApply: (graph: Graph) => void;
  onUndo: () => void;
  // Hands a question to Archie, below.
  onAsk: (question: string) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [applied, setApplied] = useState<{ label: string; effect: Effect[] } | null>(null);
  const ready = Boolean(result?.summary.ready);
  const findings = useMemo(() => (result && ready ? [...result.evaluation.findings].sort(bySeverity) : []), [result, ready]);

  // Fixes are worked out while the section is on screen (each is checked with the engine).
  const checked = useMemo(() => {
    if (!check.enabled || !result || !ready) return null;
    const design = { nodes, edges };
    const fixes = new Map<string, CheckedFix>();
    for (const finding of findings) {
      const fix = checkedFix(finding, result.evaluation, design as never, traffic);
      if (fix) fixes.set(finding.id, fix);
    }
    return {
      fixes,
      uptime: uptimeBreakdown(result.evaluation, design as never),
      stronger: strengthenWeakest(result.evaluation, design as never, traffic),
    };
  }, [check.enabled, result, ready, findings, nodes, edges, traffic]);

  if (!result || !ready) return null;

  if (!check.enabled) {
    return (
      <>
        <DesignStats summary={result.summary} />
        <PanelGroup title="Design check" meta={<EnabledSwitch check={check} />} />
      </>
    );
  }

  const apply = (fix: CheckedFix) => {
    // A fix may remove its finding, so keep focus on an element that stays.
    anchor.current?.focus({ preventScroll: true });
    onApply(fix.design as unknown as Graph);
    setApplied({ label: fix.label, effect: effect(fix.before, fix.after) });
    check.setFocus(null);
    check.setUptimeOpen(false);
    check.setListOpen(false);
  };

  const uptime = checked?.uptime;
  const focused = findings.find((finding) => finding.id === check.focus);
  const focusedFix = focused && checked?.fixes.get(focused.id);
  const inDetail = Boolean(focused) || (check.uptimeOpen && Boolean(uptime)) || check.listOpen;
  return (
    <div ref={anchor} tabIndex={-1}>
      {applied && (
        <PanelGroup title={`Applied: ${applied.label}`}>
          <div role="status">
            {applied.effect.map(({ label, value }) => <PanelRow key={label} label={label} value={value} />)}
          </div>
          <PanelActions>
            <PanelAction
              onClick={() => {
                anchor.current?.focus({ preventScroll: true });
                onUndo();
                setApplied(null);
              }}
            >
              <Undo2 size={14} aria-hidden="true" /> Undo
            </PanelAction>
          </PanelActions>
        </PanelGroup>
      )}

      <div hidden={inDetail}>
        <DesignStats summary={result.summary} />
        <PanelGroup title="Design check" meta={<EnabledSwitch check={check} />}>
          {findings.length === 0 ? (
            <PanelText>No problems found at {formatRate(traffic.requestsPerSecond)} req/s.</PanelText>
          ) : (
            <PanelLink
              item
              label={`${findings.length} open problem${findings.length === 1 ? "" : "s"}`}
              value={SEVERITY_WORD[findings[0]!.severity]}
              title="Every problem the design check found"
              onClick={() => check.setListOpen(true)}
            />
          )}
          {uptime && <PanelLink item label="Availability breakdown" value={`${uptime.percent}%`} onClick={() => check.setUptimeOpen(true)} />}
        </PanelGroup>
      </div>

      {focused ? (
        <PanelDetail key={focused.id} title={focused.title} onBack={() => check.setFocus(null)}>
          <PanelGroup>
            <PanelRow label="Severity" value={SEVERITY_WORD[focused.severity]} />
          </PanelGroup>
          <PanelText>{focused.message}</PanelText>
          {focusedFix ? <FixAction fix={focusedFix} onApply={apply} /> : <PanelText>{focused.recommendation}</PanelText>}
          <PanelActions>
            <PanelAction
              onClick={() => {
                check.setFocus(null);
                onAsk(`Explain "${focused.title}" in my design: why it matters and what to change.`);
              }}
            >
              <MessageCircleQuestion size={14} aria-hidden="true" /> Ask Archie about this
            </PanelAction>
          </PanelActions>
        </PanelDetail>
      ) : check.listOpen ? (
        <PanelDetail title="Open problems" onBack={() => check.setListOpen(false)}>
          <PanelGroup>
            {findings.map((finding) => (
              <PanelLink
                key={finding.id}
                item
                label={finding.title}
                value={SEVERITY_WORD[finding.severity]}
                title={finding.title}
                onClick={() => {
                  check.setListOpen(false);
                  check.setFocus(finding.id);
                }}
              />
            ))}
          </PanelGroup>
        </PanelDetail>
      ) : check.uptimeOpen && uptime && (
        <PanelDetail title="Availability" onBack={() => check.setUptimeOpen(false)}>
          <PanelGroup>
            <PanelRow label="Availability" value={`${uptime.percent}%`} />
            <PanelRow label="Downtime" value={downtimePerYear(uptime.percent / 100)} />
          </PanelGroup>
          {uptime.path.length > 0 && (
            <PanelGroup title="Main path" meta={formatAvailability(uptime.pathAvailability)}>
              {uptime.path.map((part) => (
                <PanelRow
                  key={part.nodeId}
                  item
                  label={`${part.name}${part.instances > 1 ? ` (${part.instances}×)` : ""}`}
                  value={`${part.nodeId === uptime.weakest?.nodeId ? "Weakest · " : ""}${formatAvailability(part.availability)}`}
                />
              ))}
              {uptime.pathAvailability * 100 < uptime.percent - 0.005 && (
                <PanelText>Overall availability is higher because some requests finish earlier on the path.</PanelText>
              )}
            </PanelGroup>
          )}
          {checked?.stronger && <FixAction fix={checked.stronger} onApply={apply} />}
        </PanelDetail>
      )}
    </div>
  );
}

// The design's numbers right now, one line at the top of Archie's panel, so every answer and
// notice below reads against them.
function DesignStats({ summary }: { summary: LiveSummary }) {
  return (
    <PanelStats
      label="Design right now"
      stats={[
        { label: "Score", value: summary.score },
        { label: "p95", value: formatLatency(summary.p95LatencyMs) },
        { label: "Uptime", value: `${summary.uptimePercent}%` },
        { label: "Cost", value: formatMonthlyCost(summary.monthlyCost) },
      ]}
    />
  );
}

function FixAction({ fix, onApply }: { fix: CheckedFix; onApply: (fix: CheckedFix) => void }) {
  return (
    <PanelGroup>
      {effect(fix.before, fix.after).map(({ label, value }) => <PanelRow key={label} label={label} value={value} />)}
      <PanelActions>
        <PanelAction onClick={() => onApply(fix)}>{fix.label}</PanelAction>
      </PanelActions>
    </PanelGroup>
  );
}
