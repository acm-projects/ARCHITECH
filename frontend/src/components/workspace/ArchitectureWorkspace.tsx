"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import {
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
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
import {
  addNode as addNodeToGraph,
  removeSelected,
} from "../../lib/architecture/nodeOperations";
import { applyReset, planReset } from "../../lib/architecture/reset";
import { clearSelection, getSelection } from "../../lib/architecture/selection";
import ChallengeCard from "../challenge/ChallengeCard";
import ChallengeIntroduction from "../challenge/ChallengeIntroduction";
import LearnCard from "../learn/LearnCard";
import { projectActions } from "../projects/projectActions";
import type { Project, ProjectMode } from "../projects/projectStore";
import ComponentToolbox from "./toolbox/ComponentToolbox";
import {
  hasComponentDragData,
  readComponentDragData,
} from "./componentCatalog";
import { ArchieContext } from "./ArchieContext";
import { DesignTrafficContext } from "./DesignTrafficContext";
import { InspectorContext } from "./InspectorContext";
import { useWorkspaceInspector } from "./useWorkspaceInspector";
import WorkspaceInspector from "./WorkspaceInspector";
import ArchitectPanel, { ArchitectToggle } from "./ai/ArchitectPanel";
import { useChallengeMode } from "./useChallengeMode";
import { useGraphClipboard } from "./useGraphClipboard";
import { useGraphHistory } from "./useGraphHistory";
import { useLearnMode } from "./useLearnMode";
import { useLiveMetrics } from "./useLiveMetrics";
import { useProjectAutosave } from "./useProjectAutosave";
import { useWorkspaceKeyboard } from "./useWorkspaceKeyboard";
import WorkspaceHeader from "./WorkspaceHeader";
import { RunControl } from "./StressTestPanel";
import ArchitectureNode, {
  type ArchitectureFlowNode,
  type ArchitectureNodeData,
} from "./nodes/ArchitectureNode";

// Keep this outside the component so React Flow gets the same node type reference
// instead of creating a new one every time the workspace rerenders.
const nodeTypes = {
  architecture: ArchitectureNode,
};

const FIT_VIEW_OPTIONS = {
  padding: 0.4,
};

// Most edge styling lives in the CSS file. The arrowhead needs to be set here
// because React Flow creates it as part of the edge itself.
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

// Learn and Challenge both reset to an empty architecture so the user builds it themselves.
const emptyGraph = (): {
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
} => ({
  nodes: [],
  edges: [],
});

// This is the main controller for one project's editor.
//
// The actual architecture belongs to the project, so nodes, edges, history,
// autosave, clipboard, and keyboard behavior are shared between Learn and Challenge.
// Each mode only adds its own lesson/evaluation state around that same canvas.
function Workspace({ project }: { project: Project }) {
  // React Flow owns the live node/edge state while this project is open.
  const [nodes, setNodes, onNodesChange] =
    useNodesState<ArchitectureFlowNode>(project.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(project.edges);

  const {
    screenToFlowPosition,
    fitView,
    getNodes,
    getEdges,
  } = useReactFlow<ArchitectureFlowNode, Edge>();

  // Give every new node a unique ID for this editing session.
  // Deleted IDs are not reused, which keeps history and connections predictable.
  const [allocateNodeId] = useState(() =>
    createNodeIdAllocator(project.nodes.map((node) => node.id)),
  );

  const [title, setTitle] = useState(project.title);
  const runSettings = useRef<HTMLDivElement>(null);
  const [runSettingsHeight, setRunSettingsHeight] = useState(0);
  const openRunSettings = () => runSettings.current?.showPopover();
  // Clear node/edge selection without changing the architecture itself.
  const clearCanvasSelection = useCallback(() => {
    const next = clearSelection({
      nodes,
      edges,
    });

    if (next.nodes === nodes && next.edges === edges) {
      return false;
    }

    setNodes(next.nodes);
    setEdges(next.edges);

    return true;
  }, [nodes, edges, setNodes, setEdges]);

  const inspector = useWorkspaceInspector({
    hasSelection: nodes.some((node) => node.selected),
    onClearSelection: clearCanvasSelection,
  });
  const { archieOpen: aiOpen, askArchie, reset: resetInspector } = inspector;

  // Autosave watches the real project content and saves changes in the background.
  // Ctrl+S uses saveNow to force any pending save immediately.
  //
  // BACKEND: useProjectAutosave is one of the places that will eventually send
  // project updates through the backend project API instead of browser storage.
  const { status: saveStatus, flush: saveNow } = useProjectAutosave(
    project.id,
    title,
    nodes,
    edges,
  );

  // The mode is saved on the project, so reopening it brings the user back
  // to whichever mode they were using last.
  const [mode, setMode] = useState<ProjectMode>(project.mode);
  const [modeError, setModeError] = useState<string | null>(null);

  const switchMode = useCallback(
    (next: ProjectMode) => {
      // Switch the UI right away, then persist that choice on the project.
      setMode(next);
      resetInspector();

      const result = projectActions.setMode(project.id, next);
      setModeError(result.ok ? null : result.message);
    },
    [project.id, resetInspector],
  );

  // Learn and Challenge each manage their own mode-specific state,
  // but both receive the same live architecture from this project.
  const learn = useLearnMode({
    enabled: mode === "learn",
    scopeKey: project.id,
    initiallySkipped: project.learnSkipped,
    nodes,
    edges,
  });

  const challenge = useChallengeMode({
    enabled: mode === "challenge",
    scopeKey: project.id,
    nodes,
    edges,
  });

  const { reportConnection } = learn.engine;

  // Learn gets the normal Run Design tools after the guided tutorial is finished.
  // Challenge has its own Submit flow instead.
  const activeRuns = mode === "learn" ? learn.runs : challenge.runs;
  const canRunDesign = mode === "learn" && learn.exploring;
  const showInspector = mode === "challenge" || learn.exploring;
  // Live metrics wherever Run Design is available: re-evaluated shortly after each edit.
  const live = useLiveMetrics({ nodes, edges, traffic: activeRuns.traffic, enabled: canRunDesign });

  // Check a connection before React Flow lets the user create it.
  // We read the current graph directly from React Flow so this never validates
  // against an older copy of the nodes or edges.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      validateConnection(
        {
          nodes: getNodes(),
          edges: getEdges(),
        },
        connection,
        mode,
      ).ok,
    [getNodes, getEdges, mode],
  );

  // Add a connection only after it passes our graph rules.
  // Learn also gets told about the attempt so it can react during the lesson.
  const handleConnect = useCallback(
    (connection: Connection) => {
      const result = addConnection(
        {
          nodes: getNodes(),
          edges: getEdges(),
        },
        connection,
        mode,
      );

      if (!result.ok) return;

      setEdges(result.edges);

      // Learn uses this to react to what the student connected during the tutorial.
      reportConnection(connection);
    },
    [getNodes, getEdges, mode, setEdges, reportConnection],
  );

  // This is the one place new canvas nodes are created.
  // `center` is where the middle of the node should land, not its top-left corner.
  const addNode = useCallback(
    (
      component: ArchitectureNodeData,
      center: { x: number; y: number },
    ) => {
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

  // Delete whatever is currently selected.
  // Removing a node also removes connections attached to that node.
  const deleteSelection = useCallback(() => {
    if (getSelection(nodes, edges).kind === "none") {
      return false;
    }

    const next = removeSelected({
      nodes,
      edges,
    });

    setNodes(next.nodes);
    setEdges(next.edges);

    return true;
  }, [nodes, edges, setNodes, setEdges]);

  // Keep undo/redo history for the project's architecture.
  // The scope key makes sure history from one project can never leak into another.
  const { undo, redo, replaceGraph } = useGraphHistory({
    scopeKey: project.id,
    nodes,
    edges,
    setNodes,
    setEdges,
  });

  // Reset is treated as one real history action, so the whole reset can be undone once.
  // It also clears old analysis/results so we never show feedback for a design that is gone.
  const handleReset = useCallback(() => {
    const plan = planReset(
      mode,
      { nodes, edges },
      emptyGraph(),
    );

    if (
      plan.needsConfirmation &&
      !window.confirm(
        "Reset to the starter architecture? Your current design will be replaced. You can undo this until you leave the page.",
      )
    ) {
      return;
    }

    // Save the return to guidance before resetting the canvas; failed storage leaves it intact.
    if (mode === "learn" && !learn.prepareReset()) return;
    resetInspector();

    applyReset(mode, plan, {
      replaceGraph: () => {
        replaceGraph(emptyGraph());

        // Wait until React Flow renders the reset graph before adjusting the viewport.
        requestAnimationFrame(() => {
          fitView(FIT_VIEW_OPTIONS);
        });
      },

      clearSelection: () => {
        void clearCanvasSelection();
      },

      // Learn clears old Run Design analysis; Challenge clears its previous submission.
      clearAnalysis:
        mode === "learn"
          ? learn.clearAnalysis
          : challenge.clearSubmission,

      // Resetting Learn starts the tutorial over.
      restartLesson: learn.restartLesson,

      // Resetting Challenge takes the user back to the challenge brief.
      showBrief: challenge.backToBrief,
    });
  }, [
    mode,
    nodes,
    edges,
    replaceGraph,
    fitView,
    clearCanvasSelection,
    learn,
    challenge,
    resetInspector,
  ]);

  // Copy/paste/duplicate work on the graph itself and use the same ID allocator
  // so pasted nodes can never collide with existing ones.
  const { copy, paste, duplicate } = useGraphClipboard({
    nodes,
    edges,
    setNodes,
    setEdges,
    allocate: allocateNodeId,
  });

  // Keep all workspace shortcuts in one hook instead of spreading keyboard
  // listeners throughout the editor.
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

  // Only allow the browser's drag/drop behavior when the thing being dragged
  // actually came from our component toolbox.
  const handleDragOver = useCallback((event: DragEvent) => {
    if (!hasComponentDragData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  // Convert the mouse position on the screen into React Flow coordinates,
  // then create the dropped component centered under the pointer.
  const handleDrop = useCallback(
    (event: DragEvent) => {
      const component = readComponentDragData(event.dataTransfer);

      if (!component) {
        return;
      }

      event.preventDefault();

      addNode(
        component,
        screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
      );
    },
    [screenToFlowPosition, addNode],
  );

  // Archie is intentionally unavailable while Learn is still teaching the answer.
  // In Learn it unlocks after the tutorial; in Challenge it unlocks after submission.
  const archie =
    mode === "learn"
      ? learn.exploring
        ? learn.runs.archie
        : null
      : challenge.view?.hasResult
        ? challenge.runs.archie
        : null;

  return (
    <ArchieContext.Provider value={archie}>
      <DesignTrafficContext.Provider value={activeRuns.traffic}>
      <div className="ax-workspace flex h-screen flex-col overflow-hidden">
        <ChallengeIntroduction
          key={`${project.id}:${challenge.challenge.id}`}
          enabled={mode === "challenge"}
          projectId={project.id}
          challengeId={challenge.challenge.id}
          title={challenge.challenge.title}
        />
        {/* The header owns project-level controls like title, mode, reset, Run Design,
            and save status. It does not own the graph itself. */}
        <WorkspaceHeader
          title={title}
          onTitleChange={setTitle}
          onReset={handleReset}
          mode={mode}
          onModeChange={switchMode}
          modeStatus={
            mode === "learn"
              ? learn.freePlay
                ? learn.skipped ? "Free play" : "Tutorial complete"
                : undefined
              : challenge.challenge.title
          }
          runControl={canRunDesign ? (
            <RunControl
              popoverRef={runSettings}
              onHeightChange={setRunSettingsHeight}
              traffic={activeRuns.traffic}
              running={activeRuns.view.isRunning}
              onRateChange={activeRuns.setRequestRate}
              onRun={() => inspector.showResults(activeRuns.run)}
              onRunAtRate={(rate) => inspector.showResults(() => activeRuns.runAtRate(rate))}
            />
          ) : undefined}
          saveStatus={saveStatus}
        />

        <div className="relative flex min-h-0 flex-1 flex-row bg-(--ax-canvas)">
          {/* Components are dragged from here onto the shared project canvas. */}
          <ComponentToolbox customTechnologies={project.customTechnologies} />

          <main className="ax-workspace-canvas relative min-h-0 min-w-0 flex-1 bg-(--ax-canvas)" data-inspector={showInspector}>
            {/* React Flow is only responsible for displaying/interacting with the graph.
                The actual project rules live in the helpers/hooks above. */}
            <div className="ax-diagram-viewport">
              <InspectorContext.Provider value={showInspector ? inspector.nodeActions : null}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={handleConnect}
                  isValidConnection={isValidConnection}
                  // Delete and Backspace are handled by useWorkspaceKeyboard so all
                  // keyboard behavior goes through the same history-aware path.
                  deleteKeyCode={null}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  defaultEdgeOptions={defaultEdgeOptions}
                  fitView
                  fitViewOptions={FIT_VIEW_OPTIONS}
                  // Figma-style navigation. Click-dragging empty canvas (on a touchpad: hold with one
                  // finger, drag with another) draws a selection box that picks every component it
                  // touches; the AI Architect then explains that part. Pan with a two-finger swipe,
                  // the mouse wheel, Space+drag, or a middle/right-button drag. Zoom with a pinch or
                  // Ctrl/Cmd+scroll. Dragging a component still moves it.
                  selectionOnDrag
                  selectionMode={SelectionMode.Partial}
                  panOnDrag={[1, 2]}
                  panOnScroll
                >
                  <Controls showInteractive={false} />
                </ReactFlow>
              </InspectorContext.Provider>
            </div>

            {/* If saving the selected mode fails, show the error without breaking the editor. */}
            {modeError && (
              <p
                role="alert"
                className="ax-card-label absolute bottom-4 left-4 z-10"
              >
                {modeError}
              </p>
            )}

            {showInspector ? (
              <WorkspaceInspector
                nodes={nodes}
                controller={inspector}
                runSettingsHeight={runSettingsHeight}
                onConfigureRun={openRunSettings}
                onClearSelection={clearCanvasSelection}
                onApply={replaceGraph}
                customTechnologies={project.customTechnologies}
                testingEnabled={canRunDesign}
                runs={activeRuns}
                live={live}
                guidance={mode === "challenge" ? (
                  <ChallengeCard
                    challenge={challenge.challenge}
                    result={challenge.cardResult}
                    onRun={challenge.submit}
                    onBack={challenge.backToBrief}
                    stale={challenge.view?.isStale}
                    running={challenge.view?.isRunning}
                    error={challenge.view?.error}
                  />
                ) : null}
              />
            ) : (
              <aside className="ax-canvas-panel" data-side="right" aria-label="Guidance">
                <div className="ax-panel-content" hidden={aiOpen}>
                  <LearnCard
                    lesson={learn.lesson}
                    stepIndex={learn.engine.stepIndex}
                    status={learn.engine.status}
                    freePlay={learn.freePlay}
                    skipped={learn.skipped}
                    onContinue={learn.freePlay ? learn.continueExploring : learn.engine.continueStep}
                    error={learn.tutorialError}
                    feedback={learn.engine.feedback}
                    hint={learn.engine.hintVisible ? learn.engine.hint?.text : null}
                    onDismissFeedback={learn.engine.dismissFeedback}
                  />
                  <ArchitectToggle open={aiOpen} onToggle={askArchie} />
                </div>
                {aiOpen && (
                  <div className="ax-panel-content" data-architect>
                    <ArchitectPanel
                      onClose={inspector.closeArchie}
                      onApply={replaceGraph}
                      customTechnologies={project.customTechnologies}
                    />
                  </div>
                )}
              </aside>
            )}
          </main>
        </div>
      </div>
      </DesignTrafficContext.Provider>
    </ArchieContext.Provider>
  );
}

// A canvas only exists inside a saved project; there is no separate scratch workspace.
// ReactFlowProvider gives the editor access to React Flow helpers like fitView/getNodes.
export default function ArchitectureWorkspace({
  project,
}: {
  project: Project;
}) {
  return (
    <ReactFlowProvider>
      {/* Starting a different project creates a fresh Workspace, so graph/history/
          lesson/submission state from the previous project cannot carry over. */}
      <Workspace key={project.id} project={project} />
    </ReactFlowProvider>
  );
}
