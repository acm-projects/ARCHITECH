import { useCallback, useEffect, useState } from "react";

import {
  classifyLessonConnection,
  isLessonStepComplete,
  type LessonEdge,
  type LessonNode,
} from "./lessonValidation";
import type { ConnectionFeedback, Lesson } from "./lessons";

// "active": waiting for the objective. "success": objective met, shown briefly.
// "complete": the last step has succeeded.
export type LessonStatus = "active" | "success" | "complete";

export const SUCCESS_DURATION_MS = 700;

// Watches the canvas and advances the lesson. Only the current step is evaluated, and the
// lesson never moves backwards when something is deleted later.
export function useLessonEngine(
  lesson: Lesson,
  nodes: readonly LessonNode[],
  edges: readonly LessonEdge[],
  enabled: boolean,
) {
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<LessonStatus>("active");
  // Corrective feedback for the last incorrect connection, until dismissed, corrected
  // or reset.
  const [feedback, setFeedback] = useState<ConnectionFeedback | null>(null);

  const step = lesson.steps[stepIndex];
  if (
    enabled &&
    status === "active" &&
    isLessonStepComplete(step, nodes, edges)
  ) {
    setStatus("success");
    // The correct connection wins over any open feedback.
    if (feedback) setFeedback(null);
  }

  // After the brief success state, move to the next step or finish the lesson.
  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => {
      if (stepIndex >= lesson.steps.length - 1) {
        setStatus("complete");
      } else {
        setStepIndex(stepIndex + 1);
        setStatus("active");
        setFeedback(null);
      }
    }, SUCCESS_DURATION_MS);
    return () => clearTimeout(timer);
  }, [status, stepIndex, lesson.steps.length]);

  const reset = useCallback(() => {
    setStepIndex(0);
    setStatus("active");
    setFeedback(null);
  }, []);

  // Called with the connection the learner just made, so feedback reacts once per
  // connection instead of rescanning old edges.
  const reportConnection = (connection: LessonEdge) => {
    if (!enabled || status !== "active") return;
    const classified = classifyLessonConnection(step, connection, nodes);
    if (classified.result === "incorrect") setFeedback(classified.feedback);
  };

  const dismissFeedback = useCallback(() => setFeedback(null), []);

  return {
    stepIndex,
    status,
    step,
    feedback,
    reportConnection,
    dismissFeedback,
    reset,
  };
}
