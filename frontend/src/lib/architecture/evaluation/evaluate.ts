import { ASSUMPTIONS } from "./capabilities.ts";
import {
  EVALUATION_MODEL_VERSION,
  type ArchitectureEvaluation,
  type Bottleneck,
  type EvaluationInput,
} from "./contract.ts";
import { buildFindings, buildRecommendations } from "./findings.ts";
import {
  ZERO_SCORES,
  architecturePenalty,
  assessHealth,
  costEfficiencyScore,
  overallScore,
  performanceScore,
  reliabilityScore,
  scalabilityScore,
  SCORE_WEIGHTS,
} from "./scoring.ts";
import { simulate } from "./simulation.ts";

import { usableGraph } from "./input.ts";
import { sanitizeTraffic } from "./traffic.ts";

export * from "./contract.ts";
export { sanitizeTraffic, DEFAULT_TRAFFIC, type TrafficProfile } from "./traffic.ts";

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// Evaluates an architecture against a load. Pure and deterministic: the same graph and
// traffic always give the same result, nothing is read or changed outside the arguments,
// and the result is plain data. The graph is described by component types, connections
// and properties only: names and positions never matter.
//
// The input and result are serializable on purpose, so this call can later be answered
// by a server instead without changing what consumes it.
export function evaluateArchitecture(input: EvaluationInput): ArchitectureEvaluation {
  const { traffic, adjusted } = sanitizeTraffic(input?.traffic);
  const graph = usableGraph(input?.graph);

  const sim = simulate(graph, traffic);
  const findings = buildFindings(graph, traffic, sim);
  const recommendations = buildRecommendations(findings);
  const health = assessHealth(sim, findings);

  const scores = sim.ready
    ? {
        scalability: Math.round(scalabilityScore(sim, findings)),
        reliability: Math.round(reliabilityScore(sim)),
        performance: Math.round(performanceScore(sim)),
        costEfficiency: Math.round(costEfficiencyScore(sim)),
      }
    : { ...ZERO_SCORES };
  const penalty = sim.ready ? architecturePenalty(findings) : 0;

  const bottlenecks: Bottleneck[] = sim.nodes
    .filter(
      (node) =>
        node.sync &&
        node.config.capacityPerInstance !== null &&
        node.utilization >= ASSUMPTIONS.nearCapacityUtilization,
    )
    .map((node) => ({
      nodeId: node.id,
      type: node.config.type,
      utilization: round(node.utilization, 3),
      demandRps: round(node.demandRps, 1),
      capacityRps: round(node.capacityRps ?? 0, 1),
      state: node.utilization >= 1 ? ("saturated" as const) : ("near-capacity" as const),
    }))
    .sort((a, b) => b.utilization - a.utilization || (a.nodeId < b.nodeId ? -1 : 1));

  const successRatio = sim.requestedRps > 0 ? sim.effectiveRps / sim.requestedRps : 1;

  return {
    modelVersion: EVALUATION_MODEL_VERSION,
    ready: sim.ready,
    traffic,
    adjustedInputs: adjusted,
    overallScore: overallScore(scores, penalty),
    scores,
    scoring: { weights: { ...SCORE_WEIGHTS }, architecturePenalty: penalty },
    metrics: {
      requestedRps: round(sim.requestedRps, 1),
      effectiveRps: round(sim.effectiveRps, 1),
      capacityRps: sim.capacityRps === null ? null : round(sim.capacityRps, 1),
      p95LatencyMs: round(sim.p95LatencyMs, 1),
      estimatedMonthlyCost: Math.round(sim.monthlyCost),
      availability: sim.ready ? round(sim.uptimeAvailability * successRatio * 100, 3) : 0,
      uptimeAvailability: sim.ready ? round(sim.uptimeAvailability * 100, 3) : 0,
    },
    health,
    bottlenecks,
    bottleneckNodeIds: bottlenecks.map((bottleneck) => bottleneck.nodeId),
    limitingNodeId: sim.limitingNodeId,
    criticalPath: sim.criticalPath,
    nodes: sim.nodes.map((node) => ({
      nodeId: node.id,
      type: node.config.type,
      reachable: node.reachable,
      instances: node.config.instances,
      utilization: round(node.utilization, 3),
      demandRps: round(node.demandRps, 1),
      capacityRps: node.capacityRps === null ? null : round(node.capacityRps, 1),
      latencyMs: round(node.latencyMs, 1),
      availability: node.config.availability,
      monthlyCost: Math.round(node.config.monthlyCost),
    })),
    findings,
    recommendations,
  };
}
