import type { ArchitectureEvaluation, NodeEvaluation } from "../evaluation/contract.ts";
import {
  COMPONENT_ROLES,
  createComponentResolver,
  noun,
  nodeEvaluation,
  upperFirst,
} from "./components.ts";
import type { ComponentRef, Explanation, ExplanationSource } from "./contract.ts";
import { explainFindings } from "./explain.ts";

// Archie's answer about one component: what it is, how it fared in the last run, and the
// explanations that involve it ("why is this database a bottleneck?", "what is wrong with this
// server?"). Built from the evaluation only.

export type NodeExplanation =
  // No run to explain yet.
  | { status: "unavailable"; message: string }
  // The component exists but was not part of the run (added afterwards), or no longer exists.
  | { status: "not-analyzed"; component: ComponentRef; message: string }
  | {
      status: "findings" | "no-findings";
      component: ComponentRef;
      // What this kind of component does, in a sentence.
      role: string;
      // How it fared in the run, from the evaluation's own numbers. Never says everything is fine.
      summary: string;
      // Explanations that involve this component, most important first.
      explanations: Explanation[];
      stats: Pick<NodeEvaluation, "reachable" | "instances" | "utilization" | "demandRps" | "capacityRps">;
    };

const n0 = (value: number) => Math.round(value).toLocaleString("en-US");

export const NO_RESULT_MESSAGE = "Run your design first so Archie can analyze it.";

function summaryOf(stats: NodeEvaluation, label: string): string {
  if (!stats.reachable) {
    return `${label} receives no requests in this design, so it is not doing any work.`;
  }
  if (stats.capacityRps === null) {
    return `${label} receives about ${n0(stats.demandRps)} requests per second. Its capacity is not a limit in this model.`;
  }
  return `${label} receives about ${n0(stats.demandRps)} requests per second and can handle about ${n0(stats.capacityRps)}, using about ${Math.round(stats.utilization * 100)}% of its capacity, across ${stats.instances} ${stats.instances === 1 ? "instance" : "instances"}.`;
}

export function explainNode(
  source: ExplanationSource | null,
  nodeId: string,
  explanations?: Explanation[],
): NodeExplanation {
  if (!source) return { status: "unavailable", message: NO_RESULT_MESSAGE };

  const resolver = createComponentResolver(source);
  const component = resolver.ref(nodeId);
  const stats = nodeEvaluation(source.evaluation, nodeId);

  if (!stats) {
    return {
      status: "not-analyzed",
      component,
      message: component.present
        ? "This component was not part of your last run. Run your design again to include it."
        : "This component is no longer in your design.",
    };
  }

  const related = (explanations ?? explainFindings(source)).filter((e) => e.nodeIds.includes(nodeId));
  const label = upperFirst(resolver.describe(nodeId));
  return {
    status: related.length > 0 ? "findings" : "no-findings",
    component,
    role: COMPONENT_ROLES[stats.type],
    summary: `${summaryOf(stats, label)}${related.length === 0 ? " Architech found no specific problem with it in this run." : ""}`,
    explanations: related,
    stats: {
      reachable: stats.reachable,
      instances: stats.instances,
      utilization: stats.utilization,
      demandRps: stats.demandRps,
      capacityRps: stats.capacityRps,
    },
  };
}

// The evaluation's view of one type, for callers that only have the evaluation.
export const typeName = (evaluation: ArchitectureEvaluation, nodeId: string) =>
  noun(nodeEvaluation(evaluation, nodeId)?.type ?? null);
