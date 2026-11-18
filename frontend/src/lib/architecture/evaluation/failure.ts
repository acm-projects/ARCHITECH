import { roleOf } from "../analysis.ts";
import type { GraphInput } from "../graph.ts";
import { usableGraph } from "./input.ts";
import { sharedEvaluationCache, type LiveSummary, type createEvaluationCache } from "./liveMetrics.ts";
import { simulate } from "./simulation.ts";
import { sanitizeTraffic } from "./traffic.ts";

// Failure test: one component goes down and the rest of the design carries on without it.
// The served share comes from the simulation's own availability model with that component
// forced down and every other one up, so redundancy (a replica, a second server behind a load
// balancer, a cache answering reads) shows as requests that still succeed. What is left is
// then evaluated as a design of its own, for the capacity and latency the survivors give.

export type FailureImpact = {
  nodeId: string;
  // Share of requests still answered while the component is down, 0-100.
  servedPercent: number;
  // Components of the same type that share its upstream, so its work moves to them.
  takeover: string[];
  // The design without the component, when it still serves anything.
  remaining: LiveSummary | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// A client is where requests come from, so failing one tests nothing about the design.
export function canFail(type: string): boolean {
  return roleOf(type as never) !== "entry";
}

export function failureImpact(
  graphInput: unknown,
  trafficInput: unknown,
  nodeId: string,
  cache: ReturnType<typeof createEvaluationCache> = sharedEvaluationCache,
): FailureImpact | null {
  const graph: GraphInput = usableGraph(graphInput);
  const failed = graph.nodes.find((node) => node.id === nodeId);
  if (!failed || !canFail(failed.data.type)) return null;
  const { traffic } = sanitizeTraffic(trafficInput);

  const sim = simulate(graph, traffic, { down: new Set([nodeId]) });
  if (!sim.ready) return null;
  const servedPercent = round2(Math.max(0, Math.min(1, sim.uptimeAvailability)) * 100);

  const upstream = new Set(graph.edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source));
  const takeover = graph.nodes
    .filter((node) =>
      node.id !== nodeId &&
      node.data.type === failed.data.type &&
      graph.edges.some((edge) => edge.target === node.id && upstream.has(edge.source)))
    .map((node) => node.id);

  const rest: GraphInput = {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
  };
  const remaining = servedPercent > 0 ? cache.get(rest, traffic).summary : null;
  return { nodeId, servedPercent, takeover, remaining: remaining?.ready ? remaining : null };
}
