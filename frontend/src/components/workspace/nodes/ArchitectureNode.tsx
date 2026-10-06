import { useEffect, useState, type CSSProperties } from "react";
import {
  Handle,
  Position,
  NodeToolbar,
  useConnection,
  useNodeConnections,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import ComponentGlyph from "../ComponentGlyph";
import {
  COMPONENT_CATALOG,
  FAMILY_COLORS,
  FAMILY_LABELS,
} from "../componentCatalog";
import {
  ConfigureCard,
  ExplainCard,
  NodeActionBar,
  type NodePanel,
} from "../NodeContextUi";

export type ArchitectureNodeType =
  | "client"
  | "web-app"
  | "mobile-app"
  | "cdn"
  | "dns"
  | "server"
  | "api-gateway"
  | "load-balancer"
  | "database"
  | "cache"
  | "queue"
  | "worker"
  | "object-storage"
  | "search"
  | "auth";

export type ArchitectureNodeData = {
  label: string;
  type: ArchitectureNodeType;
};

export const NODE_TYPE_LABELS: Record<ArchitectureNodeType, string> = {
  client: "Client",
  "web-app": "Web App",
  "mobile-app": "Mobile App",
  cdn: "CDN",
  dns: "DNS",
  server: "API Server",
  "api-gateway": "API Gateway",
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
  const { deleteElements, updateNodeData } = useReactFlow();
  const [panel, setPanel] = useState<NodePanel>("none");

  // Contextual cards belong to the selected node: deselecting closes them.
  if (!selected && panel !== "none") setPanel("none");

  // Escape closes an open card first; it never deletes anything.
  useEffect(() => {
    if (panel === "none") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel("none");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panel]);

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
  // Secondary line: the component type when the node was renamed, otherwise its family.
  const meta = data.label === typeLabel ? FAMILY_LABELS[family] : typeLabel;
  const togglePanel = (next: Exclude<NodePanel, "none">) =>
    setPanel((current) => (current === next ? "none" : next));

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
          panel={panel}
          onAskAi={() => togglePanel("ai")}
          onConfigure={() => togglePanel("configure")}
          onDelete={() => void deleteElements({ nodes: [{ id }] })}
        />
      </NodeToolbar>

      <NodeToolbar
        isVisible={selected && panel !== "none"}
        position={Position.Bottom}
        offset={10}
      >
        {panel === "ai" && <ExplainCard type={data.type} />}
        {panel === "configure" && (
          <ConfigureCard
            type={data.type}
            name={data.label}
            onRename={(label) => updateNodeData(id, { label })}
          />
        )}
      </NodeToolbar>
    </div>
  );
}
