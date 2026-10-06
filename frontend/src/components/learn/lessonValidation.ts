import type { ArchitectureNodeType } from "../workspace/nodes/ArchitectureNode";
import type { ConnectionFeedback, LessonObjective } from "./lessons";

// Structural subsets of React Flow's node and edge, so the validator stays pure.
export type LessonNode = { id: string; data: { type: ArchitectureNodeType } };
export type LessonEdge = { source: string; target: string };

// True when the canvas satisfies the objective. Edges are matched by the component
// types of their endpoints and in one direction only; any matching pair counts.
export function isLessonStepComplete(
  step: { objective: LessonObjective },
  nodes: readonly LessonNode[],
  edges: readonly LessonEdge[],
): boolean {
  const { objective } = step;

  if (objective.kind === "node") {
    return nodes.some((node) => node.data.type === objective.componentType);
  }

  const typeById = new Map(nodes.map((node) => [node.id, node.data.type]));
  return edges.some(
    (edge) =>
      typeById.get(edge.source) === objective.sourceType &&
      typeById.get(edge.target) === objective.targetType,
  );
}

export type ConnectionClassification =
  | { result: "correct" | "unrelated"; feedback?: undefined }
  | { result: "incorrect"; feedback: ConnectionFeedback };

// Classifies a newly created connection against the current step.
// correct: satisfies the objective. incorrect: matches a known misconception in the
// step's feedback rules. unrelated: anything else (not necessarily wrong).
// Uses component types only, never labels.
export function classifyLessonConnection(
  step: { objective: LessonObjective },
  edge: LessonEdge,
  nodes: readonly LessonNode[],
): ConnectionClassification {
  const { objective } = step;
  if (objective.kind !== "edge") return { result: "unrelated" };

  const typeById = new Map(nodes.map((node) => [node.id, node.data.type]));
  const sourceType = typeById.get(edge.source);
  const targetType = typeById.get(edge.target);
  if (!sourceType || !targetType) return { result: "unrelated" };

  if (
    sourceType === objective.sourceType &&
    targetType === objective.targetType
  ) {
    return { result: "correct" };
  }

  const rule = objective.feedbackRules?.find(
    (candidate) =>
      candidate.sourceType === sourceType && candidate.targetType === targetType,
  );
  if (!rule) return { result: "unrelated" };

  return {
    result: "incorrect",
    feedback: { title: rule.title, explanation: rule.explanation },
  };
}
