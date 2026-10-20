import { useContext, useEffect, useState, type CSSProperties } from "react";
import {
  Handle,
  Position,
  NodeToolbar,
  useConnection,
  useNodeConnections,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import type {
  ArchitectureNodeType,
  NodeProperties,
} from "../../../lib/architecture/types";
import { removeFromGraph } from "../../../lib/architecture/nodeOperations";
import ComponentGlyph from "../ComponentGlyph";
import { InspectorContext } from "../InspectorContext";
import ComponentInspector from "../ComponentInspector";
import { resolveImplementation } from "../../../lib/architecture/componentLibrary";
import {
  COMPONENT_CATALOG,
  FAMILY_COLORS,
} from "../componentCatalog";
import { ExplainCard, NodeActionBar, type NodePanel } from "../NodeContextUi";

// Defined in lib/architecture so the analysis and the saved-project validator share it.
export type { ArchitectureNodeType };

export type ArchitectureNodeData = {
  label: string;
  type: ArchitectureNodeType;
  // Chosen technology: a component implementation id (lib/architecture/componentLibrary.ts).
  // Absent means the type's default implementation.
  implementation?: string;
  // Saved component configuration. Absent until a component is configured.
  properties?: NodeProperties;
};

export const NODE_TYPE_LABELS: Record<ArchitectureNodeType, string> = {
  client: "Client",
  "web-app": "Web App",
  "mobile-app": "Mobile App",
  cdn: "CDN",
  dns: "DNS",
  server: "API Server",
  "api-gateway": "API Gateway",
  api: "API",
  custom: "Custom",
  "load-balancer": "Load Balancer",
  database: "Database",
  cache: "Cache",
  queue: "Message Queue",
  worker: "Worker",
  "object-storage": "Object Storage",
  search: "Search",
  auth: "Authentication",
};

export type ArchitectureFlowNode = Node<ArchitectureNodeData, "architecture">;

export default function ArchitectureNode({
  id,
  data,
  selected,
}: NodeProps<ArchitectureFlowNode>) {
  const { getNodes, setNodes, getEdges, setEdges } = useReactFlow<
    ArchitectureFlowNode,
    Edge
  >();
  const inspector = useContext(InspectorContext);
  const [panel, setPanel] = useState<NodePanel>("none");
  if ((!selected || inspector) && panel !== "none") setPanel("none");

  // Guided lessons keep their original node popovers instead of the inspector.
  useEffect(() => {
    if (panel === "none") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel("none");
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panel]);
  const togglePanel = (next: Exclude<NodePanel, "none">) =>
    setPanel((current) => current === next ? "none" : next);
  const configuredNode = selected && panel === "configure"
    ? getNodes().find((node) => node.id === id)
    : undefined;
  const activePanel = inspector ? (inspector.archieOpen ? "ai" : "configure") : panel;

  // Read-only view of React Flow's connection state, used only for styling: the id of
  // the node a connection is being dragged from, or null when none is in progress.
  const connectingFrom = useConnection((c) =>
    c.inProgress ? c.fromNode.id : null,
  );
  // A handle with a line attached stays visible, so the line visibly plugs into the node.
  const hasIncoming = useNodeConnections({ handleType: "target" }).length > 0;
  const hasOutgoing = useNodeConnections({ handleType: "source" }).length > 0;
  const stateClass = [
    selected ? "is-selected" : "",
    connectingFrom !== null ? "is-connecting" : "",
    connectingFrom === id ? "is-connect-source" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const { family, label: typeLabel } = COMPONENT_CATALOG[data.type];
  // Secondary line: the technology behind the component (its chosen implementation, or the
  // type's default), after the component type when the node was renamed.
  // A custom component names its own technology and is marked as not measured.
  const customTechnology =
    data.type === "custom" && typeof data.properties?.technology === "string" ? data.properties.technology : null;
  const technology = customTechnology ?? resolveImplementation(data.type, data.implementation).name;
  const meta =
    data.type === "custom"
      ? `${data.label === customTechnology ? "Custom" : (customTechnology ?? "Custom")} · not measured`
      : data.label === typeLabel
        ? technology
        : `${typeLabel} · ${technology}`;
  // The same operation as deleting with the keyboard, so both always give the same result:
  // the node and every edge attached to it go, in one change (one undo step, one autosave).
  const deleteThisNode = () => {
    const next = removeFromGraph({ nodes: getNodes(), edges: getEdges() }, { nodeIds: [id] });
    setNodes(next.nodes);
    setEdges(next.edges);
  };

  return (
    <div
      className={`ax-node ${stateClass}`}
      style={{ "--ax-family": FAMILY_COLORS[family] } as CSSProperties}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`ax-handle ax-handle-in ${hasIncoming ? "is-linked" : ""}`}
      />

      <span className="ax-node-icon">
        <ComponentGlyph type={data.type} className="ax-node-glyph" />
      </span>
      <span className="ax-node-text" title={`${data.label} · ${meta}`}>
        <span className="ax-node-name">{data.label}</span>
        <span className="ax-node-meta">{meta}</span>
      </span>

      <Handle
        type="source"
        position={Position.Right}
        className={`ax-handle ax-handle-out ${hasOutgoing ? "is-linked" : ""}`}
      />

      {/* NodeToolbar keeps these attached to the node as it moves or the view changes. */}
      <NodeToolbar position={Position.Top} offset={6}>
        <NodeActionBar
          panel={activePanel}
          onAskAi={inspector ? inspector.askArchie : () => togglePanel("ai")}
          onConfigure={inspector ? inspector.inspectComponent : () => togglePanel("configure")}
          onDelete={deleteThisNode}
        />
      </NodeToolbar>
      <NodeToolbar isVisible={selected && !inspector && panel !== "none"} position={Position.Bottom} offset={10}>
        {panel === "ai" && <ExplainCard type={data.type} nodeId={id} />}
        {configuredNode && <ComponentInspector node={configuredNode} showReview={false} />}
      </NodeToolbar>
    </div>
  );
}
