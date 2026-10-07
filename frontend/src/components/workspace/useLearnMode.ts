import type { Edge } from "@xyflow/react";

import { firstWebSystemLesson, type Lesson } from "../learn/lessons";
import { useLessonEngine } from "../learn/useLessonEngine";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { useRunSession } from "./useRunSession";

// Learn mode of a project: a guided lesson, then free play on the same canvas.
//
//   guided     the lesson watches the design and advances by itself. No Run Design.
//   free-play  every step has held, so the lesson steps aside. The design is the learner's, and
//              Run Design, the system review, the stress test and Archie are available.
//
// Nothing here is Challenge's: a challenge brief, submission or score never shows in Learn.
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
  const engine = useLessonEngine(lesson, nodes, edges, enabled);
  const { freePlay, reset: restartLesson } = engine;

  // Run Design belongs to free play: it is the same evaluation as everywhere else, in a session
  // of its own, so nothing from a Challenge submission can appear here.
  const runs = useRunSession({
    scopeKey,
    enabled: enabled && freePlay,
    nodes,
    edges,
  });
  const { reset: clearAnalysis } = runs;

  return { lesson, engine, freePlay, runs, restartLesson, clearAnalysis };
}
