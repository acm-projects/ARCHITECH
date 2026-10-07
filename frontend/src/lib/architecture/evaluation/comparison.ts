import type { ArchitectureEvaluation, CategoryScores, HealthStatus } from "./contract.ts";

// Compares two evaluations of the same design, say the previous run and the latest. It
// says what changed and whether that is better or worse, and nothing about how to show it.

export type Direction = "improved" | "regressed" | "unchanged";

export type MetricDelta = {
  before: number | null;
  after: number | null;
  // after - before, or null when either side is "no limit" (null).
  delta: number | null;
  higherIsBetter: boolean;
  direction: Direction;
};

export type EvaluationComparison = {
  overallScore: MetricDelta;
  scores: Record<keyof CategoryScores, MetricDelta>;
  metrics: {
    capacityRps: MetricDelta;
    effectiveRps: MetricDelta;
    p95LatencyMs: MetricDelta;
    estimatedMonthlyCost: MetricDelta;
    availability: MetricDelta;
  };
  health: { before: HealthStatus; after: HealthStatus; direction: Direction };
  // Finding ids that are gone since the earlier run, and ids that are new.
  findings: { resolved: string[]; introduced: string[] };
};

// `null` stands for "unlimited" (a design nothing limits), which is better than any number.
function delta(before: number | null, after: number | null, higherIsBetter: boolean): MetricDelta {
  const b = before ?? Infinity;
  const a = after ?? Infinity;
  const direction: Direction =
    a === b ? "unchanged" : (higherIsBetter ? a > b : a < b) ? "improved" : "regressed";
  return {
    before,
    after,
    delta: before === null || after === null ? null : after - before,
    higherIsBetter,
    direction,
  };
}

const HEALTH_RANK: Record<HealthStatus, number> = {
  incomplete: 0,
  critical: 1,
  warning: 2,
  healthy: 3,
};

export function compareEvaluations(
  before: ArchitectureEvaluation,
  after: ArchitectureEvaluation,
): EvaluationComparison {
  const scoreKeys = Object.keys(before.scores) as (keyof CategoryScores)[];
  const beforeIds = new Set(before.findings.map((finding) => finding.id));
  const afterIds = new Set(after.findings.map((finding) => finding.id));

  const healthDirection: Direction =
    HEALTH_RANK[after.health.status] > HEALTH_RANK[before.health.status]
      ? "improved"
      : HEALTH_RANK[after.health.status] < HEALTH_RANK[before.health.status]
        ? "regressed"
        : "unchanged";

  return {
    overallScore: delta(before.overallScore, after.overallScore, true),
    scores: Object.fromEntries(
      scoreKeys.map((key) => [key, delta(before.scores[key], after.scores[key], true)]),
    ) as Record<keyof CategoryScores, MetricDelta>,
    metrics: {
      capacityRps: delta(before.metrics.capacityRps, after.metrics.capacityRps, true),
      effectiveRps: delta(before.metrics.effectiveRps, after.metrics.effectiveRps, true),
      p95LatencyMs: delta(before.metrics.p95LatencyMs, after.metrics.p95LatencyMs, false),
      estimatedMonthlyCost: delta(
        before.metrics.estimatedMonthlyCost,
        after.metrics.estimatedMonthlyCost,
        false,
      ),
      availability: delta(before.metrics.availability, after.metrics.availability, true),
    },
    health: {
      before: before.health.status,
      after: after.health.status,
      direction: healthDirection,
    },
    findings: {
      resolved: before.findings.filter((f) => !afterIds.has(f.id)).map((f) => f.id),
      introduced: after.findings.filter((f) => !beforeIds.has(f.id)).map((f) => f.id),
    },
  };
}
