import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  getLearnHint,
  shouldShowHint,
  type LearnHint,
} from "../../lib/architecture/learn/hints";
import { validateObjective } from "../../lib/architecture/learn/objectives";
import {
  continueLessonDisplay,
  createLearnSession,
  learnPhase,
  reconcileLessonDisplay,
  reconcileLearnSession,
  recordAttempt,
  type LessonDisplay,
  type LearnSession,
} from "../../lib/architecture/learn/session";
import {
  classifyLessonConnection,
  type LessonEdge,
  type LessonNode,
} from "./lessonValidation";
import type {
  ConnectionFeedback,
  Lesson,
} from "./lessons";

export type { LessonStatus } from "../../lib/architecture/learn/session";

// Connects the Learn tutorial to the actual architecture on the canvas.
//
// The important idea is that tutorial progress comes from the DESIGN, not just
// from clicking "Next". We look at the current nodes/edges and find the first
// lesson objective the architecture does not satisfy.
//
// Because of that, undo, redo, delete, reset, and reopening a saved project all
// stay in sync with the lesson automatically.
export function useLessonEngine(
  lesson: Lesson,
  nodes: readonly LessonNode[],
  edges: readonly LessonEdge[],
  enabled: boolean,
) {
  // Keep the current architecture together so all lesson checks use the same graph.
  const graph = useMemo(
    () => ({
      nodes,
      edges,
    }),
    [nodes, edges],
  );

  // When a saved project opens, figure out how far its existing architecture
  // already satisfies the lesson instead of forcing the tutorial back to step 1.
  const [opening] = useState(() =>
    reconcileLearnSession(
      lesson,
      createLearnSession(lesson),
      graph,
    ),
  );

  const [session, setSession] =
    useState<LearnSession>(opening);

  // Keep lesson progress matched to the architecture.
  //
  // This still happens while the user is in Challenge mode because both modes
  // share the same project graph. When they come back to Learn, the tutorial
  // should immediately match whatever the architecture looks like now.
  const reconciled = useMemo(
    () =>
      reconcileLearnSession(
        lesson,
        session,
        graph,
      ),
    [lesson, session, graph],
  );

  // Only update the stored session when reconciliation actually found a change.
  if (reconciled !== session) {
    setSession(reconciled);
  }

  const count = lesson.steps.length;
  const target = reconciled.currentStep;

  // Objective completion and the explanation being read are separate states.
  const [display, setDisplay] = useState<LessonDisplay>(() =>
    opening.currentStep >= count
      ? {
          stepIndex: count - 1,
          status: "complete",
          seen: opening.currentStep,
        }
      : {
          stepIndex: opening.currentStep,
          status: "active",
          seen: opening.currentStep,
        },
  );

  // Temporary feedback for a connection we know is wrong for the current lesson step.
  const [feedback, setFeedback] =
    useState<ConnectionFeedback | null>(null);

  const nextDisplay = reconcileLessonDisplay(display, target, count, enabled);
  if (nextDisplay !== display) {
    setDisplay(nextDisplay);
    setFeedback(null);
  }

  // Completing an objective never dismisses its explanation automatically.
  const continueStep = useCallback(() => {
    if (!enabled) return;
    setDisplay((current) => continueLessonDisplay(current, target, count));
    setFeedback(null);
  }, [enabled, target, count]);

  // This is the lesson step the Learn card should currently display.
  const step = lesson.steps[display.stepIndex];

  // Check the current architecture against this step's actual objective.
  // Continue acknowledges an explanation; only the design can satisfy an objective.
  const check = useMemo(
    () =>
      validateObjective(
        step.objective,
        graph,
      ),
    [step, graph],
  );

  // Figure out the most useful hint for whatever part of the objective is missing.
  const hint: LearnHint | null = useMemo(
    () =>
      display.status === "active"
        ? getLearnHint(step.objective, check)
        : null,
    [display.status, step, check],
  );

  // Don't immediately give the answer away.
  // Hint rules decide when enough failed attempts/progress justify showing one.
  const hintVisible =
    display.status === "active" &&
    shouldShowHint(
      reconciled.attempts[step.id] ?? 0,
      check,
    );

  // Once every objective is satisfied, Learn stops acting like a tutorial.
  // The same architecture becomes free-play and unlocks Run Design,
  // System Review, Stress Test, and Archie.
  //
  // The final explanation stays visible until Continue is pressed.
  const freePlay =
    enabled &&
    learnPhase(reconciled) === "free-play" &&
    display.status !== "success";

  // Reset Learn back to the beginning.
  // ArchitectureWorkspace handles resetting the graph itself; this resets
  // only the lesson-specific progress and feedback.
  const reset = useCallback(() => {
    setSession(
      createLearnSession(lesson),
    );

    setDisplay((current) => ({
      stepIndex: 0,
      status: "active",
      seen: current.seen,
    }));

    setFeedback(null);
  }, [lesson]);

  // ArchitectureWorkspace calls this only for the connection the learner just made.
  // That lets us react to a new mistake once instead of repeatedly scanning old edges.
  const reportConnection = (
    connection: LessonEdge,
  ) => {
    // Once the tutorial is over, Learn stops correcting the learner.
    if (
      !enabled ||
      freePlay ||
      display.status !== "active"
    ) {
      return;
    }

    const classified =
      classifyLessonConnection(
        step,
        connection,
        nodes,
      );

    // Correct/neutral connections don't need corrective feedback.
    if (classified.result !== "incorrect") {
      return;
    }

    setFeedback(classified.feedback);

    // Remember the failed attempt because repeated trouble can unlock a hint.
    setSession((current) =>
      recordAttempt(
        current,
        step.id,
      ),
    );
  };

  const dismissFeedback = useCallback(
    () => setFeedback(null),
    [],
  );

  // useLearnMode gets everything it needs to drive the Learn card
  // and decide when the rest of the project tools should unlock.
  return {
    stepIndex: display.stepIndex,
    status: display.status,
    step,
    feedback,
    reportConnection,
    dismissFeedback,
    continueStep,
    reset,
    session: reconciled,
    check,

    // Hints disappear completely once the learner reaches free play.
    hint: freePlay ? null : hint,
    hintVisible:
      !freePlay && hintVisible,

    // When this becomes true, the guided tutorial steps aside and the learner
    // can freely experiment with the architecture they just built.
    freePlay,
  };
}
