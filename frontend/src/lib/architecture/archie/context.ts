import type { HealthStatus } from "../evaluation/contract.ts";
import type { CategoryScores } from "../evaluation/contract.ts";
import type { TrafficProfile } from "../evaluation/traffic.ts";
import type { ArchitectureNodeType } from "../types.ts";
import { COMPONENT_ROLES, createComponentResolver } from "./components.ts";
import type { Explanation, NextStep } from "./contract.ts";
import { explainNode } from "./node.ts";
import type { ArchieView } from "./view.ts";

// What a conversational model would be given to talk about a design, and nothing more. It is
// a small plain-JSON digest of a finished evaluation and Archie's explanations: no React
// state, no positions or styling, no raw graph. The deterministic evaluation stays the source
// of truth for every number; a model may explain and answer questions, never rescore.
//
// BACKEND: this is the payload an optional Archie endpoint would receive alongside, or
// derived from, the evaluation.

export const ARCHIE_CONTEXT_VERSION = 1;

export const MAX_CONTEXT_EXPLANATIONS = 5;

export type ArchieContext = {
  version: typeof ARCHIE_CONTEXT_VERSION;
  evaluationModelVersion: number;
  // Whether the explanation describes the design as it is now, or an earlier run of it.
  basedOn: "current-design" | "previous-run";
  traffic: TrafficProfile;
  results: {
    ready: boolean;
    health: { status: HealthStatus; reasons: string[] };
    overallScore: number;
    scores: CategoryScores;
    metrics: {
      requestedRps: number;
      effectiveRps: number;
      capacityRps: number | null;
      p95LatencyMs: number;
      estimatedMonthlyCost: number;
      availability: number;
      uptimeAvailability: number;
    };
    bottleneckNodeIds: string[];
  };
  // Components mentioned below, by id.
  components: { id: string; type: ArchitectureNodeType | null; label: string; present: boolean }[];
  // The component the user is asking about, if any.
  selected?: {
    id: string;
    type: ArchitectureNodeType;
    label: string;
    role: string;
    stats: { reachable: boolean; instances: number; utilization: number; demandRps: number; capacityRps: number | null };
  };
  explanations: Pick<
    Explanation,
    "id" | "findingId" | "kind" | "category" | "severity" | "title" | "what" | "why" | "impact" | "suggestion" | "tradeoff" | "nodeIds"
  >[];
  nextSteps: Pick<NextStep, "id" | "text" | "tradeoff" | "reason" | "severity" | "nodeIds" | "addresses">[];
  comparison?: { headline: string; improved: string[]; regressed: string[]; tradeoffNote: string | null };
  // Standing rules for whoever reads this.
  rules: string[];
};

const RULES = [
  "Every number comes from Architech's deterministic evaluation. Do not change, recompute or invent scores, capacity, latency, cost or availability.",
  "Explain and answer questions about this design only; say when something is outside what the evaluation covers.",
];

// Builds the context for the current Archie view, optionally focused on one component. Returns
// null when there is no run to talk about.
export function buildArchieContext(view: ArchieView, options: { nodeId?: string } = {}): ArchieContext | null {
  const { source, explanation } = view;
  if (!source || !explanation) return null;
  const { evaluation } = source;
  const resolver = createComponentResolver(source);

  const focused = options.nodeId
    ? explanation.explanations.filter((e) => e.nodeIds.includes(options.nodeId as string))
    : [];
  const rest = explanation.explanations.filter((e) => !focused.includes(e));
  const chosen = [...focused, ...rest].slice(0, Math.max(MAX_CONTEXT_EXPLANATIONS, focused.length));

  const ids = new Set<string>();
  for (const e of chosen) e.nodeIds.forEach((id) => ids.add(id));
  for (const step of explanation.nextSteps) step.nodeIds.forEach((id) => ids.add(id));
  if (options.nodeId) ids.add(options.nodeId);

  let selected: ArchieContext["selected"];
  if (options.nodeId) {
    const answer = explainNode(source, options.nodeId, explanation.explanations);
    if (answer.status === "findings" || answer.status === "no-findings") {
      const type = answer.component.type;
      if (type) {
        selected = {
          id: options.nodeId,
          type,
          label: answer.component.label,
          role: COMPONENT_ROLES[type],
          stats: answer.stats,
        };
      }
    }
  }

  return {
    version: ARCHIE_CONTEXT_VERSION,
    evaluationModelVersion: evaluation.modelVersion,
    basedOn: view.isStale ? "previous-run" : "current-design",
    traffic: evaluation.traffic,
    results: {
      ready: evaluation.ready,
      health: { status: evaluation.health.status, reasons: evaluation.health.reasons },
      overallScore: evaluation.overallScore,
      scores: evaluation.scores,
      metrics: evaluation.metrics,
      bottleneckNodeIds: evaluation.bottleneckNodeIds,
    },
    components: [...ids].sort().map(resolver.ref),
    ...(selected ? { selected } : {}),
    explanations: chosen.map((e) => ({
      id: e.id,
      findingId: e.findingId,
      kind: e.kind,
      category: e.category,
      severity: e.severity,
      title: e.title,
      what: e.what,
      why: e.why,
      impact: e.impact,
      suggestion: e.suggestion,
      tradeoff: e.tradeoff,
      nodeIds: e.nodeIds,
    })),
    nextSteps: explanation.nextSteps.map((s) => ({
      id: s.id,
      text: s.text,
      tradeoff: s.tradeoff,
      reason: s.reason,
      severity: s.severity,
      nodeIds: s.nodeIds,
      addresses: s.addresses,
    })),
    ...(view.comparison
      ? {
          comparison: {
            headline: view.comparison.headline,
            improved: view.comparison.improved.map((c) => c.text),
            regressed: view.comparison.regressed.map((c) => c.text),
            tradeoffNote: view.comparison.tradeoffNote,
          },
        }
      : {}),
    rules: [...RULES],
  };
}
