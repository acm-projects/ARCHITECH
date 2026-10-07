import type { ArchitectureNodeType } from "../workspace/nodes/ArchitectureNode";
import { validateObjective } from "../../lib/architecture/learn/objectives.ts";
import type { ConnectionFeedback, LessonObjective } from "./lessons";

// Structural subsets of React Flow's node and edge, so the validator stays pure.
export type LessonNode = {
  id: string;
  data: { type: ArchitectureNodeType; properties?: Record<string, string | number | boolean> };
};
export type LessonEdge = { source: string; target: string };

// True when the canvas satisfies the objective. The check itself, and the reason it fails,
// are in lib/architecture/learn/objectives.
export function isLessonStepComplete(
  step: { objective: LessonObjective },
  nodes: readonly LessonNode[],
  edges: readonly LessonEdge[],
): boolean {
  return validateObjective(step.objective, { nodes, edges }).valid;
}

export type ConnectionClassification =
  | { result: "correct" | "unrelated"; feedback?: undefined }
  | { result: "incorrect"; feedback: ConnectionFeedback };

// Classifies a newly created connection against the current step.
// correct: satisfies the objective. incorrect: matches a known misconception in the
// step's feedback rules. unrelated: anything else (not necessarily wrong).
// Uses component types only, never labels. Only connection steps (edge, path) have rules.
export function classifyLessonConnection(
  step: { objective: LessonObjective },
  edge: LessonEdge,
  nodes: readonly LessonNode[],
): ConnectionClassification {
  const { objective } = step;
  if (objective.kind !== "edge" && objective.kind !== "path") return { result: "unrelated" };

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
