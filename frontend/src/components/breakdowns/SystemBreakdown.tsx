"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
} from "react";
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../workspace/architecture-workspace.css";
import "./breakdowns.css";

import ArchitectureWorkspace, { type BreakdownChallenge, type WorkspaceProject } from "../workspace/ArchitectureWorkspace";
import WorkspaceHeader from "../workspace/WorkspaceHeader";
import ArchitectureNode, { type ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";
import BreakdownGuide, { type BreakdownGuideContent } from "./BreakdownGuide";
import LivePreviewCard from "./LivePreviewCard";
import LivePreviewToggle from "./LivePreviewToggle";
import { useLivePreviewSetting } from "./useLivePreviewSetting";
import { ArchitectureEdge, type EdgeRoute } from "../workspace/OrthogonalEdge";
import { getOrthogonalEdgePath } from "../../lib/architecture/edgeRouting";
import { ARCHITECTURE_NODE_SIZE } from "../../lib/architecture/nodeLayout";
import type { Challenge } from "../challenge/challenges";
import { browserStorage, readBreakdownDraft, writeBreakdownDraft } from "./breakdownDraft";
import { breakdownMode, breakdownModeQuery, type BreakdownMode } from "./breakdownMode";
import type { PreviewFrame } from "./livePreview";
import type { SceneProps } from "./previewScene";
import type { BreakdownHandle, BreakdownNavigation } from "./walkthrough";

// Everything one breakdown supplies. The walkthrough, live preview and Challenge are shared.
export type SystemBreakdownDefinition = BreakdownGuideContent & {
  // Draft key for the Challenge design, kept in this browser.
  id: string;
  title: string;
  diagramLabel: string;
  // The brand color used for the live preview's active marks.
  accent: string;
  previews: Readonly<Record<string, readonly PreviewFrame[]>>;
  scenes: Readonly<Record<string, ComponentType<SceneProps>>>;
  challenge: Challenge;
  // A path for a link that cannot take the default orthogonal route; undefined uses the default.
  route?: (props: EdgeProps) => ReturnType<EdgeRoute> | undefined;
  // Room around the nodes when fitting, beyond the floating guide.
  fitPadding?: { top?: number; bottom?: number; left?: number };
};

type PortSpec = BreakdownHandle & { type: "source" | "target" };

const HIDE_ATTRIBUTION = { hideAttribution: true };
const LABEL_BELOW_GAP = 12;
const NO_CONNECTIONS: readonly string[] = [];
const MOBILE_FIT_OPTIONS = { padding: 0.15, maxZoom: 1.1 };

// React Flow wants node and edge types to stay the same objects, so the breakdown reaches
// them through context instead of new component types per breakdown.
const BreakdownContext = createContext<{ definition: SystemBreakdownDefinition; ports: ReadonlyMap<string, readonly PortSpec[]> } | null>(null);

function useBreakdown() {
  const value = useContext(BreakdownContext);
  if (!value) throw new Error("A breakdown node or edge was drawn outside SystemBreakdown.");
  return value;
}

// The extra top and bottom ports each component needs for its vertical links.
function portsByNode(definition: SystemBreakdownDefinition): ReadonlyMap<string, readonly PortSpec[]> {
  const ports = new Map<string, PortSpec[]>();
  const add = (nodeId: string, port: PortSpec) => ports.set(nodeId, [...(ports.get(nodeId) ?? []), port]);
  for (const connection of definition.walkthrough.scene(definition.components.length).connections) {
    if (connection.sourcePort) add(connection.source, { ...connection.sourcePort, type: "source" });
    if (connection.targetPort) add(connection.target, { ...connection.targetPort, type: "target" });
  }
  return ports;
}

function BreakdownNode(props: NodeProps<ArchitectureFlowNode>) {
  const { definition, ports } = useBreakdown();
  const component = definition.components.find(item => item.id === props.id);
  return <>
    <ArchitectureNode {...props} readOnly subtitle={component?.role} />
    {ports.get(props.id)?.map(port => (
      <Handle key={port.id} id={port.id} type={port.type} position={port.side === "top" ? Position.Top : Position.Bottom} className="ax-handle is-linked" />
    ))}
  </>;
}

// Everything visual comes from the canvas edge; a breakdown only adds its lanes.
function BreakdownEdge(props: EdgeProps) {
  const { definition } = useBreakdown();
  const route = useCallback<EdgeRoute>((edge) => {
    const custom = definition.route?.(edge);
    if (custom) return custom;
    const [path, labelX, labelY] = getOrthogonalEdgePath(edge);
    return [path, labelX, props.data?.labelBelow ? labelY + ARCHITECTURE_NODE_SIZE.height / 2 + LABEL_BELOW_GAP : labelY];
  }, [definition, props.data?.labelBelow]);
  return <ArchitectureEdge {...props} route={route} lit={Boolean(props.data?.lit)} />;
}

const NODE_TYPES = { architecture: BreakdownNode };
const EDGE_TYPES = { breakdown: BreakdownEdge };

function fitOptions(definition: SystemBreakdownDefinition) {
  const { top = 90, bottom = 110, left = 70 } = definition.fitPadding ?? {};
  // The right side keeps the nodes clear of the floating guide.
  return { padding: { left: `${left}px`, right: "420px", top: `${top}px`, bottom: `${bottom}px` }, maxZoom: 1.1 } as const;
}

function Walkthrough({ onChallenge }: { onChallenge: () => void }) {
  const { definition } = useBreakdown();
  const { walkthrough, components } = definition;
  const pathname = usePathname();
  const query = useSearchParams();
  const progress = walkthrough.progress(query.get("step"), query.get("built"));
  const { stepIndex, revealedCount } = progress;
  const component = components[stepIndex];
  const step = walkthrough.steps[stepIndex]!;
  const scene = useMemo(() => walkthrough.scene(revealedCount), [walkthrough, revealedCount]);
  const fit = useMemo(() => fitOptions(definition), [definition]);
  const { fitView, setCenter, setNodes, setEdges } = useReactFlow<ArchitectureFlowNode>();
  const nodesReady = useNodesInitialized();
  const framedCount = useRef(0);
  const [guideSession, setGuideSession] = useState(0);
  // The live preview names the connections it is using, so they light up on the diagram too.
  const [litConnections, setLitConnections] = useState(NO_CONNECTIONS);
  const livePreview = useLivePreviewSetting();
  const navigate = (action: BreakdownNavigation) => {
    if (action === "restart" || (action === "next" && stepIndex === components.length)) {
      setGuideSession(session => session + 1);
    }
    // Replace keeps browser Back useful: it returns to the dashboard rather than
    // replaying every lesson step. Refresh and copied links keep the current step.
    window.history.replaceState(null, "", `${pathname}${walkthrough.stepQuery(window.location.search, action)}`);
  };
  const nodes = useMemo(() => scene.nodes.map(node => ({
    ...node,
    selected: node.id === component?.id,
    ariaLabel: `${node.data.label}: explain this component`,
  })), [scene, component?.id]);
  const edges: Edge[] = useMemo(() => scene.connections.map(connection => ({
    id: connection.id,
    source: connection.source,
    target: connection.target,
    label: connection.label,
    data: { lit: litConnections.includes(connection.id), labelBelow: Boolean(connection.labelBelow) },
    type: "breakdown",
    sourceHandle: connection.sourcePort?.id,
    targetHandle: connection.targetPort?.id,
    selectable: false,
    focusable: false,
  })), [scene, litConnections]);
  // React Flow owns measurement and selection; the lesson supplies a read-only
  // graph whenever its visible components or focused step change.
  useEffect(() => {
    setNodes(current => {
      // Retain dimensions so inspecting another component does not hide every
      // existing node for a fresh measurement pass.
      const measured = new Map(current.map(node => [node.id, node.measured]));
      return nodes.map(node => ({ ...node, measured: measured.get(node.id) }));
    });
    setEdges(edges);
  }, [nodes, edges, setNodes, setEdges]);
  useEffect(() => {
    if (!nodesReady) return;
    const mobile = window.matchMedia("(max-width: 900px)");
    const buildChanged = framedCount.current !== revealedCount;
    framedCount.current = revealedCount;
    const frame = (layoutChanged = false) => {
      if (component && mobile.matches) {
        // Keep the inspected object readable on phones; pan/zoom and Fit View
        // still expose the surrounding topology without shrinking every label.
        void setCenter(component.position.x + ARCHITECTURE_NODE_SIZE.width / 2, component.position.y + ARCHITECTURE_NODE_SIZE.height / 2, { zoom: 1 });
      } else if (buildChanged || !component || layoutChanged) {
        void fitView(mobile.matches ? MOBILE_FIT_OPTIONS : fit);
      }
    };
    frame();
    const onLayoutChange = () => frame(true);
    window.addEventListener("resize", onLayoutChange);
    return () => window.removeEventListener("resize", onLayoutChange);
  }, [component, revealedCount, nodesReady, fitView, setCenter, fit]);

  const Scene = definition.scenes[step];
  const frames = definition.previews[step];

  return (
    <main className="ax-workspace ax-breakdown" style={{ "--ax-breakdown-accent": definition.accent } as CSSProperties}>
      <WorkspaceHeader
        title={definition.title}
        mode="learn"
        onModeChange={mode => { if (mode === "challenge") onChallenge(); }}
        actions={<>
          <LivePreviewToggle />
          <button type="button" className="ax-action" onClick={() => navigate("restart")} disabled={revealedCount === 1}>Start over</button>
        </>}
      />

      <div className="ax-breakdown-body">
        <section className="ax-breakdown-diagram" aria-label={definition.diagramLabel}>
          <div className="ax-breakdown-canvas">
            <ReactFlow
              proOptions={HIDE_ATTRIBUTION}
              defaultNodes={nodes}
              defaultEdges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={changes => {
                const selected = changes.find(change => change.type === "select" && change.selected);
                if (selected?.type === "select") navigate(walkthrough.stepIndex(selected.id));
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              // Let Space activate the guide's native disclosure controls.
              panActivationKeyCode={null}
              multiSelectionKeyCode={null}
              selectionOnDrag={false}
              ariaLabelConfig={{ "node.a11yDescription.default": "Press Enter or Space to explain this component." }}
              minZoom={0.25}
              maxZoom={2}
              fitView
              fitViewOptions={fit}
            />
          </div>
        </section>

        <div className="ax-breakdown-rail">
          {livePreview.enabled && Scene && frames && (
            <LivePreviewCard key={step} frames={frames} onFrame={setLitConnections}>
              {(frame, playing) => <Scene frame={frame} playing={playing} />}
            </LivePreviewCard>
          )}
          <BreakdownGuide key={guideSession} guide={definition} progress={progress} connections={scene.connections} onNavigate={navigate} />
        </div>
      </div>
    </main>
  );
}

// The design lives in this browser, so the editor only opens once the page is in the browser.
const subscribeNever = () => () => {};
const useInBrowser = () => useSyncExternalStore(subscribeNever, () => true, () => false);

// Challenge: the project editor in Challenge mode, on a design kept for this breakdown.
function BreakdownChallengeEditor({ onLearn }: { onLearn: () => void }) {
  const { definition } = useBreakdown();
  const { challenge } = definition;
  const challengeId = challenge.id;
  const [project] = useState<WorkspaceProject>(() => ({
    id: `breakdown-${definition.id}`,
    title: definition.title,
    mode: "challenge",
    ...readBreakdownDraft(browserStorage(), challengeId),
  }));
  const onGraphChange = useCallback<BreakdownChallenge["onGraphChange"]>(
    (nodes, edges) => writeBreakdownDraft(browserStorage(), challengeId, nodes, edges),
    [challengeId],
  );
  const breakdown = useMemo<BreakdownChallenge>(
    () => ({ challenge, onLearn, onGraphChange }),
    [challenge, onLearn, onGraphChange],
  );
  return <ArchitectureWorkspace project={project} breakdown={breakdown} />;
}

export default function SystemBreakdown({ definition }: { definition: SystemBreakdownDefinition }) {
  const pathname = usePathname();
  const mode = breakdownMode(useSearchParams().get("mode"));
  const inBrowser = useInBrowser();
  const context = useMemo(() => ({ definition, ports: portsByNode(definition) }), [definition]);
  // Replace, as the walkthrough's steps do, so Back still returns to the dashboard.
  const switchMode = useCallback((next: BreakdownMode) => {
    window.history.replaceState(null, "", `${pathname}${breakdownModeQuery(window.location.search, next)}`);
  }, [pathname]);
  const openLearn = useCallback(() => switchMode("learn"), [switchMode]);
  const openChallenge = useCallback(() => switchMode("challenge"), [switchMode]);

  return (
    <BreakdownContext.Provider value={context}>
      {mode === "challenge"
        ? inBrowser ? <BreakdownChallengeEditor onLearn={openLearn} /> : <div className="ax-status-page h-screen bg-white" />
        : <ReactFlowProvider><Walkthrough onChallenge={openChallenge} /></ReactFlowProvider>}
    </BreakdownContext.Provider>
  );
}
