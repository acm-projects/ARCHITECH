import { applyChanges, type Change } from "../ai/changes.ts";
import { roleOf } from "./analysis.ts";
import { DATABASE_REPLICAS_MAX, REPLICAS_MAX } from "./evaluation/capabilities.ts";
import type { ArchitectureEvaluation, EvaluationFinding } from "./evaluation/contract.ts";
import { createEvaluationCache, sharedEvaluationCache, type LiveSummary } from "./evaluation/liveMetrics.ts";
import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// Design check: the problems the evaluation engine finds, shown on the canvas, each with a
// one-click fix where a fix follows from the problem itself (no AI): run a second instance of
// a single point of failure, add a read replica, put a cache in front of a database, route a
// client through an API server, add a worker to a queue nobody reads. And where the design's
// uptime comes from: the parts of the main request path, multiplied, and the weakest one.
//
// Fixes are change lists for the same applyChanges the AI Architect uses (lib/ai/changes.ts),
// so they are validated and placed the same way. A fix is only offered when the engine says it
// helps: re-evaluated with the change, the problem is gone or the score went up.

type DesignNode = {
  id: string;
  position: { x: number; y: number };
  data: { type: ArchitectureNodeType; label: string; implementation?: string; properties?: NodeProperties };
};
type DesignEdge = { id: string; source: string; target: string };
export type Design<N extends DesignNode = DesignNode, E extends DesignEdge = DesignEdge> = { nodes: readonly N[]; edges: readonly E[] };

export type FixPlan = {
  findingId: string;
  // Imperative and specific: "Run 2 instances of Orders API".
  label: string;
  changes: Change[];
};

// Below this share of capacity a component has room to absorb spikes (the engine's
// "near capacity" warning starts above it).
const TARGET_UTILIZATION = 0.7;

const nameOf = (design: Design, id: string) => {
  const node = design.nodes.find((candidate) => candidate.id === id);
  return node ? node.data.label?.trim() || node.data.type : id;
};
const typeOf = (design: Design, id: string) => design.nodes.find((candidate) => candidate.id === id)?.data.type;

// More instances of one component, as the engine counts them: a database's instances are its
// primary plus read replicas; everything else runs `replicas` instances.
function moreInstances(design: Design, evaluation: ArchitectureEvaluation, findingId: string, nodeId: string, wanted: (current: number) => number): FixPlan | null {
  const type = typeOf(design, nodeId);
  const measured = evaluation.nodes.find((node) => node.nodeId === nodeId);
  if (!type || !measured || type === "custom" || roleOf(type) === "entry") return null;
  const current = measured.instances;
  const target = Math.max(current + 1, wanted(current));
  const name = nameOf(design, nodeId);
  if (roleOf(type) === "database") {
    const replicas = Math.min(DATABASE_REPLICAS_MAX, target - 1);
    if (replicas <= current - 1) return null;
    return {
      findingId,
      label: replicas === 1 ? `Add a read replica to ${name}` : `Give ${name} ${replicas} read replicas`,
      changes: [{ op: "set_setting", node: nodeId, key: "replicas", value: replicas }],
    };
  }
  const replicas = Math.min(REPLICAS_MAX, Math.max(2, target));
  if (replicas <= current) return null;
  return { findingId, label: `Run ${replicas} instances of ${name}`, changes: [{ op: "set_setting", node: nodeId, key: "replicas", value: replicas }] };
}

// The fix for one finding, or null when there is no fix that follows from the finding alone.
export function planFix(finding: EvaluationFinding, evaluation: ArchitectureEvaluation, design: Design): FixPlan | null {
  const id = finding.id;
  const first = finding.nodeIds[0];

  // Losing it takes others down, or it is the least available link: a second instance.
  if ((id.startsWith("spof-") || id.startsWith("database-redundancy-") || id === "low-availability") && first) {
    return moreInstances(design, evaluation, id, first, (current) => current + 1);
  }

  // Out of capacity: enough instances to bring it back under 70%.
  if ((id.startsWith("saturated-") || id.startsWith("backlog-")) && first) {
    const utilization = evaluation.nodes.find((node) => node.nodeId === first)?.utilization ?? 0;
    return moreInstances(design, evaluation, id, first, (current) => Math.ceil((current * utilization) / TARGET_UTILIZATION));
  }

  // Reads reach the database with no cache: a cache between the services and the database.
  if (id === "cache-opportunity") {
    const database = finding.nodeIds.find((nodeId) => typeOf(design, nodeId) === "database");
    if (!database) return null;
    // Request handlers read through the cache; workers keep writing straight to the database.
    const callers = design.edges
      .filter((edge) => edge.target === database)
      .map((edge) => edge.source)
      .filter((source) => {
        const type = typeOf(design, source);
        return type !== undefined && type !== "worker" && (roleOf(type) === "compute" || roleOf(type) === "ingress");
      });
    if (callers.length === 0) return null;
    return {
      findingId: id,
      label: `Put a cache in front of ${nameOf(design, database)}`,
      changes: [
        { op: "add_component", ref: "new-cache", type: "cache" },
        ...callers.flatMap((caller): Change[] => [
          { op: "disconnect", from: caller, to: database },
          { op: "connect", from: caller, to: "new-cache" },
        ]),
        { op: "connect", from: "new-cache", to: database },
      ],
    };
  }

  // A client or gateway wired straight to a database: an API server in between. The same
  // connection drawn twice: one connection.
  if (id.startsWith("connection-") && finding.nodeIds.length >= 2) {
    const [from, to] = finding.nodeIds as [string, string];
    const fromType = typeOf(design, from);
    const repeated = design.edges.filter((edge) => edge.source === from && edge.target === to).length > 1;
    if (fromType && typeOf(design, to) === "database" && (roleOf(fromType) === "entry" || roleOf(fromType) === "ingress")) {
      return {
        findingId: id,
        label: `Send ${nameOf(design, from)} through an API server`,
        changes: [
          { op: "add_component", ref: "new-server", type: "server" },
          { op: "disconnect", from, to },
          { op: "connect", from, to: "new-server" },
          { op: "connect", from: "new-server", to },
        ],
      };
    }
    if (repeated) {
      return { findingId: id, label: "Remove the repeated connection", changes: [{ op: "disconnect", from, to }, { op: "connect", from, to }] };
    }
    return null;
  }

  // Messages nobody reads: a worker after the queue, saving to the database when there is one.
  if (id.startsWith("queue-no-consumer-") && first) {
    const database = design.nodes.filter((node) => node.data.type === "database").map((node) => node.id).sort()[0];
    return {
      findingId: id,
      label: `Add a worker to process ${nameOf(design, first)}`,
      changes: [
        { op: "add_component", ref: "new-worker", type: "worker" },
        { op: "connect", from: first, to: "new-worker" },
        ...(database ? [{ op: "connect", from: "new-worker", to: database } as Change] : []),
      ],
    };
  }
  return null;
}

export function applyFix<N extends DesignNode, E extends DesignEdge>(design: Design<N, E>, plan: FixPlan): { nodes: N[]; edges: E[] } | null {
  const result = applyChanges(design, plan.changes);
  return result.ok ? { nodes: result.nodes, edges: result.edges } : null;
}

export type CheckedFix = FixPlan & {
  // The design with the fix, ready for the canvas.
  design: { nodes: DesignNode[]; edges: DesignEdge[] };
  before: LiveSummary;
  after: LiveSummary;
};

// The fix for a finding, kept only if the engine says it helps.
export function checkedFix(
  finding: EvaluationFinding,
  evaluation: ArchitectureEvaluation,
  design: Design,
  traffic: unknown,
  cache: ReturnType<typeof createEvaluationCache> = sharedEvaluationCache,
): CheckedFix | null {
  const plan = planFix(finding, evaluation, design);
  if (!plan) return null;
  const fixed = applyFix(design, plan);
  if (!fixed) return null;
  const before = cache.get(design, traffic);
  const after = cache.get(fixed, traffic);
  const solved = !after.evaluation.findings.some((candidate) => candidate.id === finding.id);
  if (!solved && after.summary.score <= before.summary.score) return null;
  return { ...plan, design: fixed, before: before.summary, after: after.summary };
}

// ---- Uptime ----

export type UptimePart = { nodeId: string; name: string; availability: number; instances: number };
export type UptimeBreakdown = {
  // The design's uptime as the engine computes it (every client's paths, reads and writes).
  percent: number;
  // The main request path: the parts every request on it needs, and their availability multiplied.
  path: UptimePart[];
  pathAvailability: number;
  weakest: UptimePart | null;
};

export function uptimeBreakdown(evaluation: ArchitectureEvaluation, design: Design): UptimeBreakdown {
  const path = evaluation.criticalPath
    .map((nodeId) => {
      const node = evaluation.nodes.find((candidate) => candidate.nodeId === nodeId);
      const type = typeOf(design, nodeId);
      // Clients do not fail. Sign-in and search beside a service serve only some of its
      // requests (a share set on the component), so they are not something every request
      // needs; on the path, passing requests on, they are.
      const besideOnly = (type === "auth" || type === "search") && !design.edges.some((edge) => edge.source === nodeId);
      if (!node || !type || roleOf(type) === "entry" || besideOnly) return null;
      return { nodeId, name: nameOf(design, nodeId), availability: node.availability, instances: node.instances };
    })
    .filter((part): part is UptimePart => part !== null);
  // CDNs and DNS are global managed networks (not machines you add instances of), and custom
  // components are not modelled: they count in the chain but are not the link to strengthen.
  const fixable = (part: UptimePart) => {
    const type = typeOf(design, part.nodeId);
    return type !== undefined && type !== "custom" && roleOf(type) !== "edge";
  };
  const weakest = path.filter(fixable).reduce<UptimePart | null>((worst, part) => (!worst || part.availability < worst.availability ? part : worst), null);
  return {
    percent: evaluation.metrics.uptimeAvailability,
    path,
    pathAvailability: path.reduce((product, part) => product * part.availability, 1),
    weakest,
  };
}

// The weakest link of the main path with one more instance, if that raises the uptime.
export function strengthenWeakest(
  evaluation: ArchitectureEvaluation,
  design: Design,
  traffic: unknown,
  cache: ReturnType<typeof createEvaluationCache> = sharedEvaluationCache,
): CheckedFix | null {
  const { weakest } = uptimeBreakdown(evaluation, design);
  if (!weakest) return null;
  const plan = moreInstances(design, evaluation, `uptime-${weakest.nodeId}`, weakest.nodeId, (current) => current + 1);
  if (!plan) return null;
  const fixed = applyFix(design, plan);
  if (!fixed) return null;
  const before = cache.get(design, traffic);
  const after = cache.get(fixed, traffic);
  if (after.summary.uptimePercent <= before.summary.uptimePercent) return null;
  return { ...plan, design: fixed, before: before.summary, after: after.summary };
}

// 0.999 -> "99.9%", 0.99995 -> "99.995%": as many nines as it has, never rounded up to 100%.
export function formatAvailability(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return "0%";
  if (fraction >= 1) return "100%";
  const decimals = Math.min(5, Math.max(1, Math.ceil(-Math.log10(1 - fraction)) - 2 + 1));
  const factor = 10 ** decimals;
  const percent = Math.floor(fraction * 100 * factor + 1e-6) / factor;
  return `${percent.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
}

// How long a year that uptime leaves the design down: "≈ 8.8 hours a year".
export function downtimePerYear(fraction: number): string {
  const hours = Math.max(0, 1 - fraction) * 365.25 * 24;
  if (hours >= 48) return `≈ ${Math.round(hours / 24)} days a year`;
  if (hours >= 1) return `≈ ${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} hours a year`;
  const minutes = hours * 60;
  if (minutes >= 1) return `≈ ${Math.round(minutes)} minutes a year`;
  return "under a minute a year";
}
