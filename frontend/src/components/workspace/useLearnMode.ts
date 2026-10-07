import type { Edge } from "@xyflow/react";

import {
  firstWebSystemLesson,
  type Lesson,
} from "../learn/lessons";
import { useLessonEngine } from "../learn/useLessonEngine";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { useRunSession } from "./useRunSession";

// Controls everything that belongs specifically to Learn mode.
//
// Learn has two phases:
// 1. Guided tutorial — the lesson watches the architecture and moves forward as the user builds.
// 2. Free play — after the tutorial, the user keeps the same canvas and can experiment freely.
//
// Challenge state does not belong here. Learn and Challenge share the project graph,
// but their lesson/results/submission state stays separate.
export function useLearnMode({
  enabled,
  scopeKey,
  nodes,
  edges,
  lesson = firstWebSystemLesson,
}: {
  enabled: boolean;
  scopeKey: string | null;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  lesson?: Lesson;
}) {
  // The lesson engine watches the live graph and figures out which tutorial step
  // the learner is on, whether the step is complete, and what feedback/hints to show.
  const engine = useLessonEngine(
    lesson,
    nodes,
    edges,
    enabled,
  );

  // freePlay becomes true once the guided lesson is finished.
  // restartLesson lets Reset take Learn back to the beginning.
  const {
    freePlay,
    reset: restartLesson,
  } = engine;

  // Run Design is only available after the tutorial is finished.
  //
  // This gets its own run session, separate from Challenge, so a Challenge
  // submission/result can never accidentally appear inside Learn mode.
  const runs = useRunSession({
    scopeKey,
    enabled: enabled && freePlay,
    nodes,
    edges,
  });

  // Learn Reset uses this to remove old Run Design / System Review results
  // so we don't keep showing analysis for an architecture that was reset.
  const {
    reset: clearAnalysis,
  } = runs;

  // ArchitectureWorkspace gets everything it needs for both phases of Learn.
  return {
    lesson,
    engine,
    freePlay,
    runs,
    restartLesson,
    clearAnalysis,
  };
}