"use client";

import { useCallback, useState, type DragEvent } from "react";
import {
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

import { addConnection, validateConnection } from "../../lib/architecture/connections";
import { createNodeIdAllocator } from "../../lib/architecture/nodeIds";
import { addNode as addNodeToGraph, removeSelected } from "../../lib/architecture/nodeOperations";
import { applyReset, planReset } from "../../lib/architecture/reset";
import { clearSelection, getSelection } from "../../lib/architecture/selection";
import ChallengeCard from "../challenge/ChallengeCard";
import LearnCard from "../learn/LearnCard";
import { projectActions } from "../projects/projectActions";
import type { Project, ProjectMode } from "../projects/projectStore";
import ComponentToolbox from "./ComponentToolbox";
import {
  hasComponentDragData,
  readComponentDragData,
} from "./componentCatalog";
import { ArchieContext } from "./ArchieContext";
import RunResultsPanel from "./RunResultsPanel";
import StressTestPanel from "./StressTestPanel";
import { useChallengeMode } from "./useChallengeMode";
import { useGraphClipboard } from "./useGraphClipboard";
import { useGraphHistory } from "./useGraphHistory";
import { useLearnMode } from "./useLearnMode";
import { useProjectAutosave } from "./useProjectAutosave";
import { useWorkspaceKeyboard } from "./useWorkspaceKeyboard";
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

// Both modes start (and reset) from an empty canvas, so the learner builds the system.
const emptyGraph = (): { nodes: ArchitectureFlowNode[]; edges: Edge[] } => ({ nodes: [], edges: [] });

// A project: one architecture, worked on in Learn or Challenge mode. The graph, its history,
// autosave, clipboard and keyboard belong to the project and survive a mode switch; what each
// mode adds around the canvas (lesson, run results, brief, submission) lives in its own
// controller (useLearnMode, useChallengeMode) and is only shown in that mode.
function Workspace({ project }: { project: Project }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchitectureFlowNode>(project.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(project.edges);
  const { screenToFlowPosition, fitView, getNodes, getEdges } = useReactFlow<
    ArchitectureFlowNode,
    Edge
  >();

  // Hands out node ids for this editing session. Seeded from the nodes it opens with and
  // remembering what it issued, so an id is not reused even after its node is deleted.
  const [allocateNodeId] = useState(() =>
    createNodeIdAllocator(project.nodes.map((node) => node.id)),
  );

  const [title, setTitle] = useState(project.title);
  const { status: saveStatus, flush: saveNow } = useProjectAutosave(
    project.id,
    title,
    nodes,
    edges,
  );

  // Which mode the project is being worked in. Remembered with the project, so it reopens there.
  const [mode, setMode] = useState<ProjectMode>(project.mode);
  const [modeError, setModeError] = useState<string | null>(null);
  const switchMode = useCallback(
    (next: ProjectMode) => {
      setMode(next);
      const result = projectActions.setMode(project.id, next);
      setModeError(result.ok ? null : result.message);
    },
    [project.id],
  );

  const learn = useLearnMode({ enabled: mode === "learn", scopeKey: project.id, nodes, edges });
  const challenge = useChallengeMode({
    enabled: mode === "challenge",
    scopeKey: project.id,
    nodes,
    edges,
  });
  const { reportConnection } = learn.engine;
  // Run Design belongs to the free-play phase of Learn, and Challenge has its own Submit.
  const activeRuns = mode === "learn" ? learn.runs : challenge.runs;
  const canRunDesign = mode === "learn" && learn.freePlay;

  // Whether a connection may be made (self-connections, repeats and missing nodes are
  // refused in every mode). React Flow uses this while dragging, so refused targets
  // cannot be dropped on. It reads the graph from React Flow's store, never a stale copy.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      validateConnection({ nodes: getNodes(), edges: getEdges() }, connection, mode).ok,
    [getNodes, getEdges, mode],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const result = addConnection({ nodes: getNodes(), edges: getEdges() }, connection, mode);
      if (!result.ok) return;
      setEdges(result.edges);
      // Learn mode only: lets the lesson explain a mistaken connection.
      reportConnection(connection);
    },
    [getNodes, getEdges, mode, setEdges, reportConnection],
  );

  // The one place nodes are created. `center` is the flow-space point the node is
  // centered on, so drops land under the pointer rather than at the node's corner.
  const addNode = useCallback(
    (component: ArchitectureNodeData, center: { x: number; y: number }) => {
      // The id is chosen outside a state updater (the allocator has memory) and checked
      // against every node currently on the canvas, including saved ones.
      const { nodes: next } = addNodeToGraph<ArchitectureFlowNode>(
        getNodes(),
        component.type,
        (id) => ({
          id,
          type: "architecture",
          position: {
            x: center.x - NODE_WIDTH / 2,
            y: center.y - NODE_HEIGHT / 2,
          },
          data: component,
        }),
        allocateNodeId,
      );
      setNodes(next);
    },
    [getNodes, setNodes, allocateNodeId],
  );

  // Keyboard actions work on the nodes and edges themselves, which hold the selection, so
  // a deleted item cannot stay selected. Deleting a node also removes its edges.
  const deleteSelection = useCallback(() => {
    if (getSelection(nodes, edges).kind === "none") return false;
    const next = removeSelected({ nodes, edges });
    setNodes(next.nodes);
    setEdges(next.edges);
    return true;
  }, [nodes, edges, setNodes, setEdges]);

  const clearCanvasSelection = useCallback(() => {
    const next = clearSelection({ nodes, edges });
    if (next.nodes === nodes && next.edges === edges) return false;
    setNodes(next.nodes);
    setEdges(next.edges);
    return true;
  }, [nodes, edges, setNodes, setEdges]);

  // Records every real change to the graph, per project, for undo and redo.
  const { undo, redo, replaceGraph } = useGraphHistory({
    scopeKey: project?.id ?? null,
    nodes,
    edges,
    setNodes,
    setEdges,
  });
  // Reset means "back to this mode's starting state" (see lib/architecture/reset): one history
  // step, no selection, and no analysis of the old design left on screen.
  const handleReset = useCallback(() => {
    const plan = planReset(mode, { nodes, edges }, emptyGraph());
    if (
      plan.needsConfirmation &&
      !window.confirm(
        "Reset to the starter architecture? Your current design will be replaced. You can undo this until you leave the page.",
      )
    ) {
      return;
    }
    applyReset(mode, plan, {
      replaceGraph: () => {
        replaceGraph(emptyGraph());
        // Wait for the restored nodes to render before fitting the view to them.
        requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
      },
      clearSelection: () => void clearCanvasSelection(),
      clearAnalysis: mode === "learn" ? learn.clearAnalysis : challenge.clearSubmission,
      restartLesson: learn.restartLesson,
      showBrief: challenge.backToBrief,
    });
  }, [mode, nodes, edges, replaceGraph, fitView, clearCanvasSelection, learn, challenge]);

  const { copy, paste, duplicate } = useGraphClipboard({
    nodes,
    edges,
    setNodes,
    setEdges,
    allocate: allocateNodeId,
  });

  useWorkspaceKeyboard({
    onDeleteSelection: deleteSelection,
    onClearSelection: clearCanvasSelection,
    onUndo: undo,
    onRedo: redo,
    onCopy: copy,
    onPaste: paste,
    onDuplicate: duplicate,
    onSave: saveNow,
  });

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

  // Archie explains a Learn run once the tutorial is over, and a challenge only after it has
  // been submitted, so it can never hint at the answer beforehand. Never during the guided lesson.
  const archie =
    mode === "learn"
      ? learn.freePlay
        ? learn.runs.archie
        : null
      : challenge.view?.hasResult
        ? challenge.runs.archie
        : null;

  return (
    <ArchieContext.Provider value={archie}>
    <div className="ax-workspace flex h-screen flex-col overflow-hidden">
      <WorkspaceHeader
        title={title}
        onTitleChange={setTitle}
        onReset={handleReset}
        mode={mode}
        onModeChange={switchMode}
        modeStatus={
          mode === "learn"
            ? learn.freePlay
              ? "Tutorial complete"
              : `Step ${learn.engine.stepIndex + 1} / ${learn.lesson.steps.length}`
            : challenge.challenge.title
        }
        onRun={canRunDesign ? learn.runs.run : undefined}
        runState={activeRuns.view.runButtonState}
        saveStatus={saveStatus}
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
            isValidConnection={isValidConnection}
            // Delete and Backspace are handled by useWorkspaceKeyboard.
            deleteKeyCode={null}
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

          {modeError && (
            <p role="alert" className="ax-card-label absolute bottom-4 left-4 z-10">
              {modeError}
            </p>
          )}

          {mode === "challenge" && (
            <div className="absolute right-4 top-4 z-10 max-h-[calc(100%-2rem)] overflow-y-auto">
              <ChallengeCard
                challenge={challenge.challenge}
                result={challenge.cardResult}
                // Submits a copy of the design as it is now.
                onRun={challenge.submit}
                onBack={challenge.backToBrief}
                stale={challenge.view?.isStale}
                running={challenge.view?.isRunning}
                error={challenge.view?.error}
              />
            </div>
          )}

          {mode === "learn" && (
            <div className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto">
              <LearnCard
                lesson={learn.lesson}
                stepIndex={learn.engine.stepIndex}
                status={learn.engine.status}
                freePlay={learn.freePlay}
                feedback={learn.engine.feedback}
                hint={learn.engine.hintVisible ? learn.engine.hint?.text : null}
                onDismissFeedback={learn.engine.dismissFeedback}
              />
              {learn.freePlay && (
                <>
                  <StressTestPanel
                    traffic={learn.runs.traffic}
                    running={learn.runs.view.isRunning}
                    onRateChange={learn.runs.setRequestRate}
                    onRun={learn.runs.run}
                    onRunAtRate={learn.runs.runAtRate}
                  />
                  <RunResultsPanel
                    view={learn.runs.view}
                    onRun={learn.runs.run}
                    liveTraffic={learn.runs.traffic}
                  />
                </>
              )}
            </div>
          )}
        </main>

      </div>
    </div>
    </ArchieContext.Provider>
  );
}

// Opens one saved project. A project is the only place the canvas exists: there is no
// standalone workspace.
export default function ArchitectureWorkspace({ project }: { project: Project }) {
  return (
    <ReactFlowProvider>
      {/* Keyed by project, so one project's graph, history, lesson or submission can never carry over to another. */}
      <Workspace key={project.id} project={project} />
    </ReactFlowProvider>
  );
}
