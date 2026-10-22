import { implementationsFor, resolveImplementation, type ComponentImplementationSeed } from "../componentLibrary.ts";
import type { GraphInput } from "../graph.ts";
import { usableGraph } from "./input.ts";
import { sharedEvaluationCache, type LiveSummary, createEvaluationCache } from "./liveMetrics.ts";

// "What if this component used another technology?" Every technology for one component,
// each evaluated as part of the whole design (score, p95, cost, capacity, uptime), so the
// trade-off is visible where it matters: PostgreSQL vs MongoDB for *this* design at *this*
// traffic. Uses the shared evaluation cache, so reopening the card is instant.

export type WhatIfOption = {
  implementation: ComponentImplementationSeed;
  current: boolean;
  summary: LiveSummary;
};

export type WhatIf = { ready: boolean; options: WhatIfOption[] };

export function compareTechnologiesInDesign(
  graphInput: unknown,
  traffic: unknown,
  nodeId: string,
  cache: ReturnType<typeof createEvaluationCache> = sharedEvaluationCache,
): WhatIf | null {
  const graph: GraphInput = usableGraph(graphInput);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.data.type === "custom") return null;
  const type = node.data.type;
  const currentId = resolveImplementation(type, node.data.implementation).id;
  const options = implementationsFor(type).map((implementation) => {
    const swapped: GraphInput = {
      ...graph,
      nodes: graph.nodes.map((candidate) =>
        candidate.id === nodeId ? { ...candidate, data: { ...candidate.data, implementation: implementation.id } } : candidate,
      ),
    };
    return { implementation, current: implementation.id === currentId, summary: cache.get(swapped, traffic).summary };
  });
  return { ready: options.every((option) => option.summary.ready), options };
}
