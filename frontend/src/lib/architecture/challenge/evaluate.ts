import { buildNextSteps, explainFindings } from "../archie/explain.ts";
import { createComponentResolver, noun } from "../archie/components.ts";
import type { ExplanationSource } from "../archie/contract.ts";
import { roleOf } from "../analysis.ts";
import type { ArchitectureEvaluation } from "../evaluation/contract.ts";
import { evaluateArchitecture } from "../evaluation/evaluate.ts";
import type { GraphInput } from "../graph.ts";
import { SIMULATION_PROFILES } from "../evaluation/capabilities.ts";
import {
  type ChallengeDefinition,
  type ChallengeEvaluation,
  type ChallengeFeedback,
  type ChallengeRequirement,
  type ChallengeRequirementResult,
  type ChallengeScore,
} from "./contract.ts";

// Judges a design against a challenge: the shared architecture evaluation of the design at the
// challenge's traffic, plus a check of each of the challenge's requirements against it. The
// numbers all come from that evaluation; this module only compares them with what the challenge
// asks and combines the outcome into a score. Pure and deterministic.

const n0 = (value: number) => Math.round(value).toLocaleString("en-US");
const clamp = (value: number) => Math.max(0, Math.min(100, value));

const DEFAULT_WEIGHT = 1;

// ---- Definitions ----

// Problems with a challenge definition, as readable messages. An empty list means it is usable.
export function validateChallengeDefinition(challenge: ChallengeDefinition): string[] {
  const problems: string[] = [];
  const all = [...challenge.requirements, ...challenge.constraints];

  if (!challenge.id.trim()) problems.push("The challenge needs an id.");
  if (!challenge.title.trim()) problems.push("The challenge needs a title.");
  if (all.length === 0) problems.push("The challenge needs at least one requirement or constraint.");

  const ids = new Set<string>();
  for (const requirement of all) {
    if (!requirement.id.trim()) problems.push("A requirement has no id.");
    if (ids.has(requirement.id)) problems.push(`Requirement id "${requirement.id}" is used twice.`);
    ids.add(requirement.id);
    if (!requirement.label.trim()) problems.push(`Requirement "${requirement.id}" has no label.`);
    const weight = requirement.weight ?? DEFAULT_WEIGHT;
    if (!Number.isFinite(weight) || weight <= 0) problems.push(`Requirement "${requirement.id}" needs a positive weight.`);

    const positive = (value: number, what: string) => {
      if (!Number.isFinite(value) || value <= 0) problems.push(`Requirement "${requirement.id}" needs a positive ${what}.`);
    };
    switch (requirement.kind) {
      case "min-capacity":
        positive(requirement.minRps, "capacity target");
        break;
      case "max-latency":
        positive(requirement.maxP95Ms, "latency limit");
        break;
      case "min-availability":
        if (!(requirement.minPercent > 0 && requirement.minPercent <= 100)) {
          problems.push(`Requirement "${requirement.id}" needs an availability between 0 and 100.`);
        }
        break;
      case "max-cost":
        positive(requirement.maxMonthlyCost, "budget");
        break;
      case "max-components":
        if (!Number.isInteger(requirement.max) || requirement.max < 1) {
          problems.push(`Requirement "${requirement.id}" needs a whole number of components, at least 1.`);
        }
        break;
      case "requires-component":
      case "forbids-component":
        if (!Object.hasOwn(SIMULATION_PROFILES, requirement.componentType)) {
          problems.push(`Requirement "${requirement.id}" names an unknown component type.`);
        }
        break;
      default:
        problems.push(`Requirement "${(requirement as { id: string }).id}" has an unknown kind.`);
    }
  }

  const { requirementWeight, architectureWeight, mandatoryCap, passScore } = challenge.scoring;
  if (Math.abs(requirementWeight + architectureWeight - 1) > 1e-9 || requirementWeight < 0 || architectureWeight < 0) {
    problems.push("The scoring weights must be positive and add up to 1.");
  }
  if (!(mandatoryCap >= 0 && mandatoryCap <= 100)) problems.push("The mandatory cap must be between 0 and 100.");
  if (!(passScore >= 0 && passScore <= 100)) problems.push("The pass score must be between 0 and 100.");
  if (mandatoryCap >= passScore) problems.push("The mandatory cap must be below the pass score.");
  return problems;
}

// ---- Requirement checks ----

type Resolver = ReturnType<typeof createComponentResolver>;

function check(
  requirement: ChallengeRequirement,
  group: ChallengeRequirementResult["group"],
  evaluation: ArchitectureEvaluation,
  resolver: Resolver,
): ChallengeRequirementResult {
  const { metrics } = evaluation;
  const base = {
    requirementId: requirement.id,
    kind: requirement.kind,
    label: requirement.label,
    group,
    mandatory: requirement.mandatory ?? false,
    weight: requirement.weight ?? DEFAULT_WEIGHT,
  };
  const outcome = (
    passed: boolean,
    explanation: string,
    extra: Partial<Pick<ChallengeRequirementResult, "measuredValue" | "target" | "unit" | "nodeIds">> = {},
  ): ChallengeRequirementResult => ({
    ...base,
    passed,
    measuredValue: null,
    target: null,
    unit: null,
    nodeIds: [],
    explanation,
    ...extra,
  });

  // A design nothing can reach has no measurable behaviour, so nothing about it can pass.
  const nothingRuns = "Nothing serves requests yet, so this cannot be met.";
  const measurable = evaluation.ready;

  switch (requirement.kind) {
    case "min-capacity": {
      const target = requirement.minRps;
      if (!measurable) return outcome(false, nothingRuns, { measuredValue: 0, target, unit: "requests per second" });
      const capacity = metrics.capacityRps;
      const limiting = evaluation.limitingNodeId;
      const nodeIds = limiting ? [limiting] : [];
      if (capacity === null) {
        return outcome(true, "Nothing in your design limits how much traffic it can take.", { target, unit: "requests per second" });
      }
      return capacity >= target
        ? outcome(true, `Your design can take about ${n0(capacity)} requests per second, above the ${n0(target)} required.`, {
            measuredValue: capacity, target, unit: "requests per second", nodeIds,
          })
        : outcome(
            false,
            `Your design can only take about ${n0(capacity)} requests per second, below the ${n0(target)} required${limiting ? `; ${resolver.describe(limiting)} runs out first` : ""}.`,
            { measuredValue: capacity, target, unit: "requests per second", nodeIds },
          );
    }

    case "max-latency": {
      const target = requirement.maxP95Ms;
      if (!measurable) return outcome(false, nothingRuns, { target, unit: "ms" });
      const value = metrics.p95LatencyMs;
      return value <= target
        ? outcome(true, `95 out of 100 requests finish within about ${n0(value)} ms, within the ${n0(target)} ms limit.`, { measuredValue: value, target, unit: "ms" })
        : outcome(false, `95 out of 100 requests take up to about ${n0(value)} ms, over the ${n0(target)} ms limit.`, {
            measuredValue: value, target, unit: "ms", nodeIds: evaluation.criticalPath.filter((id) => roleOf(resolver.type(id) ?? "client") !== "entry"),
          });
    }

    case "min-availability": {
      const target = requirement.minPercent;
      if (!measurable) return outcome(false, nothingRuns, { target, unit: "%" });
      const value = metrics.uptimeAvailability;
      return value >= target
        ? outcome(true, `Your design is up about ${value}% of the time, meeting the ${target}% required.`, { measuredValue: value, target, unit: "%" })
        : outcome(false, `Your design is only up about ${value}% of the time, below the ${target}% required.`, { measuredValue: value, target, unit: "%" });
    }

    case "max-cost": {
      const target = requirement.maxMonthlyCost;
      if (!measurable) return outcome(false, nothingRuns, { target, unit: "$/month" });
      const value = metrics.estimatedMonthlyCost;
      return value <= target
        ? outcome(true, `Your design is estimated at $${n0(value)} a month, within the $${n0(target)} budget.`, { measuredValue: value, target, unit: "$/month" })
        : outcome(false, `Your design is estimated at $${n0(value)} a month, over the $${n0(target)} budget.`, { measuredValue: value, target, unit: "$/month" });
    }

    case "requires-component": {
      const min = requirement.minCount ?? 1;
      const type = requirement.componentType;
      const present = evaluation.nodes.filter((node) => node.type === type);
      const used = present.filter((node) => node.reachable);
      const word = noun(type);
      if (used.length >= min) {
        return outcome(true, `Your design uses ${used.length === 1 ? `a ${word}` : `${used.length} ${word}s`}.`, {
          measuredValue: used.length, target: min, nodeIds: used.map((node) => node.nodeId),
        });
      }
      return outcome(
        false,
        present.length > 0
          ? `You have a ${word}, but no request reaches it, so it does not count.`
          : `Your design needs ${min === 1 ? `a ${word}` : `${min} ${word}s`}.`,
        { measuredValue: used.length, target: min, nodeIds: present.map((node) => node.nodeId) },
      );
    }

    case "forbids-component": {
      // Doing nothing is not a way to obey a limit.
      if (!measurable) return outcome(false, nothingRuns, { measuredValue: 0, target: 0 });
      const present = evaluation.nodes.filter((node) => node.type === requirement.componentType);
      const word = noun(requirement.componentType);
      return present.length === 0
        ? outcome(true, `Your design has no ${word}, as required.`, { measuredValue: 0, target: 0 })
        : outcome(false, `This challenge does not allow a ${word}, and your design has ${present.length}.`, {
            measuredValue: present.length, target: 0, nodeIds: present.map((node) => node.nodeId),
          });
    }

    case "max-components": {
      if (!measurable) return outcome(false, nothingRuns, { measuredValue: 0, target: requirement.max, unit: "components" });
      const count = evaluation.nodes.filter((node) => roleOf(node.type) !== "entry").length;
      return count <= requirement.max
        ? outcome(true, `Your design has ${count} components, within the limit of ${requirement.max}.`, { measuredValue: count, target: requirement.max, unit: "components" })
        : outcome(false, `Your design has ${count} components, over the limit of ${requirement.max}.`, { measuredValue: count, target: requirement.max, unit: "components" });
    }
  }
}

// ---- Score ----

function scoreOf(
  challenge: ChallengeDefinition,
  results: ChallengeRequirementResult[],
  evaluation: ArchitectureEvaluation,
): ChallengeScore {
  const { requirementWeight, architectureWeight, mandatoryCap, passScore } = challenge.scoring;
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const metWeight = results.filter((r) => r.passed).reduce((sum, r) => sum + r.weight, 0);
  const requirementScore = totalWeight > 0 ? (metWeight / totalWeight) * 100 : 0;
  const architectureScore = evaluation.overallScore;

  const blended = requirementWeight * requirementScore + architectureWeight * architectureScore;
  const mandatoryFailed = results.filter((r) => r.mandatory && !r.passed).map((r) => r.requirementId);
  const capApplied = mandatoryFailed.length > 0 && blended > mandatoryCap;
  const score = Math.round(clamp(mandatoryFailed.length > 0 ? Math.min(blended, mandatoryCap) : blended));

  return {
    score,
    passed: mandatoryFailed.length === 0 && score >= passScore,
    requirementScore: Math.round(requirementScore),
    architectureScore,
    weights: { requirement: requirementWeight, architecture: architectureWeight },
    mandatoryFailed,
    capApplied,
  };
}

// ---- Feedback ----

const SCORE_LABELS = {
  scalability: "Scalability",
  reliability: "Reliability",
  performance: "Performance",
  costEfficiency: "Cost efficiency",
} as const;

const STRONG_SCORE = 80;
const MAX_WEAKNESSES = 2;

function feedbackOf(
  results: ChallengeRequirementResult[],
  score: ChallengeScore,
  source: ExplanationSource,
): ChallengeFeedback {
  const { evaluation } = source;
  const failed = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed);

  // The architecture's own diagnosis, explained for a beginner, not repeated here by hand.
  const explanations = explainFindings(source);
  const important = explanations.filter((e) => e.severity !== "low");

  const strengths: string[] = [];
  if (passed.length > 0) strengths.push(`Meets ${passed.length} of ${results.length} requirements.`);
  for (const key of Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]) {
    if (evaluation.ready && evaluation.scores[key] >= STRONG_SCORE) {
      strengths.push(`${SCORE_LABELS[key]} is strong (${evaluation.scores[key]}).`);
    }
  }
  if (evaluation.health.status === "healthy") strengths.push("Architech rates the design healthy at this traffic.");

  const mandatoryLabels = results.filter((r) => r.mandatory && !r.passed).map((r) => r.label);
  const summary = score.passed
    ? "Your design solves the challenge."
    : mandatoryLabels.length > 0
      ? `Your design does not meet ${mandatoryLabels.length === 1 ? "a required condition" : `${mandatoryLabels.length} required conditions`} yet: ${mandatoryLabels.join("; ")}.`
      : failed.length > 0
        ? `Your design is close: ${failed.length} ${failed.length === 1 ? "condition is" : "conditions are"} still not met.`
        : "Your design meets every condition, but the architecture can still be stronger.";

  return {
    summary,
    passedRequirements: passed.map((r) => r.requirementId),
    failedRequirements: failed.map((r) => ({
      requirementId: r.requirementId,
      label: r.label,
      explanation: r.explanation,
    })),
    strengths,
    weaknesses: important.slice(0, MAX_WEAKNESSES).map((e) => ({ title: e.title, why: e.why, nodeIds: e.nodeIds })),
    improvements: buildNextSteps(explanations, source).map((step) => ({
      text: step.text,
      tradeoff: step.tradeoff,
      reason: step.reason,
    })),
  };
}

// ---- Entry points ----

// Judges an architecture evaluation against a challenge. Use this when the design has already
// been evaluated at the challenge's traffic. `labels` are the components' current names, by id.
export function judgeChallenge(
  challenge: ChallengeDefinition,
  architectureEvaluation: ArchitectureEvaluation,
  labels?: ExplanationSource["labels"],
): ChallengeEvaluation {
  const source: ExplanationSource = { evaluation: architectureEvaluation, labels };
  const resolver = createComponentResolver(source);

  const requirementResults = [
    ...challenge.requirements.map((r) => check(r, "requirement", architectureEvaluation, resolver)),
    ...challenge.constraints.map((r) => check(r, "constraint", architectureEvaluation, resolver)),
  ];
  const score = scoreOf(challenge, requirementResults, architectureEvaluation);

  return {
    challengeId: challenge.id,
    architectureEvaluation,
    requirementResults,
    score,
    feedback: feedbackOf(requirementResults, score, source),
  };
}

// Evaluates a design for a challenge: the shared architecture evaluation at the challenge's
// traffic, judged against its requirements.
export function evaluateChallenge(input: {
  challenge: ChallengeDefinition;
  graph: GraphInput;
  labels?: ExplanationSource["labels"];
}): ChallengeEvaluation {
  const architectureEvaluation = evaluateArchitecture({
    graph: input.graph,
    traffic: input.challenge.traffic,
  });
  return judgeChallenge(input.challenge, architectureEvaluation, input.labels);
}
