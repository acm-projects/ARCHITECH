import { compareEvaluations, type EvaluationComparison } from "./comparison.ts";
import type {
  Bottleneck,
  CategoryScores,
  EvaluationFinding,
  HealthStatus,
  Recommendation,
} from "./contract.ts";
import type { RunState } from "./runSession.ts";
import type { TrafficProfile } from "./traffic.ts";

// What a screen needs from a run session, already worked out, so components do not read the
// raw evaluation or decide for themselves what "stale" or "retry" means.

export type RunButtonState = "idle" | "analyzing" | "ready" | "stale" | "error";

export const MAX_TOP_FINDINGS = 3;

// How the requested load compares with what the design can take. "unbounded": nothing limits it.
export type DemandVerdict = {
  state: "within" | "exceeds" | "unbounded";
  // Requested load as a fraction of capacity (1 = exactly at capacity); null when unbounded.
  utilization: number | null;
};

export function demandVsCapacity(metrics: {
  requestedRps: number;
  capacityRps: number | null;
}): DemandVerdict {
  if (metrics.capacityRps === null) return { state: "unbounded", utilization: null };
  if (metrics.capacityRps <= 0) {
    return { state: metrics.requestedRps > 0 ? "exceeds" : "within", utilization: null };
  }
  const utilization = metrics.requestedRps / metrics.capacityRps;
  return { state: utilization > 1 ? "exceeds" : "within", utilization };
}

export type ResultsSummary = {
  // False when the design could not be evaluated (nothing reaches a component).
  ready: boolean;
  overallScore: number;
  scores: CategoryScores;
  health: { status: HealthStatus; reasons: string[] };
  metrics: {
    requestedRps: number;
    effectiveRps: number;
    // null: nothing limits it.
    capacityRps: number | null;
    p95LatencyMs: number;
    estimatedMonthlyCost: number;
    availability: number;
  };
  topBottleneck: Pick<Bottleneck, "nodeId" | "type" | "utilization" | "state"> | null;
  topFindings: EvaluationFinding[];
  recommendations: Recommendation[];
  // Traffic values that were not usable and were replaced.
  adjustedInputs: string[];
  traffic: TrafficProfile;
};

export type ResultsView = {
  runButtonState: RunButtonState;
  // Starting a run is allowed (everything except while one is in progress).
  canRun: boolean;
  isRunning: boolean;
  // A result exists (current or stale), possibly while another run is going.
  hasResult: boolean;
  // The design (or traffic) has changed since the result was produced.
  isStale: boolean;
  // Message of the latest failed run. The previous result, if any, is still in `result`.
  error: string | null;
  result: ResultsSummary | null;
  // Latest successful run against the one before it, when there are two.
  comparison: EvaluationComparison | null;
};

// `fingerprint` is that of the live design and traffic right now.
export function buildResultsView(state: RunState, fingerprint: string): ResultsView {
  const { current, previous } = state;
  const isRunning = state.status === "analyzing";
  const isStale = current !== null && current.fingerprint !== fingerprint;

  const runButtonState: RunButtonState =
    state.status === "error"
      ? "error"
      : isRunning
        ? "analyzing"
        : current === null
          ? "idle"
          : isStale
            ? "stale"
            : "ready";

  let result: ResultsSummary | null = null;
  if (current) {
    const { evaluation } = current;
    const top = evaluation.bottlenecks[0];
    result = {
      ready: evaluation.ready,
      overallScore: evaluation.overallScore,
      scores: evaluation.scores,
      health: evaluation.health,
      metrics: evaluation.metrics,
      topBottleneck: top
        ? { nodeId: top.nodeId, type: top.type, utilization: top.utilization, state: top.state }
        : null,
      topFindings: evaluation.findings.slice(0, MAX_TOP_FINDINGS),
      recommendations: evaluation.recommendations.slice(0, MAX_TOP_FINDINGS),
      adjustedInputs: evaluation.adjustedInputs,
      traffic: evaluation.traffic,
    };
  }

  return {
    runButtonState,
    canRun: !isRunning,
    isRunning,
    hasResult: current !== null,
    isStale,
    error: state.status === "error" ? (state.error?.message ?? "The evaluation failed.") : null,
    result,
    comparison: current && previous ? compareEvaluations(previous.evaluation, current.evaluation) : null,
  };
}
