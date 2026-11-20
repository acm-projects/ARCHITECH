"use client";

import type { Edge } from "@xyflow/react";
import { ViewportPortal } from "@xyflow/react";
import { MessageCircleQuestion, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { checkedFix, SEVERITY_WORD, type CheckedFix } from "../../lib/architecture/designCheck";
import type { EvaluationFinding, Severity } from "../../lib/architecture/evaluation/contract";
import type { LiveResult, LiveSummary } from "../../lib/architecture/evaluation/liveMetrics";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { ARCHITECTURE_NODE_SIZE } from "../../lib/architecture/nodeLayout";
import { PanelAction, PanelActions, PanelDetail, PanelGroup, PanelRow, PanelStats, PanelText } from "./panel/Panel";
import "./design-check.css";

// The design check, part of Archie: the engine's findings marked on the components they are
// about, and posted in Archie's notices. A problem opens in Archie's panel with a one-click fix
// where one follows from it (lib/architecture/designCheck.ts). A fix is one history step, so
// Undo takes it back. Any problem can be handed to Archie to explain.

type Graph = { nodes: ArchitectureFlowNode[]; edges: Edge[] };
export type DesignCheckState = ReturnType<typeof useDesignCheck>;

// `onReveal` takes a problem from a mark on the canvas to Archie.
export function useDesignCheck({ onReveal }: { onReveal: (findingId: string) => void }) {
  // The finding open in Archie's panel, whose components are outlined on the canvas.
  const [focus, setFocus] = useState<string | null>(null);
  const reveal = (findingId: string) => onReveal(findingId);
  return { focus, setFocus, reveal };
}

// A problem is open, which takes over Archie's panel until its back button.
export const designCheckInDetail = (check: DesignCheckState) => Boolean(check.focus);

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
  if (findings.length === 0) return null;

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

// The top of Archie's panel: the design's numbers, and a fix just applied with its Undo. A
// problem opened from a notice or a mark on the canvas takes over the panel with its fix.
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
  const focused = result && ready ? result.evaluation.findings.find((finding) => finding.id === check.focus) : undefined;

  // Only the open problem's fix is worked out (it is checked with the engine).
  const focusedFix = useMemo(
    () => (focused && result ? checkedFix(focused, result.evaluation, { nodes, edges } as never, traffic) : null),
    [focused, result, nodes, edges, traffic],
  );

  if (!result || !ready) return null;

  const apply = (fix: CheckedFix) => {
    // A fix may remove its finding, so keep focus on an element that stays.
    anchor.current?.focus({ preventScroll: true });
    onApply(fix.design as unknown as Graph);
    setApplied({ label: fix.label, effect: effect(fix.before, fix.after) });
    check.setFocus(null);
  };

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

      <div hidden={Boolean(focused)}>
        <DesignStats summary={result.summary} />
      </div>

      {focused && (
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
        { label: "Cost /mo", value: `$${Math.round(summary.monthlyCost).toLocaleString("en-US")}` },
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
