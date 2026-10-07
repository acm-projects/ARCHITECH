import type { GraphInput } from "../graph.ts";
import { validateObjective, type LearnObjective, type ObjectiveCheck } from "./objectives.ts";

// The state of one person working through one lesson. It holds no React or screen state.
//
// Where the learner is comes from the design, not from remembered clicks: the current step is
// the first one whose objective the graph does not meet right now. So undo, redo, deleting a
// component or resetting the canvas can never leave the lesson claiming something exists that
// does not. What is remembered is only history: which steps have held at some point
// (`completedSteps`) and how many wrong connections were tried on each step (`attempts`).

export type LessonLike = {
  id: string;
  steps: { id: number; objective: LearnObjective }[];
};

export type LearnSessionStatus = "not-started" | "in-progress" | "completed";

export type LearnSession = {
  lessonId: string;
  // completed means every step holds in the current design.
  status: LearnSessionStatus;
  // Index of the first step the design does not meet, or the number of steps when all are met.
  currentStep: number;
  // Ids of steps that have held at some time this session, even if the design no longer meets them.
  completedSteps: number[];
  // Ids of steps the design meets right now.
  validSteps: number[];
  // Every step has held at some time this session (the lesson was finished once).
  everCompleted: boolean;
  // Wrong connection attempts, by step id.
  attempts: Record<number, number>;
};

export function createLearnSession(lesson: LessonLike): LearnSession {
  return {
    lessonId: lesson.id,
    status: "not-started",
    currentStep: 0,
    completedSteps: [],
    validSteps: [],
    everCompleted: false,
    attempts: {},
  };
}

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

// Checks every step against the design.
export function checkLesson(lesson: LessonLike, graph: GraphInput): ObjectiveCheck[] {
  return lesson.steps.map((step) => validateObjective(step.objective, graph));
}

// Brings a session in line with the design as it is now. Returns the same object when nothing
// about the session changes, so it is safe to call on every render.
export function reconcileLearnSession(
  lesson: LessonLike,
  session: LearnSession,
  graph: GraphInput,
): LearnSession {
  const checks = checkLesson(lesson, graph);
  const validSteps = lesson.steps.filter((_, index) => checks[index].valid).map((step) => step.id);
  const firstUnmet = checks.findIndex((check) => !check.valid);
  const currentStep = firstUnmet === -1 ? lesson.steps.length : firstUnmet;

  const completedSteps = [...new Set([...session.completedSteps, ...validSteps])].sort((a, b) => a - b);
  const everCompleted = session.everCompleted || completedSteps.length === lesson.steps.length;
  const status: LearnSessionStatus =
    currentStep === lesson.steps.length
      ? "completed"
      : completedSteps.length === 0 && Object.keys(session.attempts).length === 0
        ? "not-started"
        : "in-progress";

  if (
    session.lessonId === lesson.id &&
    session.status === status &&
    session.currentStep === currentStep &&
    session.everCompleted === everCompleted &&
    sameList(session.validSteps, validSteps) &&
    sameList(session.completedSteps, completedSteps)
  ) {
    return session;
  }
  return { ...session, lessonId: lesson.id, status, currentStep, completedSteps, validSteps, everCompleted };
}

// Counts a wrong connection against a step.
export function recordAttempt(session: LearnSession, stepId: number): LearnSession {
  return { ...session, attempts: { ...session.attempts, [stepId]: (session.attempts[stepId] ?? 0) + 1 } };
}

// Starts the lesson over: forgets what was completed and every attempt.
export function resetLearnSession(lesson: LessonLike): LearnSession {
  return createLearnSession(lesson);
}

// "guided": the lesson is still being worked through. "free-play": every step has held at some
// time, so the learner has finished the tutorial and may change the design however they like
// (adding, deleting, rewiring, running it) without the lesson stepping back in. Resetting the
// lesson returns to "guided".
export type LearnPhase = "guided" | "free-play";

export const learnPhase = (session: Pick<LearnSession, "everCompleted">): LearnPhase =>
  session.everCompleted ? "free-play" : "guided";
