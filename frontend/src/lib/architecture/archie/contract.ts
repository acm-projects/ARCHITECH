import type {
  ArchitectureEvaluation,
  CategoryScores,
  FindingCategory,
  HealthStatus,
  Severity,
} from "../evaluation/contract.ts";
import type { ArchitectureNodeType } from "../types.ts";

// Archie explains the evaluation; it never replaces it. Everything here is derived from an
// ArchitectureEvaluation that was already produced, uses its numbers as given, and is plain
// serializable data: no components, no styling, nothing a screen needs to interpret.

// A component as a person would name it. `id` and `type` are what the logic uses; `label` is
// for display only. `present` is false when the component is no longer in the design (it was
// deleted after the run that is being explained), in which case `label` is a generic name.
export type ComponentRef = {
  id: string;
  type: ArchitectureNodeType | null;
  label: string;
  present: boolean;
};

export type ExplanationKind =
  | "overloaded"
  | "near-capacity"
  | "queue-backlog"
  | "queue-no-consumer"
  | "single-point-of-failure"
  | "database-redundancy"
  | "missing-cache"
  | "low-benefit-cache"
  | "slow-requests"
  | "long-path"
  | "low-availability"
  | "no-entry-point"
  | "disconnected-client"
  | "no-backend"
  | "no-data-store"
  | "unreachable-data"
  | "questionable-connection"
  | "idle-components"
  | "over-provisioned"
  | "other";

// One finding, explained for someone new to system design.
export type Explanation = {
  id: string;
  // The evaluation finding this explains.
  findingId: string;
  kind: ExplanationKind;
  category: FindingCategory;
  severity: Severity;
  title: string;
  // What was found.
  what: string;
  // Why this design produced it.
  why: string;
  // What it means as traffic grows or something fails.
  impact: string;
  // One reasonable change (the evaluation's own recommendation).
  suggestion: string;
  // What that change costs or complicates, or null when there is no real downside to state.
  tradeoff: string | null;
  nodeIds: string[];
  components: ComponentRef[];
  // Higher is more important. Used only for ordering.
  priority: number;
};

export type HealthExplanation = {
  status: HealthStatus;
  headline: string;
  // The measurable reasons, in plain sentences.
  because: string[];
  // A reminder of what the status does and does not mean, or null.
  caveat: string | null;
};

export type ScoreLevel = "strong" | "fair" | "weak";

export type ScoreExplanation = {
  category: keyof CategoryScores;
  // The evaluation's score, unchanged.
  score: number;
  level: ScoreLevel;
  summary: string;
  // Titles of the explanations that bear on this score.
  factors: string[];
};

export type NextStep = {
  id: string;
  text: string;
  tradeoff: string | null;
  // The reason, as the title of the main explanation behind it.
  reason: string;
  severity: Severity;
  nodeIds: string[];
  // The explanation it comes from, and every finding that the same action would address.
  explanationId: string;
  addresses: string[];
};

export type SystemExplanation = {
  summary: string;
  healthExplanation: HealthExplanation;
  scoreExplanations: ScoreExplanation[];
  primaryIssue: Explanation | null;
  // Most important first.
  explanations: Explanation[];
  // A few actions, most valuable first.
  nextSteps: NextStep[];
};

export type ChangeLine = {
  metric:
    | "overallScore"
    | keyof CategoryScores
    | "capacityRps"
    | "p95LatencyMs"
    | "estimatedMonthlyCost"
    | "availability";
  label: string;
  direction: "improved" | "regressed";
  before: number | null;
  after: number | null;
  text: string;
};

export type ComparisonExplanation = {
  headline: string;
  improved: ChangeLine[];
  regressed: ChangeLine[];
  resolved: { findingId: string; title: string }[];
  introduced: { findingId: string; title: string }[];
  healthChange: string | null;
  // Said only when something got better at the price of cost.
  tradeoffNote: string | null;
};

export type ExplanationSource = {
  evaluation: ArchitectureEvaluation;
  // Current names of the components, by id. Absent: names are not known.
  labels?: Readonly<Record<string, string>>;
};
