"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Gauge, ShieldCheck } from "lucide-react";
import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  SelectionMode,
  ViewportPortal,
  type Connection,
  type FinalConnectionState,
  type Edge,
  type NodeChange,
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
import { ARCHITECTURE_NODE_SIZE, spreadOverlappingNodes } from "../../lib/architecture/nodeLayout";
import { snapNode, type SnapGuide } from "../../lib/architecture/nodeSnap";
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
import { ArchieContext, ArchieEnabledContext } from "./ArchieContext";
import { DesignTrafficContext } from "./DesignTrafficContext";
import { InspectorContext } from "./InspectorContext";
import { useWorkspaceInspector } from "./useWorkspaceInspector";
import WorkspaceInspector, { SimulationControl } from "./WorkspaceInspector";
import { ArchitectToggle } from "./ai/ArchitectPanel";
import { ArchiePortrait } from "./ai/ArchiePanel";
import { ExportButton, RunnableAppButton } from "./ExportButton";
import HistoryPanel, { HistoryToggle } from "./history/HistoryPanel";
import { useChallengeMode } from "./useChallengeMode";
import { useGraphClipboard } from "./useGraphClipboard";
import { useGraphHistory } from "./useGraphHistory";
import { useKeepNodesInView } from "./useKeepNodesInView";
import { useLearnMode } from "./useLearnMode";
import { useLiveMetrics } from "./useLiveMetrics";
import { DesignCheckBadges, DesignCheckPanel, useDesignCheck } from "./DesignCheck";
import { LiveEstimatesPanel } from "./LiveMetricsBar";
import { useProjectAutosave } from "./useProjectAutosave";
import { useWorkspaceKeyboard } from "./useWorkspaceKeyboard";
import WorkspaceHeader from "./WorkspaceHeader";
import OrthogonalEdge, { ConnectionPreview } from "./OrthogonalEdge";
import ArchitectureNode, {
  type ArchitectureFlowNode,
  type ArchitectureNodeData,
} from "./nodes/ArchitectureNode";
// After every component's own styles: this is the shared panel system they all sit in.
import "./workspace-panels.css";

const MIN_ZOOM = 0.25;
// How close a dragged component gets, on screen, before it lines up with another.
const SNAP_REACH_PX = 8;

// Keep this outside the component so React Flow gets the same node type reference
// instead of creating a new one every time the workspace rerenders.
const nodeTypes = {
  architecture: ArchitectureNode,
};

// Components open at the scale of the bottom bar, whether the view is fitted or starts empty.
const WORKSPACE_ZOOM = 1.4;
const DESKTOP_FIT_VIEW_OPTIONS = {
  padding: 0.2,
  maxZoom: WORKSPACE_ZOOM,
};
// The same fit the breakdown uses on small screens, so labels stay readable.
const MOBILE_FIT_VIEW_OPTIONS = {
  padding: 0.15,
  maxZoom: 1.1,
};
const fitViewOptionsForScreen = () =>
  window.matchMedia("(max-width: 900px)").matches ? MOBILE_FIT_VIEW_OPTIONS : DESKTOP_FIT_VIEW_OPTIONS;

// Every edge draws as a right-angle route with its own arrowhead, including saved edges
// without a type ("default") and those saved as "orthogonal".
const edgeTypes = {
  default: OrthogonalEdge,
  orthogonal: OrthogonalEdge,
};

// A refused connection explains itself for this long, then clears.
const CONNECTION_NOTICE_MS = 4000;

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
  // Spread once here rather than in the store: the saved layout only changes with the
  // user's next edit, so opening a project does not count as editing it.
  const [initialNodes] = useState(() => spreadOverlappingNodes(project.nodes));
  const [fitViewOptions] = useState(fitViewOptionsForScreen);
  useKeepNodesInView(MIN_ZOOM);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<ArchitectureFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(project.edges);

  const {
    screenToFlowPosition,
    fitView,
    getNodes,
    getEdges,
    getZoom,
  } = useReactFlow<ArchitectureFlowNode, Edge>();

  // One component dragged alone lines up with the others; a group keeps its own arrangement.
  const [snapGuides, setSnapGuides] = useState<readonly SnapGuide[]>([]);
  // React Flow tracks the drag from the pointer, and its last event carries that raw position.
  const lastSnap = useRef<{ id: string; x: number; y: number } | null>(null);
  const handleNodesChange = useCallback((changes: NodeChange<ArchitectureFlowNode>[]) => {
    const moves = changes.filter((change) => change.type === "position");
    const move = moves.length === 1 ? moves[0] : undefined;
    const moving = move?.dragging && move.position ? getNodes().find((node) => node.id === move.id) : undefined;
    if (!move?.position || !moving) {
      const landed = lastSnap.current;
      lastSnap.current = null;
      if (moves.length > 0) setSnapGuides((guides) => (guides.length > 0 ? [] : guides));
      const land = move?.position && move.id === landed?.id ? { ...move, position: { x: landed.x, y: landed.y } } : undefined;
      onNodesChange(land ? changes.map((change) => (change === move ? land : change)) : changes);
      return;
    }
    const boxOf = (node: ArchitectureFlowNode) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? ARCHITECTURE_NODE_SIZE.width,
      height: node.measured?.height ?? ARCHITECTURE_NODE_SIZE.height,
    });
    const connected = new Set(getEdges().flatMap((edge) =>
      edge.source === move.id ? [edge.target] : edge.target === move.id ? [edge.source] : []));
    const snapped = snapNode(
      { ...boxOf(moving), ...move.position },
      getNodes().filter((node) => node.id !== move.id).map((node) => ({ box: boxOf(node), connected: connected.has(node.id) })),
      SNAP_REACH_PX / getZoom(),
    );
    lastSnap.current = { id: move.id, x: snapped.x, y: snapped.y };
    setSnapGuides(snapped.guides);
    onNodesChange(changes.map((change) => (change === move ? { ...move, position: { x: snapped.x, y: snapped.y } } : change)));
  }, [getNodes, getEdges, getZoom, onNodesChange]);

  // Give every new node a unique ID for this editing session.
  // Deleted IDs are not reused, which keeps history and connections predictable.
  const [allocateNodeId] = useState(() =>
    createNodeIdAllocator(project.nodes.map((node) => node.id)),
  );

  const [title, setTitle] = useState(project.title);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!connectionNotice) return;
    const timer = window.setTimeout(() => setConnectionNotice(null), CONNECTION_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [connectionNotice]);
  const [learnPanelOffset, setLearnPanelOffset] = useState(0);
  const [learnPanelCollapsed, setLearnPanelCollapsed] = useState(false);
  const learnPanelStyle = { "--ax-learn-offset": `${learnPanelOffset}px` } as CSSProperties;
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
    selectedNodeIds: nodes.filter((node) => node.selected).map((node) => node.id),
  });
  const { askArchie, reset: resetInspector } = inspector;

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
      setLearnPanelCollapsed(false);
      setLearnPanelOffset(0);
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
  const archieEnabled = mode !== "learn" || learn.exploring;
  const showInspector = mode === "challenge" || learn.exploring;
  // Live metrics wherever Run Design is available: re-evaluated shortly after each edit.
  const live = useLiveMetrics({ nodes, edges, traffic: activeRuns.traffic, enabled: canRunDesign });
  // Problems marked on the canvas, with one-click fixes and where the uptime comes from.
  const designCheck = useDesignCheck();
  const liveReady = Boolean(live.result?.summary.ready);
  const findingCount = liveReady ? (live.result?.evaluation.findings.length ?? 0) : 0;
  const [liveOpen, setLiveOpen] = useState(false);
  // Where Simulation renders from the header, so it joins the other right panels.
  const [simulationHost, setSimulationHost] = useState<HTMLDivElement | null>(null);
  const closeDesignCheck = () => {
    designCheck.setOpen(false);
    designCheck.setFocus(null);
  };

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

      if (!result.ok) {
        setConnectionNotice(result.message);
        return;
      }

      setConnectionNotice(null);
      setEdges(result.edges);

      // Learn uses this to react to what the student connected during the tutorial.
      reportConnection(connection);
    },
    [getNodes, getEdges, mode, setEdges, reportConnection],
  );

  // React Flow skips onConnect when the drop target fails isValidConnection, so explain the
  // refusal here: the same rule that blocked the drop supplies the message.
  const handleConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid === true || !state.fromNode || !state.toNode) return;
      // A drag can start from an input handle; the connection still runs into it.
      const reversed = state.fromHandle?.type === "target";
      const [source, target] = reversed ? [state.toNode, state.fromNode] : [state.fromNode, state.toNode];
      const [sourceHandle, targetHandle] = reversed ? [state.toHandle, state.fromHandle] : [state.fromHandle, state.toHandle];
      const verdict = validateConnection(
        { nodes: getNodes(), edges: getEdges() },
        {
          source: source.id,
          target: target.id,
          sourceHandle: sourceHandle?.id ?? null,
          targetHandle: targetHandle?.id ?? null,
        },
        mode,
      );
      if (!verdict.ok) setConnectionNotice(verdict.message);
    },
    [getNodes, getEdges, mode],
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
            x: center.x - ARCHITECTURE_NODE_SIZE.width / 2,
            y: center.y - ARCHITECTURE_NODE_SIZE.height / 2,
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
          fitView(fitViewOptions);
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
    fitViewOptions,
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
    <ArchieEnabledContext.Provider value={archieEnabled}>
    <ArchieContext.Provider value={archie}>
      <DesignTrafficContext.Provider value={activeRuns.traffic}>
      <div className="ax-workspace flex h-screen flex-col overflow-hidden">
        {!showInspector && learnPanelCollapsed && !inspector.historyOpen && <button
          type="button" className="ax-archie-launcher" aria-label="Expand lesson guidance"
          title="Expand lesson guidance" aria-expanded={false}
          onClick={() => setLearnPanelCollapsed(false)}><ArchiePortrait /></button>}

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
          saveStatus={saveStatus}
          runControl={canRunDesign && <SimulationControl
            panelHost={simulationHost}
            runs={activeRuns}
            componentName={(id) => nodes.find((node) => node.id === id)?.data.label ?? id}
            onShowResults={inspector.showResults}
            expanded={inspector.section === "run"}
            onToggle={() => inspector.toggleSection("run")}
          />}
          projectActions={(menuId) => (
            <div hidden={!showInspector}>
              <HistoryToggle open={false} onToggle={inspector.openHistory} popoverTarget={menuId} />
              <ExportButton title={title} popoverTarget={menuId} />
              <RunnableAppButton projectId={project.id} popoverTarget={menuId} />
            </div>
          )}
        />

        <div className="relative flex min-h-0 flex-1 flex-row bg-(--ax-canvas)">
          {/* Components are dragged from here onto the shared project canvas. */}
          <ComponentToolbox customTechnologies={project.customTechnologies}
            tools={[
              ...(showInspector ? [{
                key: "archie",
                label: "Ask Archie",
                icon: <ArchiePortrait />,
                open: inspector.archieOpen,
                onToggle: inspector.archieOpen ? inspector.closeArchie : inspector.askArchie,
              }] : []),
              ...(canRunDesign ? [{
                key: "live",
                label: "Live estimates",
                icon: <Gauge size={16} aria-hidden="true" />,
                open: liveOpen,
                onToggle: () => setLiveOpen((open) => !open),
              }, {
                key: "check",
                label: "Design check",
                icon: <ShieldCheck size={16} aria-hidden="true" />,
                badge: designCheck.enabled && liveReady ? String(findingCount) : undefined,
                open: designCheck.enabled && designCheck.open,
                disabled: !liveReady,
                title: "Connect a client to check the design.",
                onToggle: () => {
                  if (designCheck.enabled && designCheck.open) {
                    closeDesignCheck();
                    return;
                  }
                  if (!designCheck.enabled) designCheck.setEnabled(true);
                  designCheck.setOpen(true);
                },
              }] : []),
            ]} />

          <main className="ax-workspace-canvas relative min-h-0 min-w-0 flex-1 bg-(--ax-canvas)" data-inspector={showInspector}>
            {/* React Flow is only responsible for displaying/interacting with the graph.
                The actual project rules live in the helpers/hooks above. */}
            <div className="ax-diagram-viewport">
              <InspectorContext.Provider value={showInspector ? inspector.nodeActions : null}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={handleConnect}
                  onConnectEnd={handleConnectEnd}
                  isValidConnection={isValidConnection}
                  connectionLineComponent={ConnectionPreview}
                  // Delete and Backspace are handled by useWorkspaceKeyboard so all
                  // keyboard behavior goes through the same history-aware path.
                  deleteKeyCode={null}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  fitView
                  fitViewOptions={fitViewOptions}
                  defaultViewport={{ x: 0, y: 0, zoom: WORKSPACE_ZOOM }}
                  minZoom={MIN_ZOOM}
                  maxZoom={2}
                  // Drag empty canvas to pan; dragging a component still moves it.
                  // Shift+drag draws a selection box that picks every component it touches.
                  panOnDrag
                  panOnScroll
                  selectionMode={SelectionMode.Partial}
                  elevateEdgesOnSelect
                >
                  <Controls showInteractive={false} fitViewOptions={fitViewOptions} />
                  {canRunDesign && <DesignCheckBadges result={live.result} nodes={nodes} check={designCheck} />}
                  <ViewportPortal>
                    {snapGuides.map((guide) => (
                      <div key={guide.axis} className="ax-snap-guide" data-axis={guide.axis} aria-hidden="true" style={guide.axis === "x"
                        ? { transform: `translate(${guide.at}px, ${guide.from}px)`, height: guide.to - guide.from }
                        : { transform: `translate(${guide.from}px, ${guide.at}px)`, width: guide.to - guide.from }} />
                    ))}
                  </ViewportPortal>
                </ReactFlow>
              </InspectorContext.Provider>
            </div>

            {/* Keep floating tools below the header while the graph extends behind it. */}
            <div className="ax-canvas-overlays">
              <div className="ax-canvas-notices">
                {connectionNotice && <p role="status" className="ax-canvas-notice">{connectionNotice}</p>}
                {/* If saving the selected mode fails, show the error without breaking the editor. */}
                {modeError && <p role="alert" className="ax-canvas-notice">{modeError}</p>}
              </div>

              {/* Every right panel stacks here, so opening one never hides another. */}
              <div className="ax-widget-stack">
                {/* Simulation always heads the column. */}
                <div ref={setSimulationHost} className="contents" />
                {canRunDesign && liveOpen && (
                  <LiveEstimatesPanel
                    result={live.result}
                    changes={live.changes}
                    requestsPerSecond={activeRuns.traffic.requestsPerSecond}
                    componentName={(id) => nodes.find((node) => node.id === id)?.data.label ?? id}
                    onClose={() => setLiveOpen(false)}
                  />
                )}
                {canRunDesign && liveReady && designCheck.enabled && designCheck.open && (
                  <DesignCheckPanel
                    result={live.result}
                    nodes={nodes}
                    edges={edges}
                    traffic={activeRuns.traffic}
                    check={designCheck}
                    onApply={replaceGraph}
                    onUndo={undo}
                  />
                )}
                {showInspector && (
                  <WorkspaceInspector
                    projectId={project.id}
                    nodes={nodes}
                    controller={inspector}
                    onClearSelection={clearCanvasSelection}
                    onApply={replaceGraph}
                    customTechnologies={project.customTechnologies}
                    guidance={mode === "challenge" ? (
                      <ChallengeCard
                        challenge={challenge.challenge}
                        result={challenge.cardResult}
                        onRun={challenge.submit}
                        onBack={challenge.backToBrief}
                        stale={challenge.view?.isStale}
                        running={challenge.view?.isRunning}
                        error={challenge.view?.error}
                        official={challenge.official}
                        leaderboardVersion={challenge.leaderboardVersion}
                      />
                    ) : null}
                  />
                )}
              </div>

              {!showInspector && (
                <aside
                  className="ax-canvas-panel"
                  data-side="right"
                  data-learn-movable={!inspector.historyOpen || undefined}
                  data-learn-collapsed={learnPanelCollapsed && !inspector.historyOpen || undefined}
                  style={!inspector.historyOpen ? learnPanelStyle : undefined}
                  aria-label="Guidance"
                >
                  <div className="ax-panel-content" data-architect={inspector.historyOpen || undefined}>
                    {inspector.historyOpen ? (
                      <HistoryPanel projectId={project.id} onClose={inspector.closeHistory} onRestore={replaceGraph} />
                    ) : (
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
                      verticalOffset={learnPanelOffset}
                      onVerticalOffsetChange={setLearnPanelOffset}
                      onCollapse={() => setLearnPanelCollapsed(true)}
                    />
                    )}
                    {/* Keep Archie mounted, but out of the guided tutorial. */}
                    <div hidden>
                      <ArchitectToggle open={false} onToggle={askArchie} />
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </main>
        </div>
      </div>
      </DesignTrafficContext.Provider>
    </ArchieContext.Provider>
    </ArchieEnabledContext.Provider>
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
