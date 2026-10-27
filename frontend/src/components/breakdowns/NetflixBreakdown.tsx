"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../workspace/architecture-workspace.css";
import "./breakdowns.css";

import { Logo } from "../ui";
import ArchitectureNode, { type ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";
import { HOME_ROUTE } from "../../lib/routes";
import {
  NETFLIX_COMPONENTS,
  NETFLIX_NODE_SIZE,
  netflixProgress,
  netflixScene,
  netflixStepIndex,
  netflixStepQuery,
  type NetflixNavigation,
} from "./netflix";
import NetflixGuide from "./NetflixGuide";

function BreakdownNode(props: NodeProps<ArchitectureFlowNode>) {
  const component = NETFLIX_COMPONENTS.find(item => item.id === props.id);
  return <>
    <ArchitectureNode {...props} readOnly subtitle={component?.role} />
    {props.id === "cache-control" && <Handle id="state-out" type="source" position={Position.Top} className="ax-handle is-linked" />}
    {props.id === "steering" && <Handle id="state-in" type="target" position={Position.Bottom} className="ax-handle is-linked" />}
    {props.id === "cdn" && <Handle id="video-out" type="source" position={Position.Bottom} className="ax-handle is-linked" />}
  </>;
}

const EDGE_CORNER_RADIUS = 8;
const PREPARATION_LABEL_GAP = 12;
// Reserve a lane below the preparation row so video delivery bypasses the API
// tier visually as well as in the topology.
const VIDEO_RETURN_ROUTE = { laneY: 620, leftClearance: 30, labelX: 280 } as const;

function videoReturnPath({ sourceX, sourceY, targetX, targetY }: Pick<EdgeProps, "sourceX" | "sourceY" | "targetX" | "targetY">): string {
  const { laneY, leftClearance } = VIDEO_RETURN_ROUTE;
  const returnX = targetX - leftClearance;
  const radius = EDGE_CORNER_RADIUS;
  return [
    `M ${sourceX} ${sourceY}`,
    `V ${laneY - radius}`,
    `Q ${sourceX} ${laneY} ${sourceX - radius} ${laneY}`,
    `H ${returnX + radius}`,
    `Q ${returnX} ${laneY} ${returnX} ${laneY - radius}`,
    `V ${targetY + radius}`,
    `Q ${returnX} ${targetY} ${returnX + radius} ${targetY}`,
    `H ${targetX}`,
  ].join(" ");
}

function BreakdownEdge(props: EdgeProps) {
  const { id, label, markerEnd, style } = props;
  let [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: EDGE_CORNER_RADIUS });
  if (id === "cdn-viewer") {
    path = videoReturnPath(props);
    labelX = VIDEO_RETURN_ROUTE.labelX;
    labelY = VIDEO_RETURN_ROUTE.laneY;
  } else if (id === "encoding-assets" || id === "assets-cdn") {
    // Short links leave too little room between ports for a label. Put it below
    // the preparation row instead of covering either component's text.
    labelY += NETFLIX_NODE_SIZE.height / 2 + PREPARATION_LABEL_GAP;
  }
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
    {label && <EdgeLabelRenderer>
      <span className="ax-breakdown-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span>
    </EdgeLabelRenderer>}
  </>;
}

const NODE_TYPES = { architecture: BreakdownNode };
const EDGE_TYPES = { breakdown: BreakdownEdge };
// Include the outer return paths as well as the floating guide when fitting nodes.
const FIT_OPTIONS = { padding: { left: "70px", right: "420px", top: "60px", bottom: "110px" }, maxZoom: 1.1 } as const;
const MOBILE_FIT_OPTIONS = { padding: 0.15, maxZoom: 1.1 };

function NetflixWalkthrough() {
  const pathname = usePathname();
  const query = useSearchParams();
  const progress = netflixProgress(query.get("step"), query.get("built"));
  const { stepIndex, revealedCount } = progress;
  const component: typeof NETFLIX_COMPONENTS[number] | undefined = NETFLIX_COMPONENTS[stepIndex];
  const scene = useMemo(() => netflixScene(revealedCount), [revealedCount]);
  const { fitView, setCenter, setNodes, setEdges } = useReactFlow<ArchitectureFlowNode>();
  const nodesReady = useNodesInitialized();
  const framedCount = useRef(0);
  const [guideSession, setGuideSession] = useState(0);
  const navigate = (action: NetflixNavigation) => {
    if (action === "restart" || (action === "next" && stepIndex === NETFLIX_COMPONENTS.length)) {
      setGuideSession(session => session + 1);
    }
    // Replace keeps browser Back useful: it returns to the dashboard rather than
    // replaying every lesson step. Refresh and copied links keep the current step.
    window.history.replaceState(null, "", `${pathname}${netflixStepQuery(window.location.search, action)}`);
  };
  const nodes = useMemo(() => scene.nodes.map(node => ({
    ...node,
    selected: node.id === component?.id,
    ariaLabel: `${node.data.label}: explain this component`,
  })), [scene, component?.id]);
  const edges: Edge[] = useMemo(() => scene.connections.map(connection => {
    const active = component && (connection.source === component.id || connection.target === component.id);
    const color = active ? "var(--ax-accent)" : "var(--ax-subtle)";
    return {
      ...connection,
      type: "breakdown",
      sourceHandle: connection.id === "control-steering" ? "state-out" : connection.id === "cdn-viewer" ? "video-out" : undefined,
      targetHandle: connection.id === "control-steering" ? "state-in" : undefined,
      selectable: false,
      focusable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
      style: { stroke: color, strokeWidth: active ? 1.8 : 1.2, strokeDasharray: connection.kind === "video" ? "6 4" : undefined },
    };
  }), [scene, component]);
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
        void setCenter(component.position.x + NETFLIX_NODE_SIZE.width / 2, component.position.y + NETFLIX_NODE_SIZE.height / 2, { zoom: 1 });
      } else if (buildChanged || !component || layoutChanged) {
        void fitView(mobile.matches ? MOBILE_FIT_OPTIONS : FIT_OPTIONS);
      }
    };
    frame();
    const onLayoutChange = () => frame(true);
    window.addEventListener("resize", onLayoutChange);
    return () => window.removeEventListener("resize", onLayoutChange);
  }, [component, revealedCount, nodesReady, fitView, setCenter]);

  return (
    <main className="ax-workspace ax-breakdown" style={{ "--ax-breakdown-node-width": `${NETFLIX_NODE_SIZE.width}px`, "--ax-breakdown-node-height": `${NETFLIX_NODE_SIZE.height}px` } as CSSProperties}>
      <header className="page-header ax-breakdown-header">
        <div className="ax-breakdown-heading">
          <Link href={HOME_ROUTE} className="ax-brand" aria-label="ARCHITECH dashboard"><Logo variant="by-level" /></Link>
          <h1>Netflix <span>System breakdown</span></h1>
        </div>
        <button type="button" onClick={() => navigate("restart")} disabled={revealedCount === 1}>Start over</button>
      </header>

      <div className="ax-breakdown-body">
        <section className="ax-breakdown-diagram" aria-label="Netflix example architecture">
          <div className="ax-breakdown-canvas">
            <ReactFlow
              defaultNodes={nodes}
              defaultEdges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={changes => {
                const selected = changes.find(change => change.type === "select" && change.selected);
                if (selected?.type === "select") navigate(netflixStepIndex(selected.id));
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
              fitViewOptions={FIT_OPTIONS}
            >
              <Controls showInteractive={false} onFitView={() => void fitView(window.matchMedia("(max-width: 900px)").matches ? MOBILE_FIT_OPTIONS : FIT_OPTIONS)} />
            </ReactFlow>
          </div>
          <div className="ax-breakdown-legend" aria-label="Connection types">
            <span><i />API &amp; control</span><span><i className="is-video" />Video files</span>
          </div>
        </section>

        <NetflixGuide key={guideSession} progress={progress} connections={scene.connections} onNavigate={navigate} />
      </div>
    </main>
  );
}

export default function NetflixBreakdown() {
  return <ReactFlowProvider><NetflixWalkthrough /></ReactFlowProvider>;
}
