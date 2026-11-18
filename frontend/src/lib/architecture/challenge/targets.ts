import type { ArchitectureEvaluation } from "../evaluation/contract.ts";
import type { ChallengeDefinition, ChallengeRequirement } from "./contract.ts";
import { judgeChallenge } from "./evaluate.ts";

// The challenge's measurable targets against the design as it is now: the same checks a
// submission is graded on, read live while the design is edited. Component requirements and
// limits are left to the submission; these are the numbers the design moves with every change.

export type LiveTarget = {
  id: string;
  // "p95 ≤ 100 ms"
  label: string;
  // What the design measures now: "67 ms".
  value: string;
  met: boolean;
};

const MEASURED = new Set<ChallengeRequirement["kind"]>(["min-capacity", "max-latency", "min-availability", "max-cost"]);
const n0 = (value: number) => Math.round(value).toLocaleString("en-US");

function labelOf(requirement: ChallengeRequirement): string {
  switch (requirement.kind) {
    case "min-capacity": return `Capacity ≥ ${n0(requirement.minRps)} req/s`;
    case "max-latency": return `p95 ≤ ${n0(requirement.maxP95Ms)} ms`;
    case "min-availability": return `Uptime ≥ ${requirement.minPercent}%`;
    case "max-cost": return `Budget ≤ $${n0(requirement.maxMonthlyCost)}/mo`;
    default: return requirement.label;
  }
}

function valueOf(kind: ChallengeRequirement["kind"], measured: number | null, ready: boolean): string {
  if (!ready) return "—";
  switch (kind) {
    case "min-capacity": return measured === null ? "No limit" : `${n0(measured)} req/s`;
    case "max-latency": return `${n0(measured ?? 0)} ms`;
    case "min-availability": return `${measured ?? 0}%`;
    case "max-cost": return `$${n0(measured ?? 0)}/mo`;
    default: return String(measured ?? "");
  }
}

export function liveTargets(challenge: ChallengeDefinition, evaluation: ArchitectureEvaluation): LiveTarget[] {
  const all = [...challenge.requirements, ...challenge.constraints].filter((r) => MEASURED.has(r.kind));
  const results = new Map(judgeChallenge(challenge, evaluation).requirementResults.map((r) => [r.requirementId, r]));
  return all.flatMap((requirement) => {
    const result = results.get(requirement.id);
    if (!result) return [];
    return [{
      id: requirement.id,
      label: labelOf(requirement),
      value: valueOf(requirement.kind, result.measuredValue, evaluation.ready),
      met: result.passed,
    }];
  });
}
