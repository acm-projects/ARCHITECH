import type { ArchitectureEvaluation } from "../evaluation/contract.ts";
import type { TrafficProfile } from "../evaluation/traffic.ts";
import type { ArchitectureNodeType } from "../types.ts";

// A challenge is a problem with conditions a design has to meet. The conditions are data that
// can be checked against the architecture evaluation, so a challenge needs no code of its own
// and the same evaluator judges every one. Plain serializable data throughout.

export type RequirementBase = {
  id: string;
  // Short statement shown to the user, for example "Handle 10,000 requests per second".
  label: string;
  // Failing it caps the score: the design cannot count as solving the challenge. Default false.
  mandatory?: boolean;
  // Share of the requirement score. Default 1.
  weight?: number;
};

export type ChallengeRequirement = RequirementBase &
  (
    // Capacity of the design, in requests per second, at least this.
    | { kind: "min-capacity"; minRps: number }
    // p95 latency, in milliseconds, at most this.
    | { kind: "max-latency"; maxP95Ms: number }
    // Uptime, in percent, at least this.
    | { kind: "min-availability"; minPercent: number }
    // Estimated monthly cost at most this.
    | { kind: "max-cost"; maxMonthlyCost: number }
    // At least `minCount` (default 1) components of this type that requests reach.
    | { kind: "requires-component"; componentType: ArchitectureNodeType; minCount?: number }
    // No component of this type anywhere in the design.
    | { kind: "forbids-component"; componentType: ArchitectureNodeType }
    // At most this many components, not counting clients.
    | { kind: "max-components"; max: number }
  );

export type ChallengeDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type ChallengeScoring = {
  // How the final score is made: a weighted share of the requirement score (how much of the
  // challenge was solved) and of the architecture score (how good the design is). They add up to 1.
  requirementWeight: number;
  architectureWeight: number;
  // The most a design can score while a mandatory requirement fails.
  mandatoryCap: number;
  // The score at or above which a design with every mandatory requirement met counts as solved.
  passScore: number;
};

export type ChallengeDefinition = {
  id: string;
  title: string;
  difficulty: ChallengeDifficulty;
  description: string;
  // The load every submission is evaluated against.
  traffic: Partial<TrafficProfile>;
  // What the system has to do.
  requirements: ChallengeRequirement[];
  // Limits on how it may be built.
  constraints: ChallengeRequirement[];
  scoring: ChallengeScoring;
};

export const DEFAULT_CHALLENGE_SCORING: ChallengeScoring = {
  requirementWeight: 0.6,
  architectureWeight: 0.4,
  mandatoryCap: 59,
  passScore: 70,
};

export type ChallengeRequirementResult = {
  requirementId: string;
  kind: ChallengeRequirement["kind"];
  label: string;
  group: "requirement" | "constraint";
  passed: boolean;
  mandatory: boolean;
  weight: number;
  // What the design measured, and what was asked, where a number is meaningful. A capacity
  // nothing limits has a null measured value.
  measuredValue: number | null;
  target: number | null;
  unit: string | null;
  explanation: string;
  nodeIds: string[];
};

export type ChallengeScore = {
  // 0-100, whole number.
  score: number;
  // Every mandatory requirement is met and the score reaches the pass mark.
  passed: boolean;
  // Weighted share of requirements met, 0-100.
  requirementScore: number;
  // The architecture evaluation's overall score, 0-100.
  architectureScore: number;
  weights: { requirement: number; architecture: number };
  mandatoryFailed: string[];
  // The score was lowered to the cap because a mandatory requirement failed.
  capApplied: boolean;
};

export type ChallengeFeedback = {
  summary: string;
  passedRequirements: string[];
  failedRequirements: { requirementId: string; label: string; explanation: string }[];
  // What the design does well.
  strengths: string[];
  // The main problems the architecture evaluation found, in plain words.
  weaknesses: { title: string; why: string; nodeIds: string[] }[];
  // What to change next, from the same evaluation.
  improvements: { text: string; tradeoff: string | null; reason: string }[];
};

export type ChallengeEvaluation = {
  challengeId: string;
  // The shared evaluation of the design at the challenge's traffic. Not recomputed here.
  architectureEvaluation: ArchitectureEvaluation;
  requirementResults: ChallengeRequirementResult[];
  score: ChallengeScore;
  feedback: ChallengeFeedback;
};
