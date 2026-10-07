import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getLearnHint, shouldShowHint, type LearnHint } from "../../lib/architecture/learn/hints";
import { validateObjective } from "../../lib/architecture/learn/objectives";
import {
  createLearnSession,
  learnPhase,
  reconcileLearnSession,
  recordAttempt,
  type LearnSession,
} from "../../lib/architecture/learn/session";
import { classifyLessonConnection, type LessonEdge, type LessonNode } from "./lessonValidation";
import type { ConnectionFeedback, Lesson } from "./lessons";

// "active": waiting for the objective. "success": objective met, shown briefly.
// "complete": every step is met.
export type LessonStatus = "active" | "success" | "complete";

export const SUCCESS_DURATION_MS = 700;

// Connects a lesson to the canvas. Where the learner is comes from the design itself (see
// lib/architecture/learn/session): the current step is the first one the design does not meet
// right now, so undo, redo, deleting a component and resetting always agree with the lesson.
// This hook only adds what is about the screen: the brief "success" moment when a step is met,
// and the message for a connection that is a known mistake.
export function useLessonEngine(
  lesson: Lesson,
  nodes: readonly LessonNode[],
  edges: readonly LessonEdge[],
  enabled: boolean,
) {
  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  // A saved project opens where its design already is: the lesson resumes at the first step it
  // does not meet yet (or is finished) instead of replaying the celebrations for steps the
  // design already had.
  const [opening] = useState(() => reconcileLearnSession(lesson, createLearnSession(lesson), graph));
  const [session, setSession] = useState<LearnSession>(opening);
  // Always follows the design, even while Learn is not the project's mode: where the lesson is
  // is derived from the design, so it is right the moment Learn is shown again.
  const reconciled = useMemo(
    () => reconcileLearnSession(lesson, session, graph),
    [lesson, session, graph],
  );
  // Keeps what has been completed in the past. Reconciling returns the same object when nothing
  // changed, so this settles after one extra render.
  if (reconciled !== session) setSession(reconciled);

  const count = lesson.steps.length;
  const target = reconciled.currentStep;
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });

  // What the card shows: a step, and whether it is being celebrated or the lesson is finished.
  // `seen` is the design's current step as of the last render, so a change in it is noticed once.
  const [display, setDisplay] = useState<{ stepIndex: number; status: LessonStatus; seen: number }>(
    () =>
      opening.currentStep >= count
        ? { stepIndex: count - 1, status: "complete", seen: opening.currentStep }
        : { stepIndex: opening.currentStep, status: "active", seen: opening.currentStep },
  );
  const [feedback, setFeedback] = useState<ConnectionFeedback | null>(null);

  if (!enabled && display.seen !== target) {
    // Learn is not the project's current mode (Challenge is). The design may change meanwhile, so
    // follow it quietly: coming back resumes where the design is, with no step celebrated again.
    setDisplay(
      target >= count
        ? { stepIndex: count - 1, status: "complete", seen: target }
        : { stepIndex: target, status: "active", seen: target },
    );
    setFeedback(null);
  }

  if (enabled && display.seen !== target) {
    let next: { stepIndex: number; status: LessonStatus };
    if (display.status === "success" || (display.status === "complete" && target >= count)) {
      // Keep celebrating, or stay finished.
      next = display;
    } else if (target > display.stepIndex) {
      // A step was met: celebrate it, then move on.
      next = { stepIndex: display.stepIndex, status: "success" };
    } else if (target < display.stepIndex || (display.status === "complete" && target < count)) {
      // The design no longer meets what the lesson had reached: go back to what is missing.
      next = { stepIndex: target, status: "active" };
    } else {
      next = display;
    }
    setDisplay({ ...next, seen: target });
    setFeedback(null);
  }

  useEffect(() => {
    if (display.status !== "success") return;
    const timer = setTimeout(() => {
      const latest = targetRef.current;
      setDisplay((current) => ({
        ...(latest >= count
          ? { stepIndex: count - 1, status: "complete" as const }
          : { stepIndex: latest, status: "active" as const }),
        seen: current.seen,
      }));
    }, SUCCESS_DURATION_MS);
    return () => clearTimeout(timer);
  }, [display, count]);

  const step = lesson.steps[display.stepIndex];

  const check = useMemo(() => validateObjective(step.objective, graph), [step, graph]);
  const hint: LearnHint | null = useMemo(
    () => (display.status === "active" ? getLearnHint(step.objective, check) : null),
    [display.status, step, check],
  );
  const hintVisible =
    display.status === "active" && shouldShowHint(reconciled.attempts[step.id] ?? 0, check);

  // Once every step has held, the tutorial is over: the design is the learner's to change, and
  // the lesson no longer steps back in, gives hints or corrects connections. The last step's
  // celebration still plays first.
  const freePlay = enabled && learnPhase(reconciled) === "free-play" && display.status !== "success";

  const reset = useCallback(() => {
    setSession(createLearnSession(lesson));
    setDisplay((current) => ({ stepIndex: 0, status: "active", seen: current.seen }));
    setFeedback(null);
  }, [lesson]);

  // Called with the connection the learner just made, so feedback reacts once per
  // connection instead of rescanning old edges.
  const reportConnection = (connection: LessonEdge) => {
    if (!enabled || freePlay || display.status !== "active") return;
    const classified = classifyLessonConnection(step, connection, nodes);
    if (classified.result !== "incorrect") return;
    setFeedback(classified.feedback);
    setSession((current) => recordAttempt(current, step.id));
  };

  const dismissFeedback = useCallback(() => setFeedback(null), []);

  return {
    stepIndex: display.stepIndex,
    status: display.status,
    step,
    feedback,
    reportConnection,
    dismissFeedback,
    reset,
    session: reconciled,
    check,
    hint: freePlay ? null : hint,
    hintVisible: !freePlay && hintVisible,
    // The tutorial is finished: show the "your turn" state instead of a step.
    freePlay,
  };
}
