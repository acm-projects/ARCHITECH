import { compareEvaluations, type Direction } from "./comparison.ts";
import type { ArchitectureEvaluation, HealthStatus, Severity } from "./contract.ts";
import { evaluateArchitecture } from "./evaluate.ts";
import { fingerprintEvaluationInput } from "./fingerprint.ts";

// Live metrics: the design is re-evaluated as it is edited, without pressing Run Design.
//
// Keeping it fast:
//   - The engine is a pure function over the graph, run in the browser: no requests.
//   - Results are memoized by the evaluation fingerprint, which ignores names, positions,
//     selection and order. Dragging a component never re-evaluates, and returning to an
//     earlier design (undo, toggling a setting back) reuses its result.
//   - The caller debounces, so a burst of edits is evaluated once (useLiveMetrics).

export type LiveSummary = {
  ready: boolean;
  score: number;
  capacityRps: number | null;
  p95LatencyMs: number;
  monthlyCost: number;
  uptimePercent: number;
  health: HealthStatus;
  // The component that fills up first, and the most serious problem, if any.
  limitingNodeId: string | null;
  topIssue: { title: string; severity: Severity } | null;
};

export type LiveChanges = {
  score: Direction;
  capacityRps: Direction;
  p95LatencyMs: Direction;
  monthlyCost: Direction;
  uptimePercent: Direction;
};

export type LiveResult = { fingerprint: string; evaluation: ArchitectureEvaluation; summary: LiveSummary };

const SEVERITY_RANK: Record<Severity, number> = { high: 2, medium: 1, low: 0 };

export function summarize(evaluation: ArchitectureEvaluation): LiveSummary {
  const top = [...evaluation.findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  return {
    ready: evaluation.ready,
    score: evaluation.overallScore,
    capacityRps: evaluation.metrics.capacityRps,
    p95LatencyMs: evaluation.metrics.p95LatencyMs,
    monthlyCost: evaluation.metrics.estimatedMonthlyCost,
    uptimePercent: evaluation.metrics.uptimeAvailability,
    health: evaluation.health.status,
    limitingNodeId: evaluation.limitingNodeId,
    topIssue: top ? { title: top.title, severity: top.severity } : null,
  };
}

// What moved between two live results (for the ↑/↓ next to each number).
export function liveChanges(before: ArchitectureEvaluation, after: ArchitectureEvaluation): LiveChanges {
  const comparison = compareEvaluations(before, after);
  return {
    score: comparison.overallScore.direction,
    capacityRps: comparison.metrics.capacityRps.direction,
    p95LatencyMs: comparison.metrics.p95LatencyMs.direction,
    monthlyCost: comparison.metrics.estimatedMonthlyCost.direction,
    // Uptime direction from the numbers directly (availability in the comparison includes overload).
    uptimePercent:
      after.metrics.uptimeAvailability > before.metrics.uptimeAvailability
        ? "improved"
        : after.metrics.uptimeAvailability < before.metrics.uptimeAvailability
          ? "regressed"
          : "unchanged",
  };
}

// A small least-recently-used cache of evaluations by fingerprint.
export function createEvaluationCache(maxEntries = 64, evaluate: typeof evaluateArchitecture = evaluateArchitecture) {
  const entries = new Map<string, LiveResult>();
  let evaluations = 0;
  return {
    get(graph: unknown, traffic: unknown): LiveResult {
      const fingerprint = fingerprintEvaluationInput({ graph, traffic });
      const hit = entries.get(fingerprint);
      if (hit) {
        entries.delete(fingerprint);
        entries.set(fingerprint, hit);
        return hit;
      }
      evaluations += 1;
      const evaluation = evaluate({ graph: graph as never, traffic });
      const result = { fingerprint, evaluation, summary: summarize(evaluation) };
      entries.set(fingerprint, result);
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
      return result;
    },
    // How many times the engine actually ran (for tests).
    get evaluations() {
      return evaluations;
    },
    get size() {
      return entries.size;
    },
  };
}

// One cache for the page: the canvas strip and the technology picker share it.
export const sharedEvaluationCache = createEvaluationCache();
