import { ASSUMPTIONS } from "./capabilities.ts";
import type {
  CategoryScores,
  EvaluationFinding,
  HealthSignal,
  HealthStatus,
} from "./contract.ts";
import type { Simulation } from "./simulation.ts";

// How a simulation becomes scores and a health status. Every number here is explainable
// from the formulas below, and no score can rise just because components were added:
// capacity and availability only improve when the design really gains them, and every
// component costs money.

// Weight of each category in the overall score. They add up to 1.
export const SCORE_WEIGHTS: CategoryScores = {
  scalability: 0.3,
  reliability: 0.3,
  performance: 0.25,
  costEfficiency: 0.15,
};

// Points taken off the overall score for architecture findings (missing client, no
// backend, unreachable stores, ...), so a design that is structurally wrong cannot score
// well on the strength of its other numbers. Capped.
export const ARCHITECTURE_PENALTY = { high: 8, medium: 4, low: 1, max: 15 } as const;

// What a design "should" cost: a fixed floor plus a cost per thousand requests per second.
export const COST_REFERENCE = { baseMonthly: 80, perThousandRps: 40 } as const;

// Latency at or below this scores 100, and every doubling above it costs the same, down
// to 0 at LATENCY_ZERO_MS.
const LATENCY_FULL_SCORE_MS = 100;
const LATENCY_ZERO_MS = 2_000;

// Availability counts "nines" (99% = 2, 99.9% = 3), 25 points each up to four nines.
const NINES_FOR_FULL_SCORE = 4;

const clamp = (value: number, min = 0, max = 100) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export const ZERO_SCORES: CategoryScores = {
  scalability: 0,
  reliability: 0,
  performance: 0,
  costEfficiency: 0,
};

// Headroom: capacity divided by requested load. Twice the load or more is full marks,
// exactly the load is 70, and below that it falls in proportion to what can be served.
// An unprocessed backlog behind a queue costs 15 points (5 if it is only close).
export function scalabilityScore(sim: Simulation, findings: readonly EvaluationFinding[]): number {
  const ratio =
    sim.requestedRps <= 0 || sim.capacityRps === null ? Infinity : sim.capacityRps / sim.requestedRps;
  const headroom = ratio >= 2 ? 100 : ratio >= 1 ? 70 + 30 * (ratio - 1) : 70 * ratio;
  const backlog = findings.find((finding) => finding.id.startsWith("backlog-"));
  const penalty = !backlog ? 0 : backlog.severity === "high" ? 15 : 5;
  return clamp(headroom - penalty);
}

// 25 points per nine of availability, from the design's uptime (not counting dropped
// requests, which scalability already covers).
export function reliabilityScore(sim: Simulation): number {
  const downtime = 1 - sim.uptimeAvailability;
  const nines = downtime <= 0 ? NINES_FOR_FULL_SCORE : Math.min(NINES_FOR_FULL_SCORE, -Math.log10(downtime));
  return clamp((nines / NINES_FOR_FULL_SCORE) * 100);
}

export function performanceScore(sim: Simulation): number {
  if (sim.p95LatencyMs <= LATENCY_FULL_SCORE_MS) return 100;
  const span = Math.log2(LATENCY_ZERO_MS / LATENCY_FULL_SCORE_MS);
  return clamp(100 * (1 - Math.log2(sim.p95LatencyMs / LATENCY_FULL_SCORE_MS) / span));
}

// Cost against the reference for this load: at or under it is 100, three times it is 0.
// Paying for something that cannot serve the load counts against it in proportion.
export function costEfficiencyScore(sim: Simulation): number {
  const reference =
    COST_REFERENCE.baseMonthly + (sim.requestedRps / 1_000) * COST_REFERENCE.perThousandRps;
  const ratio = sim.monthlyCost / reference;
  const base = ratio <= 1 ? 100 : (100 * (3 - ratio)) / 2;
  const served = sim.requestedRps > 0 ? sim.effectiveRps / sim.requestedRps : 1;
  return clamp(base * clamp(served, 0, 1));
}

export function architecturePenalty(findings: readonly EvaluationFinding[]): number {
  const points = findings
    .filter((finding) => finding.category === "architecture")
    .reduce((sum, finding) => sum + ARCHITECTURE_PENALTY[finding.severity], 0);
  return Math.min(ARCHITECTURE_PENALTY.max, points);
}

export function overallScore(scores: CategoryScores, penalty: number): number {
  const weighted =
    scores.scalability * SCORE_WEIGHTS.scalability +
    scores.reliability * SCORE_WEIGHTS.reliability +
    scores.performance * SCORE_WEIGHTS.performance +
    scores.costEfficiency * SCORE_WEIGHTS.costEfficiency;
  return Math.round(clamp(weighted - penalty));
}

// ---- Health ----
// From what can be measured, not from the score: how full the busiest component is, how
// available the design is, how slow it is, and whether any serious finding is open.
//   critical: a component is 20% or more over capacity, uptime is below 99%, or p95 is 1 s or more.
//   warning:  a component is within 20% of capacity or over it, uptime is below 99.9%,
//             p95 is 400 ms or more, or a high-severity finding is open.
const CRITICAL_UTILIZATION = 1.2;
const CRITICAL_AVAILABILITY = 0.99;
const WARNING_AVAILABILITY = 0.999;
const CRITICAL_LATENCY_MS = 1_000;
const WARNING_LATENCY_MS = 400;

export function assessHealth(
  sim: Simulation,
  findings: readonly EvaluationFinding[],
): { status: HealthStatus; reasons: string[]; signals: HealthSignal[] } {
  if (!sim.ready) {
    const message = "No request reaches a component yet.";
    return {
      status: "incomplete",
      reasons: [message],
      signals: [{ severity: "warning", kind: "incomplete", message }],
    };
  }

  const critical: HealthSignal[] = [];
  const warning: HealthSignal[] = [];

  const busiest = sim.nodes
    .filter((node) => node.sync && node.config.capacityPerInstance !== null)
    .reduce<(typeof sim.nodes)[number] | null>(
      (top, node) => (!top || node.utilization > top.utilization ? node : top),
      null,
    );
  if (busiest) {
    const use = `${Math.round(busiest.utilization * 100)}% of capacity`;
    const signal = (severity: HealthSignal["severity"]): HealthSignal => ({
      severity,
      kind: "capacity",
      message: `${busiest.id} is at ${use}.`,
      nodeId: busiest.id,
      value: busiest.utilization,
    });
    if (busiest.utilization >= CRITICAL_UTILIZATION) critical.push(signal("critical"));
    else if (busiest.utilization >= ASSUMPTIONS.nearCapacityUtilization) warning.push(signal("warning"));
  }

  const uptime = `${(sim.uptimeAvailability * 100).toFixed(2)}%`;
  const availabilitySignal = (severity: HealthSignal["severity"]): HealthSignal => ({
    severity,
    kind: "availability",
    message: `Availability is ${uptime}.`,
    value: sim.uptimeAvailability,
  });
  if (sim.uptimeAvailability < CRITICAL_AVAILABILITY) critical.push(availabilitySignal("critical"));
  else if (sim.uptimeAvailability < WARNING_AVAILABILITY) warning.push(availabilitySignal("warning"));

  const latencySignal = (severity: HealthSignal["severity"]): HealthSignal => ({
    severity,
    kind: "latency",
    message: `p95 latency is ${Math.round(sim.p95LatencyMs)} ms.`,
    value: sim.p95LatencyMs,
  });
  if (sim.p95LatencyMs >= CRITICAL_LATENCY_MS) critical.push(latencySignal("critical"));
  else if (sim.p95LatencyMs >= WARNING_LATENCY_MS) warning.push(latencySignal("warning"));

  for (const finding of findings) {
    if (finding.severity === "high") {
      warning.push({ severity: "warning", kind: "finding", message: finding.title, findingId: finding.id });
    }
  }

  const signals = [...critical, ...warning];
  const reasons = signals.map((signal) => signal.message);
  if (critical.length > 0) return { status: "critical", reasons, signals };
  if (warning.length > 0) return { status: "warning", reasons, signals };
  return { status: "healthy", reasons: [], signals: [] };
}
