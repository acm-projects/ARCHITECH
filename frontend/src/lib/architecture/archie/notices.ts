import type { EvaluationFinding, Severity } from "../evaluation/contract.ts";
import type { LiveSummary } from "../evaluation/liveMetrics.ts";
import { formatLatency, formatMonthlyCost, formatRate } from "../implementationStats.ts";

// Archie's notices: what each edit did to the design, posted into Archie's conversation as it
// happens. Deterministic, from the same live evaluation as the design check: which components
// and connections changed, which numbers moved, which problems appeared or were resolved.
// Pure, so the same two designs always produce the same notice.

export type NoticeFinding = { id: string; title: string; severity: Severity };

// The parts of a design a notice compares. Positions and selection are not part of it.
export type NoticeComponent = { id: string; label: string; type: string; implementation?: string; properties?: unknown };
export type NoticeGraph = { nodes: readonly NoticeComponent[]; edges: readonly { source: string; target: string }[] };

export type NoticeSnapshot = {
  graph: NoticeGraph;
  summary: Pick<LiveSummary, "score" | "capacityRps" | "p95LatencyMs" | "monthlyCost" | "uptimePercent">;
  findings: NoticeFinding[];
};

export type NoticeMetric = { label: string; before: string; after: string; better: boolean };

export type ArchieNotice = {
  // "check" is the first look at a design; "change" follows an edit.
  kind: "check" | "change";
  edits: string[];
  metrics: NoticeMetric[];
  added: NoticeFinding[];
  resolved: NoticeFinding[];
  // Problems still open after this change, most serious first.
  open: NoticeFinding[];
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
export const bySeverity = (a: NoticeFinding, b: NoticeFinding) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

// Edits named one by one, up to this many; the rest are counted.
export const MAX_NAMED_EDITS = 3;

export function noticeFindings(findings: readonly EvaluationFinding[]): NoticeFinding[] {
  return findings.map(({ id, title, severity }) => ({ id, title, severity })).sort(bySeverity);
}

const settingsOf = (node: NoticeComponent) => JSON.stringify(node.properties ?? null);

// What changed between two designs, in words: "Added Cache", "Connected API Server → Cache".
export function graphEdits(before: NoticeGraph, after: NoticeGraph): string[] {
  const edits: string[] = [];
  const old = new Map(before.nodes.map((node) => [node.id, node]));
  const now = new Map(after.nodes.map((node) => [node.id, node]));
  const name = (id: string) => now.get(id)?.label ?? old.get(id)?.label ?? id;
  for (const node of after.nodes) {
    const previous = old.get(node.id);
    if (!previous) edits.push(`Added ${node.label}`);
    else if (previous.label !== node.label) edits.push(`Renamed ${previous.label} to ${node.label}`);
    else if ((previous.implementation ?? "") !== (node.implementation ?? "")) edits.push(`Changed ${node.label}'s technology`);
    else if (settingsOf(previous) !== settingsOf(node)) edits.push(`Changed ${node.label}'s settings`);
  }
  for (const node of before.nodes) if (!now.has(node.id)) edits.push(`Removed ${node.label}`);
  const key = (edge: { source: string; target: string }) => `${edge.source}\u0000${edge.target}`;
  const oldEdges = new Set(before.edges.map(key));
  const newEdges = new Set(after.edges.map(key));
  for (const edge of after.edges) if (!oldEdges.has(key(edge))) edits.push(`Connected ${name(edge.source)} → ${name(edge.target)}`);
  for (const edge of before.edges) {
    // A removed component takes its connections with it; that is already said.
    if (!newEdges.has(key(edge)) && now.has(edge.source) && now.has(edge.target)) {
      edits.push(`Disconnected ${name(edge.source)} → ${name(edge.target)}`);
    }
  }
  if (edits.length <= MAX_NAMED_EDITS) return edits;
  return [...edits.slice(0, MAX_NAMED_EDITS), `and ${edits.length - MAX_NAMED_EDITS} more`];
}

const capacity = (value: number | null) => (value === null ? "no limit" : `${formatRate(value)} req/s`);

// The numbers that moved, each with whether the move is an improvement.
export function metricMoves(before: NoticeSnapshot["summary"], after: NoticeSnapshot["summary"]): NoticeMetric[] {
  const moves: NoticeMetric[] = [];
  if (after.score !== before.score) moves.push({ label: "Score", before: String(before.score), after: String(after.score), better: after.score > before.score });
  if (Math.round(after.p95LatencyMs) !== Math.round(before.p95LatencyMs)) {
    moves.push({ label: "p95 latency", before: formatLatency(before.p95LatencyMs), after: formatLatency(after.p95LatencyMs), better: after.p95LatencyMs < before.p95LatencyMs });
  }
  if (after.uptimePercent !== before.uptimePercent) {
    moves.push({ label: "Availability", before: `${before.uptimePercent}%`, after: `${after.uptimePercent}%`, better: after.uptimePercent > before.uptimePercent });
  }
  if (after.capacityRps !== before.capacityRps) {
    const better = after.capacityRps === null || (before.capacityRps !== null && after.capacityRps > before.capacityRps);
    moves.push({ label: "Capacity", before: capacity(before.capacityRps), after: capacity(after.capacityRps), better });
  }
  if (Math.round(after.monthlyCost) !== Math.round(before.monthlyCost)) {
    moves.push({ label: "Monthly cost", before: formatMonthlyCost(before.monthlyCost), after: formatMonthlyCost(after.monthlyCost), better: after.monthlyCost < before.monthlyCost });
  }
  return moves;
}

// The notice for a design, compared with the one before it. Null when nothing worth saying
// changed (a move or a selection re-evaluates to the same design).
export function buildNotice(before: NoticeSnapshot | null, after: NoticeSnapshot): ArchieNotice | null {
  const open = [...after.findings].sort(bySeverity);
  if (!before) return { kind: "check", edits: [], metrics: [], added: open, resolved: [], open };
  const had = new Set(before.findings.map((finding) => finding.id));
  const has = new Set(after.findings.map((finding) => finding.id));
  const added = open.filter((finding) => !had.has(finding.id));
  const resolved = [...before.findings].filter((finding) => !has.has(finding.id)).sort(bySeverity);
  const edits = graphEdits(before.graph, after.graph);
  const metrics = metricMoves(before.summary, after.summary);
  if (edits.length === 0 && metrics.length === 0 && added.length === 0 && resolved.length === 0) return null;
  return { kind: "change", edits, metrics, added, resolved, open };
}

// One sentence for the notice, read first and announced to screen readers.
export function noticeHeadline(notice: ArchieNotice): string {
  const problems = (count: number) => `${count} problem${count === 1 ? "" : "s"}`;
  if (notice.kind === "check") {
    return notice.open.length === 0 ? "Design check: no problems found." : `Design check: ${problems(notice.open.length)} to look at.`;
  }
  const parts: string[] = [];
  if (notice.added.length > 0) parts.push(`${problems(notice.added.length)} found`);
  if (notice.resolved.length > 0) parts.push(`${notice.resolved.length} resolved`);
  const lead = notice.edits[0];
  const score = notice.metrics.find((metric) => metric.label === "Score");
  if (parts.length > 0) return `${lead ? `${lead}: ` : ""}${parts.join(", ")}.`;
  if (score) return `${lead ? `${lead}: ` : ""}score ${score.before} → ${score.after}.`;
  return `${lead ?? "Design updated"}.`;
}
