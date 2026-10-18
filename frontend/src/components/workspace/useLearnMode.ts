import type { Edge } from "@xyflow/react";
import { useState } from "react";

import {
  firstWebSystemLesson,
  type Lesson,
} from "../learn/lessons";
import { useLessonEngine } from "../learn/useLessonEngine";
import { projectActions } from "../projects/projectActions";
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
  initiallySkipped = false,
}: {
  enabled: boolean;
  scopeKey: string | null;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  lesson?: Lesson;
  initiallySkipped?: boolean;
}) {
  const [skipped, setSkipped] = useState(initiallySkipped);
  const [tutorialError, setTutorialError] = useState<string | null>(null);
  function setTutorialSkipped(next: boolean): boolean {
    if (scopeKey) {
      const result = projectActions.setLearnSkipped(scopeKey, next);
      if (!result.ok) {
        setTutorialError(result.message);
        return false;
      }
    }
    setSkipped(next);
    setTutorialError(null);
    return true;
  }

  // Skipping disables guidance without changing objective completion. Progress still
  // follows the graph, just as it does while Challenge mode is open.
  const engine = useLessonEngine(
    lesson,
    nodes,
    edges,
    enabled && !skipped,
  );

  const freePlay = enabled && (skipped || engine.freePlay);

  // Run Design is available after completing or skipping the tutorial.
  //
  // This gets its own run session, separate from Challenge, so a Challenge
  // submission/result can never accidentally appear inside Learn mode.
  const runs = useRunSession({
    scopeKey,
    enabled: freePlay,
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
    restartLesson: engine.reset,
    clearAnalysis,
    skipped,
    tutorialError,
    // Persist the return to guidance before the workspace replaces the graph.
    prepareReset: () => !skipped || setTutorialSkipped(false),
  };
}
