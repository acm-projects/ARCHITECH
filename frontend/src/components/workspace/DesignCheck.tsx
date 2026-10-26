"use client";

import type { Edge } from "@xyflow/react";
import { ViewportPortal } from "@xyflow/react";
import { ShieldCheck, Undo2, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  checkedFix,
  downtimePerYear,
  formatAvailability,
  strengthenWeakest,
  uptimeBreakdown,
  type CheckedFix,
} from "../../lib/architecture/designCheck";
import type { EvaluationFinding, Severity } from "../../lib/architecture/evaluation/contract";
import type { LiveResult, LiveSummary } from "../../lib/architecture/evaluation/liveMetrics";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";
import { formatLatency, formatMonthlyCost, formatRate } from "../../lib/architecture/implementationStats";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import "./design-check.css";

// Design check over the canvas: the engine's findings marked on the components they are about,
// a list of them with a one-click fix where one follows from the problem
// (lib/architecture/designCheck.ts), and where the design's uptime comes from. A fix is one
// history step, so Undo takes it back.

type Graph = { nodes: ArchitectureFlowNode[]; edges: Edge[] };
export type DesignCheckState = ReturnType<typeof useDesignCheck>;

export function useDesignCheck() {
  const [open, setOpen] = useState(false);
  // The finding whose components are outlined on the canvas.
  const [focus, setFocus] = useState<string | null>(null);
  return { open, setOpen, focus, setFocus };
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_WORD: Record<Severity, string> = { high: "Serious", medium: "Worth fixing", low: "Minor" };
const bySeverity = (a: EvaluationFinding, b: EvaluationFinding) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

// The components a finding is about, for its marks on the canvas: not every component it
// mentions (a missing cache names every service that reads the database).
function markedNodes(finding: EvaluationFinding, nodes: readonly ArchitectureFlowNode[]): string[] {
  if (finding.id === "cache-opportunity") {
    return finding.nodeIds.filter((id) => nodes.find((node) => node.id === id)?.data.type === "database");
  }
  return finding.id.startsWith("connection-") ? finding.nodeIds.slice(0, 2) : finding.nodeIds.slice(0, 1);
}

// What a fix changes, in the numbers that move: "Uptime 99.85% → 99.95% · Cost +$42/mo".
function effect(before: LiveSummary, after: LiveSummary): string[] {
  const parts: string[] = [];
  if (after.score !== before.score) parts.push(`Score ${before.score} → ${after.score}`);
  if (after.uptimePercent !== before.uptimePercent) parts.push(`Uptime ${before.uptimePercent}% → ${after.uptimePercent}%`);
  if (after.capacityRps !== before.capacityRps) {
    const show = (value: number | null) => (value === null ? "no limit" : `${formatRate(value)} req/s`);
    parts.push(`Capacity ${show(before.capacityRps)} → ${show(after.capacityRps)}`);
  }
  if (Math.round(after.p95LatencyMs) !== Math.round(before.p95LatencyMs)) parts.push(`p95 ${formatLatency(before.p95LatencyMs)} → ${formatLatency(after.p95LatencyMs)}`);
  const cost = Math.round(after.monthlyCost - before.monthlyCost);
  if (cost !== 0) parts.push(`Cost ${cost > 0 ? "+" : "−"}${formatMonthlyCost(Math.abs(cost))}`);
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
    width: node.measured?.width ?? node.width ?? 160,
    height: node.measured?.height ?? node.height ?? 56,
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
            style={{ transform: `translate(${x + width - 11}px, ${y - 11}px)` }}
            title={titles}
            aria-label={`${list.length} problem${list.length === 1 ? "" : "s"} with ${node.data.label}: ${titles}`}
            onClick={() => {
              check.setOpen(true);
              check.setFocus(worst.id);
            }}
          >
            {list.length > 1 ? list.length : "!"}
          </button>
        );
      })}
    </ViewportPortal>
  );
}

// ---- The panel ----

export function DesignCheckPanel({
  result,
  nodes,
  edges,
  traffic,
  check,
  onApply,
  onUndo,
}: {
  result: LiveResult | null;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  traffic: TrafficProfile;
  check: DesignCheckState;
  onApply: (graph: Graph) => void;
  onUndo: () => void;
}) {
  const [applied, setApplied] = useState<{ label: string; effect: string[] } | null>(null);
  const ready = Boolean(result?.summary.ready);
  const findings = useMemo(() => (result && ready ? [...result.evaluation.findings].sort(bySeverity) : []), [result, ready]);

  // Fixes are worked out only while the panel is open (each is checked with the engine).
  const checked = useMemo(() => {
    if (!check.open || !result || !ready) return null;
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
  }, [check.open, result, ready, findings, nodes, edges, traffic]);

  if (!result || !ready) return null;
  const serious = findings.filter((finding) => finding.severity !== "low").length;

  const apply = (fix: CheckedFix) => {
    onApply(fix.design as unknown as Graph);
    setApplied({ label: fix.label, effect: effect(fix.before, fix.after) });
    check.setFocus(null);
  };

  if (!check.open) {
    return (
      <button type="button" className="ax-check ax-check-pill" data-clean={findings.length === 0 || undefined} onClick={() => check.setOpen(true)}>
        <ShieldCheck size={14} aria-hidden="true" />
        Design check
        <span className="ax-check-count">{findings.length === 0 ? "no problems" : `${findings.length} problem${findings.length === 1 ? "" : "s"}${serious ? ` · ${serious} serious or worth fixing` : ""}`}</span>
      </button>
    );
  }

  const uptime = checked?.uptime;
  return (
    <section className="ax-check ax-check-panel" aria-label="Design check">
      <header className="ax-check-head">
        <ShieldCheck size={15} aria-hidden="true" />
        <h2>Design check</h2>
        <button
          type="button"
          className="ax-check-close"
          aria-label="Close design check"
          onClick={() => {
            check.setOpen(false);
            check.setFocus(null);
          }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      {applied && (
        <div className="ax-check-applied" role="status">
          <p>
            Applied: <strong>{applied.label}</strong>
            {applied.effect.length > 0 && <span className="ax-check-effect">{applied.effect.join(" · ")}</span>}
          </p>
          <button
            type="button"
            className="ax-check-undo"
            onClick={() => {
              onUndo();
              setApplied(null);
            }}
          >
            <Undo2 size={13} aria-hidden="true" /> Undo
          </button>
        </div>
      )}

      {uptime && (
        <div className="ax-check-uptime">
          <p className="ax-check-uptime-total">
            <strong>{uptime.percent}% uptime</strong> <span>down {downtimePerYear(uptime.percent / 100)}</span>
          </p>
          {uptime.path.length > 0 && (
            <>
              <p className="ax-check-label">A request that goes all the way along the main path needs each of these up:</p>
              <p className="ax-check-chain">
                {uptime.path.map((part, index) => (
                  <span key={part.nodeId} data-weakest={part.nodeId === uptime.weakest?.nodeId || undefined}>
                    {index > 0 && <span className="ax-check-times"> × </span>}
                    {part.name} {formatAvailability(part.availability)}
                    {part.instances > 1 && <span className="ax-check-instances"> ({part.instances}×)</span>}
                  </span>
                ))}
                <span className="ax-check-times"> = </span>
                <strong>{formatAvailability(uptime.pathAvailability)}</strong>
              </p>
              {uptime.pathAvailability * 100 < uptime.percent - 0.005 && (
                <p className="ax-check-note">
                  The overall uptime is higher because some requests finish earlier on the path (cached reads, static files, requests that never reach the database).
                </p>
              )}
              {uptime.weakest && (
                <p className="ax-check-note">
                  The weakest link is <strong>{uptime.weakest.name}</strong>. A part with several instances is up while any one of them is.
                </p>
              )}
              {checked?.stronger && (
                <FixButton fix={checked.stronger} onApply={apply} />
              )}
            </>
          )}
        </div>
      )}

      {findings.length === 0 ? (
        <p className="ax-check-note">No problems found at {formatRate(traffic.requestsPerSecond)} req/s.</p>
      ) : (
        <ol className="ax-check-list">
          {findings.map((finding) => {
            const fix = checked?.fixes.get(finding.id);
            return (
              <li
                key={finding.id}
                data-severity={finding.severity}
                data-focused={check.focus === finding.id || undefined}
                onMouseEnter={() => check.setFocus(finding.id)}
                onFocus={() => check.setFocus(finding.id)}
              >
                <p className="ax-check-title">
                  <span className="ax-check-dot" aria-hidden="true" />
                  <span className="ax-check-severity">{SEVERITY_WORD[finding.severity]}</span>
                  {finding.title}
                </p>
                <p className="ax-check-message">{finding.message}</p>
                {fix ? <FixButton fix={fix} onApply={apply} /> : <p className="ax-check-advice">{finding.recommendation}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function FixButton({ fix, onApply }: { fix: CheckedFix; onApply: (fix: CheckedFix) => void }) {
  const changes = effect(fix.before, fix.after);
  return (
    <div className="ax-check-fix">
      <button type="button" onClick={() => onApply(fix)}>
        <Wrench size={13} aria-hidden="true" /> {fix.label}
      </button>
      {changes.length > 0 && <span className="ax-check-effect">{changes.join(" · ")}</span>}
    </div>
  );
}
