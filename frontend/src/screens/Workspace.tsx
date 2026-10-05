import { useEffect, useMemo, useState } from "react";

import { Button, Icon } from "../components/ui";
import {
  getProject,
  markProjectSaved,
  renameProject,
  updateProject,
  updateProjectState,
} from "../lib/projects";
import { useTheme } from "../hooks/useTheme";
import {
  readBooleanStorage,
  STORAGE_KEYS,
  writeBooleanStorage,
  writeStorage,
} from "../lib/storage";
import type { ExperienceLevel, Mode } from "../types";
import { createSharedProjectHash } from "../lib/share";
import { downloadDiagram } from "../utils/exportDiagram";
import {
  BASE_NODE_POINTS,
  CORE_CONNECTIONS,
  CORE_NODE_IDS,
  calculateSimulation,
  getAddedNodeBasePoint,
  getBottleneckFeedback,
  getBottleneckLabel,
  getNodeIdForLabel,
  getNodeNames,
  type AddedComponent,
  type Connection,
  type NodeOffset,
} from "./workspace/workspaceModel";
import { AiArchitect } from "./workspace/AiArchitect";
import {
  getConnectionLabel,
  getDefaultInputPort,
  getDefaultNodeProperties,
  getDefaultOutputPort,
  getPortDefinition,
  validatePortConnection,
  type NodePropertyValues,
} from "./workspace/workspaceData";
import { ArchitectureInspector } from "./workspace/ArchitectureInspector";
import {
  analyzeArchitecture,
  type ArchitectureFinding,
} from "./workspace/architectureAnalysis";
import { useCanvasViewport } from "./workspace/useCanvasViewport";
import { useDiagramHistory, type DiagramSnapshot } from "./workspace/useDiagramHistory";
import { useDiagramTabs } from "./workspace/useDiagramTabs";
import { useSimulationInputs } from "./workspace/useSimulationInputs";
import { useStressTest } from "./workspace/useStressTest";
import { useWorkspacePersistence } from "./workspace/useWorkspacePersistence";
import { useWorkspaceShortcuts } from "./workspace/useWorkspaceShortcuts";
import {
  CanvasToolbar,
  DiagramTabs,
  LearnSimulationControls,
  SimulationControls,
  StressTestCard,
  WorkspaceHeader,
} from "./workspace/WorkspaceChrome";
import {
  ComponentPopover,
  ConnectionLayer,
  LiveMetrics,
  NodeLayer,
} from "./workspace/WorkspaceCanvasParts";
import {
  ChallengeResult,
  ChallengeScore,
  ChallengeWelcome,
} from "./workspace/ChallengePanels";
import { evaluateChallenge } from "./workspace/challengeModel";
import { NodeConfigPanel } from "./workspace/NodeConfigPanel";
import {
  ExportModal,
  GuidedBuild,
  HistoryPanel,
  Toolbox,
  TourCard,
} from "./workspace/WorkspacePanels";

interface ClipboardNode {
  name: string;
  properties: NodePropertyValues;
  point: NodeOffset;
}

interface ClipboardConnection {
  fromIndex: number;
  toIndex: number;
  fromPort?: string;
  toPort?: string;
  label?: string;
}

interface DiagramClipboard {
  nodes: ClipboardNode[];
  connections: ClipboardConnection[];
}

function createAddedComponent(name: string): AddedComponent {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return { id: `node-${id}`, name };
}

export function Workspace({
  projectId,
  mode,
  onModeChange,
  home,
  landing,
  level,
}: {
  projectId: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  home: () => void;
  landing: () => void;
  level: ExperienceLevel;
}) {
  const initialProject = getProject(projectId);
  const initialState = initialProject?.state;
  const [projectName, setProjectName] = useState(
    () => initialProject?.name ?? "Untitled project",
  );
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [lastSavedAt, setLastSavedAt] = useState(
    () => initialProject?.updatedAt ?? new Date().toISOString(),
  );
  const [stressFeedback, setStressFeedback] = useState("");
  const [dark, setDark] = useTheme();
  const [aiOpen, setAiOpen] = useState(false);
  const aiEnabled = readBooleanStorage(STORAGE_KEYS.aiEnabled, true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [controls, setControls] = useState(false);
  const [tourStep, setTourStep] = useState(() => level === "Advanced" ? -1 : 0);
  const [, setLearnStep] = useState(0);
  const {
    running,
    stressProgress,
    stressComplete,
    runStage,
    start: startStressTest,
    stop: stopStressTest,
    clearResult: clearStressResult,
  } = useStressTest({ mode, onLearnStepChange: setLearnStep });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState("");
  const [leftOpen, setLeftOpen] = useState(() => initialState?.leftOpen ?? true);
  const [rightOpen, setRightOpen] = useState(() => initialState?.rightOpen ?? true);
  const [viewportInfo, setViewportInfo] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  }));
  const [activeAnalysisFinding, setActiveAnalysisFinding] = useState<string | null>(null);
  const [analysisFocusIds, setAnalysisFocusIds] = useState<string[]>([]);
  const [layer, setLayer] = useState<"frontend" | "backend" | "fullstack">(
    () => initialState?.layer ?? "fullstack",
  );
  const [aiTesting, setAiTesting] = useState(false);
  const {
    addedComponents,
    setAddedComponents,
    nodeOffsets,
    setNodeOffsets,
    deletedNodes,
    setDeletedNodes,
    userConnections,
    setUserConnections,
    nodeProperties,
    setNodeProperties,
  } = useWorkspacePersistence(projectId);
  const {
    zoom,
    pan,
    isPanning,
    selection,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetZoom,
  } = useCanvasViewport(
    {
      zoom: initialState?.zoom,
      pan: initialState?.pan,
    },
    (box, canvas) => {
      const canvasRect = canvas.getBoundingClientRect();
      const bounds = {
        left: canvasRect.left + box.x,
        top: canvasRect.top + box.y,
        right: canvasRect.left + box.x + box.w,
        bottom: canvasRect.top + box.y + box.h,
      };
      const ids = Array.from(
        canvas.querySelectorAll<HTMLElement>("[data-node-id]"),
      )
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.left >= bounds.left &&
            rect.right <= bounds.right &&
            rect.top >= bounds.top &&
            rect.bottom <= bounds.bottom
          );
        })
        .map((node) => node.dataset.nodeId)
        .filter((id): id is string => Boolean(id));

      const nextIds = [...new Set([...selectedNodeIds, ...ids])];
      setSelectedNodeIds(nextIds);
      setSelectedNodeId(nextIds.length === 1 ? nextIds[0] : null);
      setSelectedEdge(null);
    },
  );
  const [notes, setNotes] = useState(() => initialState?.notes ?? 0);
  const { tabs, activeTab, setActiveTab, closeTab, addTab } = useDiagramTabs({
    tabs: initialState?.tabs,
    activeTab: initialState?.activeTab,
  });
  const [challengeResult, setChallengeResult] = useState(false);
  const [buildStep, setBuildStep] = useState(0);
  const [deletedEdges, setDeletedEdges] = useState<string[]>(
    () => initialState?.deletedEdges ?? [],
  );
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const {
    traffic,
    setTraffic,
    dataset,
    setDataset,
    readRatio,
    setReadRatio,
    networkLatency,
    setNetworkLatency,
    reset: resetSimulationInputs,
  } = useSimulationInputs({
    traffic: initialState?.traffic,
    dataset: initialState?.dataset,
    readRatio: initialState?.readRatio,
    networkLatency: initialState?.networkLatency,
  });
  const [connectingFrom, setConnectingFrom] = useState<{
    id: string;
    portId: string;
  } | null>(null);
  const [configNode, setConfigNode] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<DiagramClipboard | null>(null);
  const [configScreenPos, setConfigScreenPos] = useState({ x: 400, y: 220 });
  const [challengeSeen, setChallengeSeen] = useState(
    () => mode !== "challenge" || readBooleanStorage(STORAGE_KEYS.challengeSeen),
  );

  useEffect(() => {
    if (mode === "challenge") {
      setChallengeSeen(readBooleanStorage(STORAGE_KEYS.challengeSeen));
    }
  }, [mode]);

  useEffect(() => {
    const updateViewportInfo = () => {
      setViewportInfo({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      });
    };

    const compactInspector = window.matchMedia("(max-width: 1179px)");
    const compactResources = window.matchMedia("(max-width: 899px)");

    const collapseInspector = (event: MediaQueryListEvent) => {
      if (event.matches) setRightOpen(false);
    };
    const collapseResources = (event: MediaQueryListEvent) => {
      if (event.matches) setLeftOpen(false);
    };

    if (compactInspector.matches) setRightOpen(false);
    if (compactResources.matches) setLeftOpen(false);

    window.addEventListener("resize", updateViewportInfo);
    window.visualViewport?.addEventListener("resize", updateViewportInfo);
    compactInspector.addEventListener("change", collapseInspector);
    compactResources.addEventListener("change", collapseResources);

    return () => {
      window.removeEventListener("resize", updateViewportInfo);
      window.visualViewport?.removeEventListener("resize", updateViewportInfo);
      compactInspector.removeEventListener("change", collapseInspector);
      compactResources.removeEventListener("change", collapseResources);
    };
  }, []);

  const persistedState = useMemo(
    () => ({
      addedComponents,
      nodeOffsets,
      deletedNodes,
      connections: userConnections,
      nodeProperties,
      deletedEdges,
      notes,
      tabs,
      activeTab,
      traffic,
      dataset,
      readRatio,
      networkLatency,
      zoom,
      pan,
      leftOpen,
      rightOpen,
      layer,
    }),
    [
      addedComponents,
      nodeOffsets,
      deletedNodes,
      userConnections,
      nodeProperties,
      deletedEdges,
      notes,
      tabs,
      activeTab,
      traffic,
      dataset,
      readRatio,
      networkLatency,
      zoom,
      pan,
      leftOpen,
      rightOpen,
      layer,
    ],
  );

  useEffect(() => {
    setSaveStatus("saving");

    const timeout = window.setTimeout(() => {
      const saved = updateProjectState(projectId, persistedState);
      if (!saved) {
        setToast("Could not save project");
        return;
      }

      setLastSavedAt(saved.updatedAt);
      setSaveStatus("saved");
    }, 420);

    return () => window.clearTimeout(timeout);
  }, [projectId, persistedState]);

  useEffect(() => {
    const flush = () => {
      updateProjectState(projectId, persistedState);
    };

    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [projectId, persistedState]);

  const changeMode = (nextMode: Mode) => {
    updateProject(projectId, (project) => ({
      ...project,
      mode: nextMode,
      updatedAt: new Date().toISOString(),
    }));
    onModeChange(nextMode);
  };

  const changeProjectName = (nextName: string) => {
    const updated = renameProject(projectId, nextName);
    if (!updated) return;
    setProjectName(updated.name);
    setLastSavedAt(updated.updatedAt);
  };

  const learnNames = getNodeNames(mode);
  const offset = (id: string): NodeOffset => nodeOffsets[id] ?? { x: 0, y: 0 };
  const moveNode = (id: string, value: NodeOffset) =>
    setNodeOffsets((current) => {
      if (selectedNodeIds.length <= 1 || !selectedNodeIds.includes(id)) {
        return { ...current, [id]: value };
      }

      const previous = current[id] ?? { x: 0, y: 0 };
      const delta = {
        x: value.x - previous.x,
        y: value.y - previous.y,
      };
      const next = { ...current };

      for (const selectedId of selectedNodeIds) {
        const selectedOffset = current[selectedId] ?? { x: 0, y: 0 };
        next[selectedId] = {
          x: selectedOffset.x + delta.x,
          y: selectedOffset.y + delta.y,
        };
      }

      return next;
    });

  const getNodeLabel = (id: string): string => {
    const coreIndex = CORE_NODE_IDS.indexOf(id as (typeof CORE_NODE_IDS)[number]);
    if (coreIndex >= 0) return learnNames[coreIndex];
    return addedComponents.find((component) => component.id === id)?.name ?? id;
  };

  const selected = selectedNodeId ? getNodeLabel(selectedNodeId) : "";
  const selectedProperties: NodePropertyValues = selectedNodeId
    ? {
        ...getDefaultNodeProperties(selected),
        ...(nodeProperties[selectedNodeId] ?? {}),
      }
    : {};

  const diagramSnapshot: DiagramSnapshot = {
    addedComponents,
    nodeOffsets,
    deletedNodes,
    userConnections,
    nodeProperties,
    deletedEdges,
  };

  const applySnapshot = (snapshot: DiagramSnapshot) => {
    setAddedComponents(snapshot.addedComponents);
    setNodeOffsets(snapshot.nodeOffsets);
    setDeletedNodes(snapshot.deletedNodes);
    setUserConnections(snapshot.userConnections);
    setNodeProperties(snapshot.nodeProperties);
    setDeletedEdges(snapshot.deletedEdges);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdge(null);
    setConnectingFrom(null);
  };

  const {
    captureSnapshot,
    undoDiagram,
    redoDiagram,
    undoCount,
    redoCount,
  } = useDiagramHistory(
    diagramSnapshot,
    applySnapshot,
    setToast,
  );

  const completeConnection = (targetId: string, targetPort: string) => {
    if (!connectingFrom) return;

    if (connectingFrom.id === targetId) {
      setConnectingFrom(null);
      setToast("Connection cancelled");
      return;
    }

    const fromName = getNodeLabel(connectingFrom.id);
    const toName = getNodeLabel(targetId);
    const validation = validatePortConnection({
      fromName,
      fromPortId: connectingFrom.portId,
      toName,
      toPortId: targetPort,
    });

    if (!validation.valid) {
      setToast(validation.reason);
      return;
    }

    const nextConnection = {
      from: connectingFrom.id,
      to: targetId,
      fromPort: connectingFrom.portId,
      toPort: targetPort,
      label: getConnectionLabel(fromName, toName),
    };
    const exists = userConnections.some(
      (connection) =>
        connection.from === nextConnection.from &&
        connection.to === nextConnection.to &&
        connection.fromPort === nextConnection.fromPort &&
        connection.toPort === nextConnection.toPort,
    );

    if (!exists) {
      captureSnapshot();
      setUserConnections((current) => [...current, nextConnection]);
    }

    setConnectingFrom(null);
    setSelectedNodeId(targetId);
    setSelectedNodeIds([targetId]);
    setRightOpen(true);
    setActiveAnalysisFinding(null);
    setAnalysisFocusIds([]);
    setToast(
      exists
        ? "That port connection already exists"
        : `${nextConnection.label} · ${fromName} → ${toName}`,
    );
  };

  const selectNode = (id: string, name: string) => {
    setActiveAnalysisFinding(null);
    setAnalysisFocusIds([]);
    if (connectingFrom) {
      completeConnection(id, getDefaultInputPort(name));
    }
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setRightOpen(true);
  };

  const handlePortConnect = (id: string, portId: string) => {
    setActiveAnalysisFinding(null);
    setAnalysisFocusIds([]);

    if (!connectingFrom) {
      const name = getNodeLabel(id);
      const port = getPortDefinition(name, portId);

      if (!port || port.direction === "in") {
        setToast(port ? `${port.label} is an input port` : "Choose a valid output port");
        return;
      }

      setConnectingFrom({ id, portId });
      setSelectedNodeId(id);
      setSelectedNodeIds([id]);
      setToast(`Connect from ${name} · ${port.label}`);
      return;
    }

    if (connectingFrom.id === id && connectingFrom.portId === portId) {
      setConnectingFrom(null);
      setToast("Connection cancelled");
      return;
    }

    completeConnection(id, portId);
  };
  const runTest = () => {
    if (running) {
      stopStressTest();
      setToast("Stress test stopped");
      return;
    }

    setStressFeedback("");
    startStressTest();
    if (tourStep === 3) setTourStep(4);
  };
  const {
    effectiveTraffic,
    bottleneckId,
    bottleneckUtilization,
    showBottleneck,
    healthScore,
    p95Latency,
    monthlyCost,
    availability,
    stressStage,
    nodeMetrics,
  } = useMemo(
    () =>
      calculateSimulation({
        running,
        stressComplete,
        stressProgress,
        traffic,
        dataset,
        readRatio,
        networkLatency,
        nodeNames: learnNames,
        addedComponents,
        nodeProperties,
        deletedNodes,
        deletedEdges,
        userConnections,
      }),
    [
      running,
      stressComplete,
      stressProgress,
      traffic,
      dataset,
      readRatio,
      networkLatency,
      learnNames,
      addedComponents,
      nodeProperties,
      deletedNodes,
      deletedEdges,
      userConnections,
    ],
  );
  const challengeEvaluation = useMemo(
    () =>
      evaluateChallenge({
        hasRun: stressComplete,
        effectiveTraffic,
        p95Latency,
        availability,
        monthlyCost,
      }),
    [stressComplete, effectiveTraffic, p95Latency, availability, monthlyCost],
  );
  const bottleneckLabel = getBottleneckLabel(bottleneckId, learnNames);
  const architectureAnalysis = useMemo(
    () =>
      analyzeArchitecture({
        names: learnNames,
        deletedNodes,
        deletedEdges,
        addedComponents,
        userConnections,
        nodeProperties,
        traffic,
        dataset,
        readRatio,
        networkLatency,
        effectiveTraffic,
        p95Latency,
        monthlyCost,
        bottleneckId,
      }),
    [
      learnNames,
      deletedNodes,
      deletedEdges,
      addedComponents,
      userConnections,
      nodeProperties,
      traffic,
      dataset,
      readRatio,
      networkLatency,
      effectiveTraffic,
      p95Latency,
      monthlyCost,
      bottleneckId,
    ],
  );

  useEffect(() => {
    if (
      activeAnalysisFinding &&
      !architectureAnalysis.findings.some(
        (finding) => finding.id === activeAnalysisFinding,
      )
    ) {
      setActiveAnalysisFinding(null);
      setAnalysisFocusIds([]);
    }
  }, [activeAnalysisFinding, architectureAnalysis]);

  useEffect(() => {
    if (!stressComplete) return;
    setStressFeedback(
      getBottleneckFeedback(
        bottleneckId,
        bottleneckLabel,
        nodeMetrics[bottleneckId],
      ),
    );
  }, [stressComplete, bottleneckId, bottleneckLabel, nodeMetrics]);

  const nodePoint = (id: string) => {
    const addedIndex = addedComponents.findIndex((component) => component.id === id);
    const point =
      BASE_NODE_POINTS[id as keyof typeof BASE_NODE_POINTS] ??
      (addedIndex >= 0 ? getAddedNodeBasePoint(addedIndex) : { x: 500, y: 325 });
    const shift = offset(id);
    return { x: point.x + shift.x, y: point.y + shift.y };
  };
  const saveDiagram = () => {
    const updated = updateProjectState(projectId, persistedState);
    const saved = updated ? markProjectSaved(projectId) : null;

    if (!saved) {
      setSaveStatus("saving");
      setToast("Could not save project");
      return;
    }

    writeStorage(STORAGE_KEYS.lastSave, saved.updatedAt);
    setLastSavedAt(saved.updatedAt);
    setSaveStatus("saved");
    setToast("Saved");
  };

  const focusArchitectureFinding = (finding: ArchitectureFinding) => {
    const alreadyFocused = activeAnalysisFinding === finding.id;
    setActiveAnalysisFinding(alreadyFocused ? null : finding.id);
    setAnalysisFocusIds(alreadyFocused ? [] : finding.nodeIds);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdge(null);
  };

  const closeArchitectureInspector = () => {
    setRightOpen(false);
    setActiveAnalysisFinding(null);
    setAnalysisFocusIds([]);
  };

  const shareProject = async () => {
    const shareHash = createSharedProjectHash({
      name: projectName,
      mode,
      state: persistedState,
    });
    const shareUrl = `${window.location.origin}${window.location.pathname}${shareHash}`;

    if (shareUrl.length > 24000) {
      setToast("Project is too large for a share link. Export JSON instead.");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast("Share link copied");
    } catch {
      setToast("Could not copy share link");
    }
  };

  const connectSelectedNode = () => {
    if (!selectedNodeId) {
      setToast("Select a component first");
      return;
    }

    setConnectingFrom({
      id: selectedNodeId,
      portId: getDefaultOutputPort(selected),
    });
    setToast(`Connect from ${selected} · choose a destination port`);
  };

  const clearCanvas = () => {
    if (!window.confirm("Clear the canvas? You can keep working from an empty design.")) return;

    captureSnapshot();
    setDeletedNodes(["client", "gateway", "service", "queue", "db"]);
    setAddedComponents([]);
    setUserConnections([]);
    setNodeProperties({});
    setNodeOffsets({});
    setDeletedEdges([]);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setToast("Canvas cleared");
  };

  const deleteNodesById = (nodeIds: string[]) => {
    const uniqueIds = [...new Set(nodeIds)];
    if (!uniqueIds.length) return;

    captureSnapshot();
    const ids = new Set(uniqueIds);
    const coreIds = uniqueIds.filter((nodeId) =>
      CORE_NODE_IDS.includes(nodeId as (typeof CORE_NODE_IDS)[number]),
    );

    setDeletedNodes((current) => [...new Set([...current, ...coreIds])]);
    setAddedComponents((current) =>
      current.filter((component) => !ids.has(component.id)),
    );
    setUserConnections((current) =>
      current.filter(
        (connection) => !ids.has(connection.from) && !ids.has(connection.to),
      ),
    );
    setNodeProperties((current) => {
      const next = { ...current };
      for (const nodeId of uniqueIds) delete next[nodeId];
      return next;
    });
    setNodeOffsets((current) => {
      const next = { ...current };
      for (const nodeId of uniqueIds) delete next[nodeId];
      return next;
    });
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setToast(
      uniqueIds.length === 1
        ? `${getNodeLabel(uniqueIds[0])} removed from canvas`
        : `${uniqueIds.length} components removed`,
    );
    window.setTimeout(() => setToast(""), 2200);
  };

  const deleteNodeById = (nodeId: string) => deleteNodesById([nodeId]);

  const deleteEdgeByKey = (edgeKey: string) => {
    captureSnapshot();

    if (edgeKey.startsWith("user-")) {
      const index = Number.parseInt(edgeKey.split("-").at(-1) ?? "", 10);
      if (!Number.isNaN(index)) {
        setUserConnections((current) =>
          current.filter((_, connectionIndex) => connectionIndex !== index),
        );
      }
    } else {
      setDeletedEdges((current) =>
        current.includes(edgeKey) ? current : [...current, edgeKey],
      );
    }

    setSelectedEdge(null);
    setToast("Connection removed");
  };

  const deleteSelection = () => {
    if (selectedEdge) {
      deleteEdgeByKey(selectedEdge);
      return;
    }

    const nodeIds = selectedNodeIds.length
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : [];

    if (!nodeIds.length) return;
    deleteNodesById(nodeIds);
  };

  const duplicateNodes = (sourceIds: string[]) => {
    const uniqueIds = [...new Set(sourceIds)];
    if (!uniqueIds.length) return;

    captureSnapshot();
    const created = uniqueIds.map((sourceId, index) => {
      const name = getNodeLabel(sourceId);
      const component = createAddedComponent(name);
      const sourcePoint = nodePoint(sourceId);
      const basePoint = getAddedNodeBasePoint(addedComponents.length + index);

      return {
        component,
        name,
        properties: {
          ...getDefaultNodeProperties(name),
          ...(nodeProperties[sourceId] ?? {}),
        },
        offset: {
          x: sourcePoint.x - basePoint.x + 24,
          y: sourcePoint.y - basePoint.y + 24,
        },
      };
    });

    setAddedComponents((current) => [
      ...current,
      ...created.map((item) => item.component),
    ]);
    setNodeProperties((current) => ({
      ...current,
      ...Object.fromEntries(
        created.map((item) => [item.component.id, item.properties]),
      ),
    }));
    setNodeOffsets((current) => ({
      ...current,
      ...Object.fromEntries(
        created.map((item) => [item.component.id, item.offset]),
      ),
    }));

    const createdIds = created.map((item) => item.component.id);
    setSelectedNodeIds(createdIds);
    setSelectedNodeId(createdIds.length === 1 ? createdIds[0] : null);
    setToast(
      created.length === 1
        ? `${created[0].name} duplicated`
        : `${created.length} components duplicated`,
    );
  };

  const duplicateNode = (sourceId: string) => duplicateNodes([sourceId]);

  const copySelection = () => {
    const nodeIds = selectedNodeIds.length
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : [];

    if (!nodeIds.length) {
      setToast("Select a component to copy");
      return;
    }

    const indexById = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
    const copiedConnections: ClipboardConnection[] = [];

    userConnections.forEach((connection, index) => {
      const fromIndex = indexById.get(connection.from);
      const toIndex = indexById.get(connection.to);
      const edgeKey = `user-${connection.from}-${connection.to}-${index}`;

      if (
        fromIndex === undefined ||
        toIndex === undefined ||
        deletedEdges.includes(edgeKey)
      ) {
        return;
      }

      copiedConnections.push({
        fromIndex,
        toIndex,
        fromPort: connection.fromPort,
        toPort: connection.toPort,
        label: connection.label,
      });
    });

    for (const connection of CORE_CONNECTIONS) {
      const fromIndex = indexById.get(connection.from);
      const toIndex = indexById.get(connection.to);

      if (
        fromIndex === undefined ||
        toIndex === undefined ||
        deletedEdges.includes(connection.key)
      ) {
        continue;
      }

      const fromName = getNodeLabel(connection.from);
      const toName = getNodeLabel(connection.to);
      copiedConnections.push({
        fromIndex,
        toIndex,
        fromPort: getDefaultOutputPort(fromName),
        toPort: getDefaultInputPort(toName),
        label: getConnectionLabel(fromName, toName),
      });
    }

    setClipboard({
      nodes: nodeIds.map((nodeId) => {
        const name = getNodeLabel(nodeId);
        return {
          name,
          properties: {
            ...getDefaultNodeProperties(name),
            ...(nodeProperties[nodeId] ?? {}),
          },
          point: nodePoint(nodeId),
        };
      }),
      connections: copiedConnections,
    });
    setToast(
      nodeIds.length === 1
        ? `${getNodeLabel(nodeIds[0])} copied`
        : `${nodeIds.length} components copied`,
    );
  };

  const pasteSelection = () => {
    if (!clipboard?.nodes.length) {
      setToast("Nothing copied yet");
      return;
    }

    captureSnapshot();
    const created = clipboard.nodes.map((item, index) => {
      const component = createAddedComponent(item.name);
      const basePoint = getAddedNodeBasePoint(addedComponents.length + index);
      return {
        component,
        properties: { ...item.properties },
        offset: {
          x: item.point.x + 24 - basePoint.x,
          y: item.point.y + 24 - basePoint.y,
        },
      };
    });
    const createdIds = created.map((item) => item.component.id);
    const pastedConnections: Connection[] = clipboard.connections.flatMap(
      (connection) => {
        const from = createdIds[connection.fromIndex];
        const to = createdIds[connection.toIndex];
        if (!from || !to) return [];

        return [{
          from,
          to,
          fromPort: connection.fromPort,
          toPort: connection.toPort,
          label: connection.label,
        }];
      },
    );

    setAddedComponents((current) => [
      ...current,
      ...created.map((item) => item.component),
    ]);
    setNodeProperties((current) => ({
      ...current,
      ...Object.fromEntries(
        created.map((item) => [item.component.id, item.properties]),
      ),
    }));
    setNodeOffsets((current) => ({
      ...current,
      ...Object.fromEntries(
        created.map((item) => [item.component.id, item.offset]),
      ),
    }));
    setUserConnections((current) => [...current, ...pastedConnections]);
    setSelectedNodeIds(createdIds);
    setSelectedNodeId(createdIds.length === 1 ? createdIds[0] : null);
    setClipboard((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((item) => ({
              ...item,
              point: { x: item.point.x + 24, y: item.point.y + 24 },
            })),
          }
        : current,
    );
    setToast(
      created.length === 1
        ? `${created[0].component.name} pasted`
        : `${created.length} components pasted`,
    );
  };

  const duplicateSelection = () => {
    const nodeIds = selectedNodeIds.length
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : [];

    if (!nodeIds.length) {
      setToast("Select a component to duplicate");
      return;
    }
    duplicateNodes(nodeIds);
  };

  useWorkspaceShortcuts({
    onEscape: () => {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setConnectingFrom(null);
      setControls(false);
      setAiTesting(false);
      setActiveAnalysisFinding(null);
      setAnalysisFocusIds([]);
    },
    onDelete: deleteSelection,
    onCopy: copySelection,
    onPaste: pasteSelection,
    onDuplicate: duplicateSelection,
    onUndo: (redo) => (redo ? redoDiagram() : undoDiagram()),
    onRedo: redoDiagram,
    onSave: saveDiagram,
  });

  const resetSimulation = () => {
    resetSimulationInputs();
    clearStressResult();
  };

  const openSelectedNodeConfig = () => {
    if (!selectedNodeId) return;

    const point = nodePoint(selectedNodeId);
    const left = Math.min(78, point.x / 10 + 3) / 100;
    const top = Math.min(70, point.y / 6.5 + 4) / 100;
    const toolboxWidth = 94;
    const headerHeight = 116;
    const canvasWidth = window.innerWidth - toolboxWidth;
    const canvasHeight = window.innerHeight - headerHeight - 66;

    setConfigScreenPos({
      x: Math.min(window.innerWidth - 320, toolboxWidth + left * canvasWidth + 172),
      y: Math.max(120, headerHeight + top * canvasHeight),
    });
    setConfigNode(selectedNodeId);
  };

  const addComponent = (name: string) => {
    captureSnapshot();
    const component = createAddedComponent(name);
    setAddedComponents((current) => [...current, component]);
    setSelectedNodeId(component.id);
    setSelectedNodeIds([component.id]);
    setRightOpen(true);
    setActiveAnalysisFinding(null);
    setAnalysisFocusIds([]);
    setToast(`${name} added`);
  };

  return (
    <main className={`workspace ${mode}-mode ${dark ? "dark" : ""}`}>
      <WorkspaceHeader
        mode={mode}
        projectName={projectName}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        dark={dark}
        running={running}
        onToggleTheme={() => setDark((value) => !value)}
        onModeChange={changeMode}
        onRename={changeProjectName}
        onHome={home}
        onLanding={landing}
        onSave={saveDiagram}
        onShare={shareProject}
        onRun={runTest}
        onAnalysis={() => setRightOpen(true)}
        onReview={() => setHistoryOpen(true)}
        onSettings={() => setControls((value) => !value)}
      />
      <div className={`workspace-main ${!leftOpen ? "left-collapsed" : ""} ${!rightOpen ? "right-collapsed" : ""}`}>
        <aside className="toolbox">
          <Toolbox layer={layer} onLayer={setLayer} onAdd={addComponent} />
          <button className="collapse-handle left" aria-label="Collapse components panel" title="Collapse components" data-tooltip="Collapse components" onClick={() => setLeftOpen(!leftOpen)}><Icon name="chevron" size={14} /></button>
        </aside>
        {!leftOpen && <button className="reopen-panel reopen-left" onClick={() => setLeftOpen(true)}><Icon name="chevron" /><span>Components</span></button>}
        <section className="canvas-wrap">
          <DiagramTabs
            tabs={tabs}
            activeTab={activeTab}
            mode={mode}
            onSelect={setActiveTab}
            onClose={closeTab}
            onAdd={addTab}
          />
          <CanvasToolbar
            zoom={zoom}
            canConnect={Boolean(selectedNodeId)}
            selectedLabel={selected}
            onConnect={connectSelectedNode}
            onUndo={undoDiagram}
            onRedo={redoDiagram}
            onClear={clearCanvas}
            onResetZoom={resetZoom}
            onHistory={() => setHistoryOpen(true)}
            onExport={() => setExportOpen(true)}
          />
          {mode === "challenge" && (
            <div className="canvas-challenge-chip">
              <span>!</span>
              <b>Challenge: Design a URL Shortener</b>
            </div>
          )}
          <div
            className={`main-canvas layer-${layer} ${running ? "is-running" : ""} ${connectingFrom ? "connection-mode" : ""} ${stressComplete ? "stress-complete" : ""} ${selectedNodeIds.length > 1 ? "has-group-selection" : ""} ${analysisFocusIds.length ? "has-analysis-focus" : ""} ${isPanning ? "is-panning" : ""}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={() => { setNotes(notes + 1); setToast("Sticky note added"); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const name = event.dataTransfer.getData("component");
              if (name) addComponent(name);
            }}
          >
            <div className="canvas-scene" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            {dragging && <><span className="alignment-guide vertical" /><span className="alignment-guide horizontal" /><span className="snap-label">Aligned · 24px</span></>}
            <ConnectionLayer
              names={learnNames}
              deletedNodes={deletedNodes}
              deletedEdges={deletedEdges}
              selectedEdge={selectedEdge}
              userConnections={userConnections}
              running={running}
              showBottleneck={showBottleneck}
              bottleneckId={bottleneckId}
              nodePoint={nodePoint}
              getNodeLabel={getNodeLabel}
              onSelectEdge={setSelectedEdge}
              onDeleteEdge={deleteEdgeByKey}
              onClearNodeSelection={() => {
                setSelectedNodeId(null);
                setSelectedNodeIds([]);
              }}
            />
            <NodeLayer
              names={learnNames}
              deletedNodes={deletedNodes}
              addedComponents={addedComponents}
              nodeProperties={nodeProperties}
              connectingFrom={connectingFrom?.id ?? null}
              selectedId={selectedNodeId}
              selectedIds={selectedNodeIds}
              analysisFocusIds={analysisFocusIds}
              running={running}
              runStage={runStage}
              healthScore={healthScore}
              showBottleneck={showBottleneck}
              bottleneckId={bottleneckId}
              traffic={traffic}
              p95Latency={p95Latency}
              dataset={dataset}
              nodeMetrics={nodeMetrics}
              offset={offset}
              onOffset={moveNode}
              onConnect={handlePortConnect}
              onSelect={selectNode}
              onDrag={(active) => {
                if (active) captureSnapshot();
                setDragging(active);
              }}
            />
            {Array.from({ length: notes }).map((_, index) => (
              <div className={`sticky-note note-${index}`} key={index}>
                <b>{index === 0 ? "Resilience idea" : "New annotation"}</b>
                <span>
                  {index === 0
                    ? "Add a regional failover path before launch."
                    : "Double-click to edit this tradeoff note."}
                </span>
              </div>
            ))}
            {connectingFrom && <div className="connect-mode-hint"><Icon name="connect" /> Connect from {getNodeLabel(connectingFrom.id)} · choose a destination port <button onClick={() => setConnectingFrom(null)}>Cancel</button></div>}
            <StressTestCard
              running={running}
              complete={stressComplete}
              effectiveTraffic={effectiveTraffic}
              progress={stressProgress}
              stage={stressStage}
              p95Latency={p95Latency}
              bottleneckLabel={bottleneckLabel}
              bottleneckUtilization={bottleneckUtilization}
              bottleneckDemand={nodeMetrics[bottleneckId].demand}
              bottleneckCapacity={nodeMetrics[bottleneckId].capacity}
              feedback={stressFeedback}
              healthScore={healthScore}
              availability={availability}
              onInspect={() => {
                const bottleneckNodeId = getNodeIdForLabel(bottleneckLabel) ?? null;
                setSelectedNodeId(bottleneckNodeId);
                setSelectedNodeIds(bottleneckNodeId ? [bottleneckNodeId] : []);
                setRightOpen(true);
              }}
              onRunAgain={runTest}
            />
            <div className="canvas-hint"><Icon name="bolt" size={14} /> Drag empty canvas to move · Shift-drag to select · Scroll to zoom</div>
            </div>
            {selectedNodeId && (
              <ComponentPopover
                selected={selected}
                properties={selectedProperties}
                aiEnabled={aiEnabled}
                onClose={() => {
                  setSelectedNodeId(null);
                  setSelectedNodeIds([]);
                }}
                onExplain={() => {
                  setAiOpen(true);
                  setAiTesting(true);
                }}
                onConfigure={openSelectedNodeConfig}
                onDuplicate={() => duplicateNode(selectedNodeId)}
                onDelete={() => deleteNodeById(selectedNodeId)}
              />
            )}
            {selection && <span className="selection-box" style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }} />}
          </div>
          <LiveMetrics
            mode={mode}
            healthScore={healthScore}
            p95Latency={p95Latency}
            traffic={traffic}
            readRatio={readRatio}
            availability={availability}
            monthlyCost={monthlyCost}
            dataset={dataset}
            controlsOpen={controls}
            onToggleControls={() => setControls((value) => !value)}
          />
          {controls && (
            <SimulationControls
              traffic={traffic}
              networkLatency={networkLatency}
              onTrafficChange={(value) => {
                setTraffic(value);
                clearStressResult();
              }}
              onLatencyChange={(value) => {
                setNetworkLatency(value);
                clearStressResult();
              }}
              onClose={() => setControls(false)}
            />
          )}
          {mode === "learn" && running && (
            <LearnSimulationControls
              traffic={traffic}
              dataset={dataset}
              readRatio={readRatio}
              networkLatency={networkLatency}
              onTrafficChange={setTraffic}
              onDatasetChange={setDataset}
              onReadRatioChange={setReadRatio}
              onLatencyChange={setNetworkLatency}
              onReset={resetSimulation}
            />
          )}
        </section>
        {rightOpen ? (
          <ArchitectureInspector
            analysis={architectureAnalysis}
            activeFindingId={activeAnalysisFinding}
            healthScore={healthScore}
            availability={availability}
            p95Latency={p95Latency}
            monthlyCost={monthlyCost}
            onFinding={focusArchitectureFinding}
            onClose={closeArchitectureInspector}
            onAskArchie={() => setAiOpen(true)}
          />
        ) : (
          <button
            className="reopen-panel reopen-right"
            onClick={() => setRightOpen(true)}
          >
            <Icon name="chevron" />
            <span>Inspection</span>
          </button>
        )}
        {mode === "challenge" && <>
          <div className="challenge-run-bar">
            <Button variant="soft" disabled={!stressComplete} title={stressComplete ? "Review measured constraints" : "Run the stress test before submitting"} onClick={() => setChallengeResult(true)}>Submit design</Button>
          </div>
          <aside className="score-panel">
            <ChallengeScore evaluation={challengeEvaluation} />
          </aside>
        </>}
      </div>
      <div className="workspace-statusbar" role="status" aria-label="Workspace status">
        <span className="status-context">{mode === "challenge" ? "CHALLENGE" : "DESIGN"}</span>
        <span>{architectureAnalysis.nodeCount} nodes</span>
        <span>{architectureAnalysis.edgeCount} connections</span>
        <span className={selectedNodeId ? "status-selected active" : "status-selected"}>
          {selectedNodeId ? `selected: ${selected}` : "no selection"}
        </span>
        <span>{traffic.toLocaleString()} req/s</span>
        <span>p95 {p95Latency} ms</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span
          className="status-display"
          title="CSS viewport · devicePixelRatio (diagnostic only)"
        >
          {viewportInfo.width}×{viewportInfo.height} · DPR {viewportInfo.dpr.toFixed(2)}
        </span>
        <span className="status-spacer" />
        <span>{saveStatus === "saving" ? "saving…" : "saved"}</span>
      </div>
      <AiArchitect
        enabled={aiEnabled}
        open={aiOpen}
        mode={mode}
        running={running}
        testing={aiTesting}
        selected={selected}
        runStage={runStage}
        nodeNames={learnNames}
        level={level}
        onOpen={() => setAiOpen(true)}
        onClose={() => setAiOpen(false)}
        onStartLiveTest={() => {
          setAiTesting(false);
          setStressFeedback("");
          startStressTest();
        }}
        onRunTest={runTest}
        onStartBuild={() => setBuildStep(1)}
      />
      {running && <div className="run-status" role="status" aria-live="polite"><span className="pulse-dot" /> STRESS TEST <b>{stressProgress}%</b></div>}
      {tourStep >= 0 && tourStep < 6 && <TourCard step={tourStep} level={level} next={() => setTourStep(tourStep + 1)} skip={() => setTourStep(-1)} />}
      {historyOpen && (
        <HistoryPanel
          close={() => setHistoryOpen(false)}
          undoCount={undoCount}
          redoCount={redoCount}
          lastSavedAt={lastSavedAt}
          onUndo={undoDiagram}
          onRedo={redoDiagram}
        />
      )}
      {exportOpen && <ExportModal close={() => setExportOpen(false)} exported={(format) => { downloadDiagram(format); setToast(`${format} downloaded`); setExportOpen(false); }} />}
      {buildStep > 0 && <GuidedBuild step={buildStep} next={() => buildStep < 5 ? setBuildStep(buildStep + 1) : setBuildStep(0)} close={() => setBuildStep(0)} />}
      {challengeResult && (
        <ChallengeResult
          evaluation={challengeEvaluation}
          close={() => setChallengeResult(false)}
        />
      )}
      {configNode && (
        <NodeConfigPanel
          nodeName={getNodeLabel(configNode)}
          level={level}
          currentProperties={{
            ...getDefaultNodeProperties(getNodeLabel(configNode)),
            ...(nodeProperties[configNode] ?? {}),
          }}
          apply={(properties) => {
            captureSnapshot();
            setNodeProperties((current) => ({
              ...current,
              [configNode]: properties,
            }));
          }}
          close={() => setConfigNode(null)}
          screenX={configScreenPos.x}
          screenY={configScreenPos.y}
        />
      )}
      {!challengeSeen && <ChallengeWelcome close={() => { setChallengeSeen(true); writeBooleanStorage(STORAGE_KEYS.challengeSeen, true); }} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" /> {toast}</div>}
    </main>
  );
}

