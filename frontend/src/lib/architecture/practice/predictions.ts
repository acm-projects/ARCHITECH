import { roleOf } from "../analysis.ts";
import { evaluateArchitecture } from "../evaluation/evaluate.ts";
import { sanitizeTraffic } from "../evaluation/traffic.ts";
import type { GraphInput } from "../graph.ts";

// Predict, then run: the learner says what the design will do before the engine says it, and
// each answer is graded against the engine and explained with its numbers. Pure.
//
// Questions (all optional; at least one):
//   firstToFill   which component fills up first as traffic grows (a component id, or "none"
//                 when the learner thinks nothing limits it)
//   meetsTarget   whether p95 latency stays at or under p95TargetMs
//   handlesLoad   whether the design serves the whole requested load without dropping requests
//   change        for a proposed change (`after`), which way capacity, p95, cost and uptime move

export type Direction = "up" | "down" | "same";
export type Metric = "capacity" | "p95" | "cost" | "uptime";
export const METRICS: readonly Metric[] = ["capacity", "p95", "cost", "uptime"];

export type Prediction = {
  firstToFill?: string;
  meetsTarget?: boolean;
  p95TargetMs?: number;
  handlesLoad?: boolean;
  change?: Partial<Record<Metric, Direction>>;
  confidence?: "low" | "medium" | "high";
  reasoning?: string;
};

export type GradedAnswer = {
  question: "firstToFill" | "meetsTarget" | "handlesLoad" | `change.${Metric}`;
  predicted: string | boolean;
  actual: string | boolean;
  correct: boolean;
  explanation: string;
};

export type GradedPrediction = {
  answers: GradedAnswer[];
  correct: number;
  total: number;
  actual: {
    requestedRps: number;
    effectiveRps: number;
    capacityRps: number | null;
    p95LatencyMs: number;
    monthlyCost: number;
    uptimePercent: number;
    firstToFill: string | null;
    after?: { capacityRps: number | null; p95LatencyMs: number; monthlyCost: number; uptimePercent: number; firstToFill: string | null };
  };
};

export const REASONING_MAX = 500;
const CONFIDENCE = new Set(["low", "medium", "high"]);
const DIRECTIONS = new Set(["up", "down", "same"]);

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Checks a prediction against the design it is about. `hasChange`: whether an `after` design was sent.
export function parsePrediction(raw: unknown, graph: GraphInput, hasChange: boolean): Result<Prediction> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "prediction must be an object." };
  const value = raw as Record<string, unknown>;
  const allowed = ["firstToFill", "meetsTarget", "p95TargetMs", "handlesLoad", "change", "confidence", "reasoning"];
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) return { ok: false, error: `Unknown field "prediction.${unknown}".` };
  const prediction: Prediction = {};
  if (value.firstToFill !== undefined) {
    if (typeof value.firstToFill !== "string" || (value.firstToFill !== "none" && !graph.nodes.some((node) => node.id === value.firstToFill))) {
      return { ok: false, error: 'prediction.firstToFill must be a component of the design, or "none".' };
    }
    prediction.firstToFill = value.firstToFill;
  }
  if (value.meetsTarget !== undefined) {
    if (typeof value.meetsTarget !== "boolean") return { ok: false, error: "prediction.meetsTarget must be true or false." };
    if (typeof value.p95TargetMs !== "number" || !(value.p95TargetMs > 0 && value.p95TargetMs <= 60_000)) {
      return { ok: false, error: "prediction.p95TargetMs (1-60000 ms) is required with meetsTarget." };
    }
    prediction.meetsTarget = value.meetsTarget;
    prediction.p95TargetMs = value.p95TargetMs;
  } else if (value.p95TargetMs !== undefined) {
    return { ok: false, error: "prediction.p95TargetMs only goes with meetsTarget." };
  }
  if (value.handlesLoad !== undefined) {
    if (typeof value.handlesLoad !== "boolean") return { ok: false, error: "prediction.handlesLoad must be true or false." };
    prediction.handlesLoad = value.handlesLoad;
  }
  if (value.change !== undefined) {
    if (!hasChange) return { ok: false, error: "prediction.change needs the changed design as `after`." };
    if (typeof value.change !== "object" || value.change === null || Array.isArray(value.change)) return { ok: false, error: "prediction.change must be an object." };
    const change: Partial<Record<Metric, Direction>> = {};
    for (const [key, direction] of Object.entries(value.change as Record<string, unknown>)) {
      if (!METRICS.includes(key as Metric)) return { ok: false, error: `prediction.change.${key} is not one of ${METRICS.join(", ")}.` };
      if (typeof direction !== "string" || !DIRECTIONS.has(direction)) return { ok: false, error: `prediction.change.${key} must be "up", "down" or "same".` };
      change[key as Metric] = direction as Direction;
    }
    if (Object.keys(change).length === 0) return { ok: false, error: "prediction.change is empty." };
    prediction.change = change;
  }
  if (value.confidence !== undefined) {
    if (typeof value.confidence !== "string" || !CONFIDENCE.has(value.confidence)) return { ok: false, error: 'prediction.confidence must be "low", "medium" or "high".' };
    prediction.confidence = value.confidence as Prediction["confidence"];
  }
  if (value.reasoning !== undefined) {
    if (typeof value.reasoning !== "string" || value.reasoning.length > REASONING_MAX) return { ok: false, error: `prediction.reasoning must be text of at most ${REASONING_MAX} characters.` };
    prediction.reasoning = value.reasoning.trim();
  }
  const questions = ["firstToFill", "meetsTarget", "handlesLoad", "change"].filter((key) => key in prediction);
  if (questions.length === 0) return { ok: false, error: "Predict at least one of firstToFill, meetsTarget, handlesLoad or change." };
  return { ok: true, value: prediction };
}

const rps = (value: number) => `${Math.round(value).toLocaleString("en-US")} req/s`;
const ms = (value: number) => `${Math.round(value).toLocaleString("en-US")} ms`;
const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}/mo`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

function nameIn(graph: GraphInput) {
  return (id: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    return node ? node.data.label?.trim() || node.data.type : id;
  };
}

// Small differences are noise, not a direction (the engine rounds, and costs move by cents).
function direction(before: number | null, after: number | null, tolerance: number): Direction {
  const b = before ?? Infinity;
  const a = after ?? Infinity;
  if (b === a) return "same";
  if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(Math.abs(b), 1e-9)) return "same";
  return a > b ? "up" : "down";
}

export function gradePrediction(graph: GraphInput, trafficInput: unknown, prediction: Prediction, after?: GraphInput): GradedPrediction {
  const traffic = sanitizeTraffic(trafficInput).traffic;
  const evaluation = evaluateArchitecture({ graph, traffic });
  const name = nameIn(graph);
  const node = (id: string) => evaluation.nodes.find((candidate) => candidate.nodeId === id);
  const { metrics } = evaluation;
  const answers: GradedAnswer[] = [];

  if (prediction.firstToFill !== undefined) {
    const actual = evaluation.limitingNodeId;
    const correct = (actual ?? "none") === prediction.firstToFill;
    const limit = actual ? node(actual) : undefined;
    let explanation: string;
    if (!actual || !limit) {
      explanation = "Nothing in this design has a capacity limit the engine models, so nothing fills up.";
    } else {
      explanation = `${name(actual)} fills up first: at ${rps(metrics.requestedRps)} it runs at ${pct(limit.utilization)} of its capacity, so the design tops out around ${metrics.capacityRps === null ? "no limit" : rps(metrics.capacityRps)}.`;
      const picked = prediction.firstToFill !== "none" ? node(prediction.firstToFill) : undefined;
      if (!correct && picked && picked.capacityRps !== null) {
        explanation += ` ${name(picked.nodeId)} is at ${pct(picked.utilization)}, so it still has room when ${name(actual)} is full.`;
      } else if (!correct && picked) {
        explanation += ` ${name(picked.nodeId)} has no capacity limit in the model, so it never fills up.`;
      } else if (!correct) {
        explanation += " Every component with a capacity limit fills up at some load.";
      }
    }
    answers.push({ question: "firstToFill", predicted: prediction.firstToFill, actual: actual ?? "none", correct, explanation });
  }

  if (prediction.meetsTarget !== undefined && prediction.p95TargetMs !== undefined) {
    const meets = metrics.p95LatencyMs <= prediction.p95TargetMs;
    const steps = evaluation.criticalPath
      .map((id) => node(id))
      .filter((part): part is NonNullable<typeof part> => Boolean(part) && roleOf(part!.type) !== "entry")
      .sort((a, b) => b.latencyMs - a.latencyMs);
    const slowest = steps[0];
    let explanation = `p95 is ${ms(metrics.p95LatencyMs)} against a target of ${ms(prediction.p95TargetMs)}.`;
    if (slowest) explanation += ` The slowest part of the main path is ${name(slowest.nodeId)}, adding ${ms(slowest.latencyMs)}${slowest.utilization >= 0.8 ? ` (it is ${pct(slowest.utilization)} busy, and busy parts get slower)` : ""}.`;
    explanation += ` The round trip to the client adds ${ms(traffic.networkLatencyMs)}.`;
    answers.push({ question: "meetsTarget", predicted: prediction.meetsTarget, actual: meets, correct: meets === prediction.meetsTarget, explanation });
  }

  if (prediction.handlesLoad !== undefined) {
    const handles = metrics.effectiveRps >= metrics.requestedRps * 0.999;
    const limit = evaluation.limitingNodeId;
    const explanation = handles
      ? `It serves all ${rps(metrics.requestedRps)}: its capacity is ${metrics.capacityRps === null ? "not limited" : rps(metrics.capacityRps)}.`
      : `It serves ${rps(metrics.effectiveRps)} of the ${rps(metrics.requestedRps)} requested; ${limit ? `${name(limit)} is full` : "a component is full"} and the rest are dropped or delayed.`;
    answers.push({ question: "handlesLoad", predicted: prediction.handlesLoad, actual: handles, correct: handles === prediction.handlesLoad, explanation });
  }

  let afterActual: GradedPrediction["actual"]["after"];
  if (after) {
    const next = evaluateArchitecture({ graph: after, traffic });
    const afterName = nameIn(after);
    afterActual = {
      capacityRps: next.metrics.capacityRps,
      p95LatencyMs: next.metrics.p95LatencyMs,
      monthlyCost: next.metrics.estimatedMonthlyCost,
      uptimePercent: next.metrics.uptimeAvailability,
      firstToFill: next.limitingNodeId,
    };
    if (prediction.change) {
      const moved: Record<Metric, { direction: Direction; text: string }> = {
        capacity: {
          direction: direction(metrics.capacityRps, next.metrics.capacityRps, 0.005),
          text: `Capacity ${metrics.capacityRps === null ? "no limit" : rps(metrics.capacityRps)} → ${next.metrics.capacityRps === null ? "no limit" : rps(next.metrics.capacityRps)}.${
            evaluation.limitingNodeId !== next.limitingNodeId && next.limitingNodeId ? ` ${afterName(next.limitingNodeId)} now fills up first${evaluation.limitingNodeId ? ` instead of ${name(evaluation.limitingNodeId)}` : ""}.` : evaluation.limitingNodeId && evaluation.limitingNodeId === next.limitingNodeId && next.metrics.capacityRps === metrics.capacityRps ? ` ${name(evaluation.limitingNodeId)} still fills up first, so the change does not raise it.` : ""
          }`,
        },
        p95: { direction: direction(metrics.p95LatencyMs, next.metrics.p95LatencyMs, 0.01), text: `p95 ${ms(metrics.p95LatencyMs)} → ${ms(next.metrics.p95LatencyMs)}.` },
        cost: { direction: direction(metrics.estimatedMonthlyCost, next.metrics.estimatedMonthlyCost, 0.005), text: `Cost ${money(metrics.estimatedMonthlyCost)} → ${money(next.metrics.estimatedMonthlyCost)}.` },
        uptime: {
          direction: Math.abs(next.metrics.uptimeAvailability - metrics.uptimeAvailability) < 0.0005 ? "same" : next.metrics.uptimeAvailability > metrics.uptimeAvailability ? "up" : "down",
          text: `Uptime ${metrics.uptimeAvailability}% → ${next.metrics.uptimeAvailability}%.`,
        },
      };
      for (const metric of METRICS) {
        const predicted = prediction.change[metric];
        if (!predicted) continue;
        const { direction: actual, text } = moved[metric];
        answers.push({ question: `change.${metric}`, predicted, actual, correct: actual === predicted, explanation: text });
      }
    }
  }

  return {
    answers,
    correct: answers.filter((answer) => answer.correct).length,
    total: answers.length,
    actual: {
      requestedRps: metrics.requestedRps,
      effectiveRps: metrics.effectiveRps,
      capacityRps: metrics.capacityRps,
      p95LatencyMs: metrics.p95LatencyMs,
      monthlyCost: metrics.estimatedMonthlyCost,
      uptimePercent: metrics.uptimeAvailability,
      firstToFill: evaluation.limitingNodeId,
      ...(afterActual ? { after: afterActual } : {}),
    },
  };
}
