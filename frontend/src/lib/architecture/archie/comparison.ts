import { compareEvaluations, type MetricDelta } from "../evaluation/comparison.ts";
import type { ArchitectureEvaluation, CategoryScores } from "../evaluation/contract.ts";
import type { ChangeLine, ComparisonExplanation, ExplanationSource } from "./contract.ts";
import { explainFindings } from "./explain.ts";

// Says in words what changed between two runs of the same design, from the numbers the
// evaluation comparison already worked out. It adds no measurement of its own.

const n0 = (value: number) => Math.round(value).toLocaleString("en-US");

type MetricKey = ChangeLine["metric"];

const LABELS: Record<MetricKey, string> = {
  overallScore: "overall score",
  scalability: "scalability",
  reliability: "reliability",
  performance: "performance",
  costEfficiency: "cost efficiency",
  capacityRps: "capacity",
  p95LatencyMs: "p95 latency",
  estimatedMonthlyCost: "monthly cost",
  availability: "availability",
};

// How a metric's value reads, and the verb for it getting better or worse.
const FORMAT: Record<MetricKey, (value: number | null) => string> = {
  overallScore: (v) => String(v),
  scalability: (v) => String(v),
  reliability: (v) => String(v),
  performance: (v) => String(v),
  costEfficiency: (v) => String(v),
  capacityRps: (v) => (v === null ? "not limited" : `${n0(v)} requests per second`),
  p95LatencyMs: (v) => `${n0(v ?? 0)} ms`,
  estimatedMonthlyCost: (v) => `$${n0(v ?? 0)}`,
  availability: (v) => `${v}%`,
};

const VERBS: Record<MetricKey, { improved: string; regressed: string }> = {
  overallScore: { improved: "raised the overall score", regressed: "the overall score dropped" },
  scalability: { improved: "improved scalability", regressed: "scalability dropped" },
  reliability: { improved: "improved reliability", regressed: "reliability dropped" },
  performance: { improved: "improved performance", regressed: "performance dropped" },
  costEfficiency: { improved: "improved cost efficiency", regressed: "cost efficiency dropped" },
  capacityRps: { improved: "raised capacity", regressed: "capacity dropped" },
  p95LatencyMs: { improved: "reduced p95 latency", regressed: "p95 latency rose" },
  estimatedMonthlyCost: { improved: "reduced monthly cost", regressed: "monthly cost rose" },
  availability: { improved: "raised availability", regressed: "availability dropped" },
};

// Order of importance when only a couple of changes fit in a sentence.
const ORDER: MetricKey[] = [
  "scalability",
  "reliability",
  "performance",
  "costEfficiency",
  "capacityRps",
  "p95LatencyMs",
  "availability",
  "estimatedMonthlyCost",
];

function line(metric: MetricKey, delta: MetricDelta): ChangeLine | null {
  if (delta.direction === "unchanged") return null;
  const label = LABELS[metric];
  return {
    metric,
    label,
    direction: delta.direction,
    before: delta.before,
    after: delta.after,
    text: `${label[0].toUpperCase()}${label.slice(1)}: ${FORMAT[metric](delta.before)} → ${FORMAT[metric](delta.after)}`,
  };
}

const clause = (change: ChangeLine) =>
  `${VERBS[change.metric][change.direction]} from ${FORMAT[change.metric](change.before)} to ${FORMAT[change.metric](change.after)}`;

const join = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export function explainComparison(
  previous: ArchitectureEvaluation,
  current: ArchitectureEvaluation,
  labels?: ExplanationSource["labels"],
): ComparisonExplanation {
  const comparison = compareEvaluations(previous, current);

  const changes: ChangeLine[] = [];
  const add = (metric: MetricKey, delta: MetricDelta) => {
    const change = line(metric, delta);
    if (change) changes.push(change);
  };
  add("overallScore", comparison.overallScore);
  for (const key of Object.keys(comparison.scores) as (keyof CategoryScores)[]) add(key, comparison.scores[key]);
  add("capacityRps", comparison.metrics.capacityRps);
  add("p95LatencyMs", comparison.metrics.p95LatencyMs);
  add("estimatedMonthlyCost", comparison.metrics.estimatedMonthlyCost);
  add("availability", comparison.metrics.availability);

  const improved = changes.filter((c) => c.direction === "improved");
  const regressed = changes.filter((c) => c.direction === "regressed");

  // The sentence names the two most important of each; the full lists stay available.
  const headlinePick = (list: ChangeLine[]) =>
    ORDER.map((metric) => list.find((c) => c.metric === metric))
      .filter((c): c is ChangeLine => c !== undefined)
      .slice(0, 2);
  const better = headlinePick(improved).map(clause);
  const worse = headlinePick(regressed).map(clause);

  const overall = comparison.overallScore;
  const overallText =
    overall.direction === "unchanged"
      ? ""
      : ` The overall score went from ${overall.before} to ${overall.after}.`;

  let headline: string;
  if (changes.length === 0) headline = "Your changes did not change the results.";
  else if (better.length > 0 && worse.length > 0) headline = `Your changes ${join(better)}, but ${join(worse)}.${overallText}`;
  else if (better.length > 0) headline = `Your changes ${join(better)}.${overallText}`;
  else if (worse.length > 0) headline = `Your changes made some results worse: ${join(worse)}.${overallText}`;
  else headline = `Your changes ${overall.direction === "improved" ? "improved" : "lowered"} the overall score from ${overall.before} to ${overall.after}.`;

  // Titles in the current names, so a finding about a renamed component reads naturally.
  const titles = (evaluation: ArchitectureEvaluation, ids: string[]) => {
    const explanations = explainFindings({ evaluation, labels });
    return ids.map((findingId) => ({
      findingId,
      title: explanations.find((e) => e.findingId === findingId)?.title ?? findingId,
    }));
  };

  const costWorse = regressed.some((c) => c.metric === "estimatedMonthlyCost");
  const capabilityBetter = improved.some((c) =>
    ["capacityRps", "scalability", "reliability", "availability"].includes(c.metric),
  );
  const health = comparison.health;

  return {
    headline,
    improved,
    regressed,
    resolved: titles(previous, comparison.findings.resolved),
    introduced: titles(current, comparison.findings.introduced),
    healthChange:
      health.direction === "unchanged"
        ? null
        : `Health went from ${health.before} to ${health.after}.`,
    tradeoffNote:
      costWorse && capabilityBetter
        ? "More capacity or resilience usually costs more, so this is a trade-off to weigh."
        : null,
  };
}
