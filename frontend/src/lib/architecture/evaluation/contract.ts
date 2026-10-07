import type { GraphInput } from "../graph.ts";
import type { ArchitectureNodeType } from "../types.ts";
import type { TrafficProfile } from "./traffic.ts";

// The whole contract between the evaluation engine and anything that shows or stores its
// result. It is plain data (no functions, no class instances, nothing that depends on the
// browser), so the same shapes can travel over a network later. See evaluate.ts.

// Bump when the meaning of a field changes, so stored or remote results can be recognised.
export const EVALUATION_MODEL_VERSION = 1;

export type EvaluationInput = {
  graph: GraphInput;
  // Anything is accepted; invalid or missing values are replaced (see traffic.ts).
  traffic?: unknown;
};

export type Severity = "high" | "medium" | "low";

export type FindingCategory =
  | "scalability"
  | "reliability"
  | "performance"
  | "cost"
  | "architecture";

export type EvaluationFinding = {
  // Stable for the same problem on the same node, for example `saturated-database-1`.
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  message: string;
  nodeIds: string[];
  recommendation: string;
};

// One recommendation per finding that has one, in the same order as the findings, so the
// advice always traces back to the observation that caused it.
export type Recommendation = {
  id: string;
  findingId: string;
  severity: Severity;
  text: string;
  nodeIds: string[];
};

export type Bottleneck = {
  nodeId: string;
  type: ArchitectureNodeType;
  // Fraction of the component's capacity in use at the requested load. Above 1 it is overloaded.
  utilization: number;
  demandRps: number;
  capacityRps: number;
  state: "saturated" | "near-capacity";
};

export type NodeEvaluation = {
  nodeId: string;
  type: ArchitectureNodeType;
  // Whether any request from a client reaches it.
  reachable: boolean;
  instances: number;
  utilization: number;
  demandRps: number;
  // Null when the component never limits throughput (a client).
  capacityRps: number | null;
  // Latency this component adds at the requested load.
  latencyMs: number;
  // Availability of the component on its own, as a fraction (0.999 = 99.9%).
  availability: number;
  monthlyCost: number;
};

export type CategoryScores = {
  scalability: number;
  reliability: number;
  performance: number;
  costEfficiency: number;
};

export type HealthStatus = "incomplete" | "healthy" | "warning" | "critical";

// One measurable reason behind a health status, with the data a screen needs to describe it
// in its own words (for example with a component's current name).
export type HealthSignal = {
  severity: "critical" | "warning";
  kind: "incomplete" | "capacity" | "availability" | "latency" | "finding";
  // The reason as plain text, the same as the matching entry of `reasons`.
  message: string;
  nodeId?: string;
  findingId?: string;
  // capacity: utilization (1 = full). availability: fraction up. latency: milliseconds.
  value?: number;
};

export type ArchitectureEvaluation = {
  modelVersion: number;
  // False when no request can get from a client to a component: nothing meaningful to score.
  ready: boolean;

  // The inputs actually used, and the names of any that had to be corrected.
  traffic: TrafficProfile;
  adjustedInputs: string[];

  // 0-100 integers.
  overallScore: number;
  scores: CategoryScores;
  scoring: {
    weights: CategoryScores;
    // Points taken off the weighted average for architecture findings.
    architecturePenalty: number;
  };

  metrics: {
    requestedRps: number;
    // What the design can actually serve: min(requested, capacity).
    effectiveRps: number;
    // The most load the design can take, or null when nothing limits it.
    capacityRps: number | null;
    p95LatencyMs: number;
    estimatedMonthlyCost: number;
    // Percent of requests served successfully, for example 99.95. Falls when the design is overloaded.
    availability: number;
    // Percent of time the design is up, ignoring dropped requests. This is what the
    // reliability score is based on.
    uptimeAvailability: number;
  };

  health: { status: HealthStatus; reasons: string[]; signals: HealthSignal[] };

  bottlenecks: Bottleneck[];
  bottleneckNodeIds: string[];
  // The component that would saturate first, even when it is nowhere near saturated.
  limitingNodeId: string | null;
  // Node ids along the slowest common request path.
  criticalPath: string[];

  nodes: NodeEvaluation[];
  findings: EvaluationFinding[];
  recommendations: Recommendation[];
};
