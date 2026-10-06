"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./architecture-workspace.css";

import ChallengeCard from "../challenge/ChallengeCard";
import { urlShortenerChallenge } from "../challenge/challenges";
import {
  evaluateUrlShortener,
  type Evaluation,
} from "../challenge/evaluation/urlShortener";
import LearnCard from "../learn/LearnCard";
import { firstWebSystemLesson } from "../learn/lessons";
import { useLessonEngine } from "../learn/useLessonEngine";
import { STARTER_EDGES, STARTER_NODES } from "../projects/starterArchitecture";
import type { Project } from "../projects/projectStore";
import ComponentToolbox from "./ComponentToolbox";
import {
  hasComponentDragData,
  readComponentDragData,
} from "./componentCatalog";
import { useProjectAutosave } from "./useProjectAutosave";
import WorkspaceHeader from "./WorkspaceHeader";
import ArchitectureNode, {
  type ArchitectureFlowNode,
  type ArchitectureNodeData,
} from "./nodes/ArchitectureNode";

// Defined outside the component so React Flow gets a stable reference.
const nodeTypes = { architecture: ArchitectureNode };

const FIT_VIEW_OPTIONS = { padding: 0.4 };

// Edge line colors come from React Flow CSS variables in architecture-workspace.css
// so a selected edge can switch color. The arrowhead color is set here.
const defaultEdgeOptions = {
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#b4b4af",
    width: 6,
    height: 6,
  },
};

const NODE_WIDTH = 82;
const NODE_HEIGHT = 27;

export type WorkspaceMode = "workspace" | "learn" | "challenge";

// Learn and challenge modes start (and reset) to an empty canvas so the user builds the system.
const STARTING_STATE: Record<
  WorkspaceMode,
  { nodes: ArchitectureFlowNode[]; edges: Edge[] }
> = {
  workspace: { nodes: [...STARTER_NODES], edges: [...STARTER_EDGES] },
  learn: { nodes: [], edges: [] },
  challenge: { nodes: [], edges: [] },
};

const lesson = firstWebSystemLesson;
const challenge = urlShortenerChallenge;

function Workspace({ mode, project }: { mode: WorkspaceMode; project?: Project }) {
  const starting = STARTING_STATE[mode];
  // A saved project supplies the initial canvas; otherwise the mode's starting state.
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchitectureFlowNode>(
    project?.nodes ?? starting.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    project?.edges ?? starting.edges,
  );
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [title, setTitle] = useState(project?.title ?? "Untitled Architecture");
  // Saved projects only; scratch, Learn and Challenge sessions are not persisted.
  const saveStatus = useProjectAutosave(project?.id ?? null, title, nodes, edges);
  // Learn mode only: watches nodes and edges and advances the lesson on its own.
  const lessonEngine = useLessonEngine(lesson, nodes, edges, mode === "learn");
  const { reset: resetLesson, reportConnection } = lessonEngine;
  // Challenge mode only: the last "Run design" result. Null shows the brief.
  const [challengeResult, setChallengeResult] = useState<Evaluation | null>(null);
  const addedCount = useRef(0);

  const handleReset = useCallback(() => {
    setNodes(starting.nodes);
    setEdges(starting.edges);
    if (mode === "learn") resetLesson();
    setChallengeResult(null);
    // Wait for the restored nodes to render before fitting the view to them.
    requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
  }, [setNodes, setEdges, fitView, starting, mode, resetLesson]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge(connection, current));
      // Learn mode only: lets the lesson explain a mistaken connection.
      reportConnection(connection);
    },
    [setEdges, reportConnection],
  );

  // The one place nodes are created. `center` is the flow-space point the node is
  // centered on, so drops land under the pointer rather than at the node's corner.
  const addNode = useCallback(
    (component: ArchitectureNodeData, center: { x: number; y: number }) => {
      addedCount.current += 1;
      const newNode: ArchitectureFlowNode = {
        id: `${component.type}-added-${addedCount.current}`,
        type: "architecture",
        position: {
          x: center.x - NODE_WIDTH / 2,
          y: center.y - NODE_HEIGHT / 2,
        },
        data: component,
        selected: true,
      };

      setNodes((current) => [
        ...current.map((node) => ({ ...node, selected: false })),
        newNode,
      ]);
    },
    [setNodes],
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    if (!hasComponentDragData(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      const component = readComponentDragData(event.dataTransfer);
      if (!component) return;
      event.preventDefault();
      addNode(
        component,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [screenToFlowPosition, addNode],
  );

  return (
    <div className="ax-workspace flex h-screen flex-col overflow-hidden">
      <WorkspaceHeader
        title={title}
        onTitleChange={setTitle}
        onReset={handleReset}
        saveStatus={project ? saveStatus : undefined}
        session={
          mode === "learn"
            ? {
                title: lesson.title,
                label: "Learn",
                status: `Step ${lessonEngine.stepIndex + 1} / ${lesson.steps.length}`,
              }
            : mode === "challenge"
              ? { title: challenge.title, label: "Challenge" }
              : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col bg-(--ax-canvas) md:flex-row">
        <ComponentToolbox />

        <main className="relative min-h-0 min-w-0 flex-1 bg-(--ax-canvas)">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#dedeD9"
            />
            <Controls showInteractive={false} />
          </ReactFlow>

          {mode === "challenge" && (
            <div className="absolute right-4 top-4 z-10 max-h-[calc(100%-2rem)] overflow-y-auto">
              <ChallengeCard
                challenge={challenge}
                result={challengeResult}
                // Evaluates the current graph only when asked, so a result is never stale.
                onRun={() =>
                  setChallengeResult(evaluateUrlShortener(nodes, edges))
                }
                onBack={() => setChallengeResult(null)}
              />
            </div>
          )}

          {mode === "learn" && (
            <div className="absolute right-4 top-4 z-10">
              <LearnCard
                lesson={lesson}
                stepIndex={lessonEngine.stepIndex}
                status={lessonEngine.status}
                feedback={lessonEngine.feedback}
                onDismissFeedback={lessonEngine.dismissFeedback}
              />
            </div>
          )}
        </main>

      </div>
    </div>
  );
}

export default function ArchitectureWorkspace({
  mode = "workspace",
  project,
}: {
  mode?: WorkspaceMode;
  // Only for the free workspace: the saved project to open and keep saving.
  project?: Project;
}) {
  return (
    <ReactFlowProvider>
      <Workspace mode={mode} project={project} />
    </ReactFlowProvider>
  );
}
