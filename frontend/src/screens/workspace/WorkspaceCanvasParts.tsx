import { useLayoutEffect, useRef, useState } from "react";

import { Button, Icon } from "../../components/ui";
import type { Mode } from "../../types";
import {
  getConnectionLabel,
  getDefaultNodeProperties,
  getNodeKind,
  type NodePropertyValues,
} from "./workspaceData";
import {
  BASE_NODE_POINTS,
  CORE_CONNECTIONS,
  getAddedNodeBasePoint,
  type AddedComponent,
  type Connection,
  type CoreEdgeKey,
  type CoreNodeId,
  type NodeOffset,
  type NodeRuntimeMetrics,
} from "./workspaceModel";
import { CanvasNode } from "./CanvasNode";
import { Metric } from "./WorkspacePanels";

export const CORE_EDGE_KEYS: CoreEdgeKey[] = CORE_CONNECTIONS.map(
  (connection) => connection.key,
);

const CORE_INDEX: Record<CoreNodeId, number> = {
  client: 0,
  gateway: 1,
  service: 2,
  queue: 3,
  db: 4,
};

interface HalfSize {
  w: number;
  h: number;
}

const DEFAULT_HALF_SIZE: HalfSize = { w: 82, h: 41 };

// Points are in canvas pixels and half sizes are the nodes' real half width / height, so a
// line starts and ends exactly on the border of the nodes it connects.
function connectionPath(
  from: NodeOffset,
  to: NodeOffset,
  fromHalf: HalfSize,
  toHalf: HalfSize,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx >= 0 ? 1 : -1;
    const startX = from.x + direction * fromHalf.w;
    const endX = to.x - direction * toHalf.w;
    const midpoint = (startX + endX) / 2;

    return `M${startX} ${from.y} C${midpoint} ${from.y} ${midpoint} ${to.y} ${endX} ${to.y}`;
  }

  const direction = dy >= 0 ? 1 : -1;
  const startY = from.y + direction * fromHalf.h;
  const endY = to.y - direction * toHalf.h;
  const midpoint = (startY + endY) / 2;

  return `M${from.x} ${startY} C${from.x} ${midpoint} ${to.x} ${midpoint} ${to.x} ${endY}`;
}

function TrafficPackets({ path, hot = false }: { path: string; hot?: boolean }) {
  return (
    <g className={hot ? "traffic-packets hot" : "traffic-packets"} aria-hidden="true">
      <circle r="3.4" className="traffic-packet">
        <animateMotion dur="1.45s" repeatCount="indefinite" path={path} />
      </circle>
      <circle r="2.4" className="traffic-packet secondary">
        <animateMotion dur="1.45s" begin="-0.72s" repeatCount="indefinite" path={path} />
      </circle>
    </g>
  );
}

function midpoint(from: NodeOffset, to: NodeOffset): NodeOffset {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
}

function EdgeLabel({
  point,
  label,
}: {
  point: NodeOffset;
  label: string;
}) {
  const width = Math.max(42, Math.min(112, label.length * 6 + 18));

  return (
    <g
      className="edge-label"
      transform={`translate(${point.x - width / 2} ${point.y - 10})`}
    >
      <rect width={width} height="20" rx="4" />
      <text x={width / 2} y="13" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

interface ConnectionLayerProps {
  names: readonly [string, string, string, string, string];
  deletedNodes: string[];
  deletedEdges: string[];
  selectedEdge: string | null;
  userConnections: Connection[];
  running: boolean;
  showBottleneck: boolean;
  bottleneckId: Exclude<CoreNodeId, "client">;
  nodePoint: (id: string) => NodeOffset;
  nodeOffset: (id: string) => NodeOffset;
  getNodeLabel: (id: string) => string;
  onSelectEdge: (edge: string | null) => void;
  onDeleteEdge: (edge: string) => void;
  onClearNodeSelection: () => void;
}

export function ConnectionLayer({
  names,
  deletedNodes,
  deletedEdges,
  selectedEdge,
  userConnections,
  running,
  showBottleneck,
  bottleneckId,
  nodePoint,
  nodeOffset,
  getNodeLabel,
  onSelectEdge,
  onDeleteEdge,
  onClearNodeSelection,
}: ConnectionLayerProps) {
  // The lines are drawn in the canvas's real pixel size, not a stretched 1000x650 box, so
  // they stay attached to nodes (which have fixed pixel sizes) at any canvas size.
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () =>
      setSize((previous) =>
        previous.w === svg.clientWidth && previous.h === svg.clientHeight
          ? previous
          : { w: svg.clientWidth, h: svg.clientHeight },
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // Node centers: the stored base point is in 1000x650 units, the drag offset is in pixels.
  const pixelPoint = (id: string): NodeOffset => {
    const point = nodePoint(id);
    const shift = nodeOffset(id);
    return {
      x: ((point.x - shift.x) * size.w) / 1000 + shift.x,
      y: ((point.y - shift.y) * size.h) / 650 + shift.y,
    };
  };

  // Real rendered half size of each node, measured after layout.
  const [halfSizes, setHalfSizes] = useState<Record<string, HalfSize>>({});
  // Runs after every render on purpose (nodes can change size with their content); the
  // state only updates when a measurement actually changed, so it cannot loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const parent = svgRef.current?.parentElement;
    if (!parent) return;
    const measured: Record<string, HalfSize> = {};
    parent.querySelectorAll<HTMLElement>("[data-node-id]").forEach((element) => {
      const id = element.dataset.nodeId;
      if (id) {
        measured[id] = { w: element.offsetWidth / 2, h: element.offsetHeight / 2 };
      }
    });
    setHalfSizes((previous) =>
      JSON.stringify(previous) === JSON.stringify(measured) ? previous : measured,
    );
  });
  const halfSize = (id: string): HalfSize => halfSizes[id] ?? DEFAULT_HALF_SIZE;

  const pathBetween = (fromId: string, toId: string) =>
    connectionPath(
      pixelPoint(fromId),
      pixelPoint(toId),
      halfSize(fromId),
      halfSize(toId),
    );

  const selectEdge = (edgeKey: string) => {
    onSelectEdge(selectedEdge === edgeKey ? null : edgeKey);
    onClearNodeSelection();
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdge) return;
    onDeleteEdge(selectedEdge);
    onSelectEdge(null);
  };

  return (
    <svg
      ref={svgRef}
      className="canvas-lines architecture-lines"
      viewBox={`0 0 ${size.w || 1000} ${size.h || 650}`}
      onClick={() => onSelectEdge(null)}
    >
      <defs>
        <marker
          id="arch-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 8 4 0 8Z" className="edge-arrow-head" />
        </marker>
      </defs>

      {CORE_EDGE_KEYS.map((edgeKey) => {
        const [fromId, toId] = edgeKey.split("-") as [CoreNodeId, CoreNodeId];
        if (
          deletedNodes.includes(fromId) ||
          deletedNodes.includes(toId) ||
          deletedEdges.includes(edgeKey)
        ) {
          return null;
        }

        const from = pixelPoint(fromId);
        const to = pixelPoint(toId);
        const path = pathBetween(fromId, toId);
        const isSelected = selectedEdge === edgeKey;
        const isBottleneckEdge = showBottleneck && toId === bottleneckId;
        const label = getConnectionLabel(
          names[CORE_INDEX[fromId]],
          names[CORE_INDEX[toId]],
        );

        return (
          <g
            key={edgeKey}
            onClick={(event) => {
              event.stopPropagation();
              selectEdge(edgeKey);
            }}
          >
            <path
              d={path}
              markerEnd="url(#arch-arrow)"
              className={`${isSelected ? "edge-selected " : ""}${running ? "edge-flowing " : ""}${isBottleneckEdge ? "edge-bottleneck" : ""}`.trim()}
            />
            {running && <TrafficPackets path={path} hot={isBottleneckEdge} />}
            <path
              d={path}
              stroke="transparent"
              strokeWidth={16}
              fill="none"
              style={{ cursor: "pointer" }}
            />
            <EdgeLabel point={midpoint(from, to)} label={label} />
          </g>
        );
      })}

      {userConnections.map((connection, index) => {
        const edgeKey = `user-${connection.from}-${connection.to}-${index}`;
        if (deletedEdges.includes(edgeKey)) return null;

        const from = pixelPoint(connection.from);
        const to = pixelPoint(connection.to);
        const path = pathBetween(connection.from, connection.to);
        const isSelected = selectedEdge === edgeKey;
        const label =
          connection.label ||
          getConnectionLabel(
            getNodeLabel(connection.from),
            getNodeLabel(connection.to),
          );

        return (
          <g
            key={edgeKey}
            onClick={(event) => {
              event.stopPropagation();
              selectEdge(edgeKey);
            }}
          >
            <path
              className={`user-connection${isSelected ? " edge-selected" : ""}${running ? " edge-flowing" : ""}`}
              d={path}
              markerEnd="url(#arch-arrow)"
            />
            {running && <TrafficPackets path={path} />}
            <path
              d={path}
              stroke="transparent"
              strokeWidth={16}
              fill="none"
              style={{ cursor: "pointer" }}
            />
            <EdgeLabel point={midpoint(from, to)} label={label} />
          </g>
        );
      })}

      {selectedEdge && (() => {
        let point: NodeOffset | null = null;
        let width = 126;

        if (selectedEdge.startsWith("user-")) {
          const index = Number.parseInt(selectedEdge.split("-").at(-1) ?? "", 10);
          const connection = userConnections[index];
          if (!connection) return null;
          point = midpoint(pixelPoint(connection.from), pixelPoint(connection.to));
          width = 112;
        } else if (CORE_EDGE_KEYS.includes(selectedEdge as CoreEdgeKey)) {
          const [fromId, toId] = selectedEdge.split("-") as [CoreNodeId, CoreNodeId];
          point = midpoint(pixelPoint(fromId), pixelPoint(toId));
        }

        if (!point) return null;

        return (
          <foreignObject
            x={point.x - width / 2}
            y={point.y + 13}
            width={width}
            height={38}
          >
            <Button
              variant="danger"
              size="sm"
              className="edge-delete-btn"
              aria-label="Remove selected connection"
              title="Remove selected connection"
              onClick={(event) => {
                event.stopPropagation();
                deleteSelectedEdge();
              }}
            >
              × Remove connection
            </Button>
          </foreignObject>
        );
      })()}
    </svg>
  );
}

interface NodeLayerProps {
  names: readonly [string, string, string, string, string];
  deletedNodes: string[];
  addedComponents: AddedComponent[];
  nodeProperties: Record<string, NodePropertyValues>;
  connectingFrom: string | null;
  selectedId: string | null;
  selectedIds?: string[];
  analysisFocusIds?: string[];
  running: boolean;
  runStage: number;
  healthScore: number;
  showBottleneck: boolean;
  bottleneckId: Exclude<CoreNodeId, "client">;
  traffic: number;
  p95Latency: number;
  dataset: number;
  nodeMetrics: Record<CoreNodeId, NodeRuntimeMetrics>;
  offset: (id: string) => NodeOffset;
  onOffset: (id: string, value: NodeOffset) => void;
  onConnect: (id: string, portId: string) => void;
  onSelect: (id: string, name: string) => void;
  onDrag: (active: boolean) => void;
}

function layerClassFor(name: string): string {
  const kind = getNodeKind(name);

  if (kind === "client" || kind === "cdn") return "frontend-node";
  if (kind === "lb" || kind === "gateway") return "frontend-node backend-node";
  return "backend-node";
}

function customRuntimeStat(name: string): string {
  const kind = getNodeKind(name);

  switch (kind) {
    case "client":
      return "Traffic source";
    case "lb":
    case "gateway":
      return "Ingress tier";
    case "service":
      return "Compute tier";
    case "cache":
      return "Hot data path";
    case "queue":
      return "Async path";
    case "database":
      return "Persistent state";
    case "storage":
      return "Durable objects";
    case "cdn":
      return "Edge delivery";
    case "external":
      return "External dependency";
  }
}

export function NodeLayer({
  names,
  deletedNodes,
  addedComponents,
  nodeProperties,
  connectingFrom,
  selectedId,
  selectedIds = [],
  analysisFocusIds = [],
  running,
  runStage,
  healthScore,
  showBottleneck,
  bottleneckId,
  traffic,
  p95Latency,
  dataset,
  nodeMetrics,
  offset,
  onOffset,
  onConnect,
  onSelect,
  onDrag,
}: NodeLayerProps) {
  const propertiesFor = (id: string, name: string) => ({
    ...getDefaultNodeProperties(name),
    ...(nodeProperties[id] ?? {}),
  });

  const renderCoreNode = (
    id: CoreNodeId,
    index: number,
    sub: string,
    className: string,
  ) => {
    if (deletedNodes.includes(id)) return null;

    const name = names[index];

    return (
      <CanvasNode
        nodeId={id}
        kind={getNodeKind(name)}
        connecting={connectingFrom === id}
        onConnect={onConnect}
        basePoint={BASE_NODE_POINTS[id]}
        offset={offset(id)}
        onOffset={(value) => onOffset(id, value)}
        styleClass={`${className} ${analysisFocusIds.includes(id) ? "analysis-focus" : ""}`}
        title={name}
        sub={sub}
        properties={propertiesFor(id, name)}
        selected={selectedId === id || selectedIds.includes(id)}
        onClick={() => onSelect(id, name)}
        onDrag={onDrag}
      />
    );
  };

  return (
    <>
      {renderCoreNode(
        "client",
        0,
        `${traffic.toLocaleString()} req/s`,
        `n-client frontend-node ${running && runStage === 0 ? "run-active" : ""}`,
      )}
      {renderCoreNode(
        "gateway",
        1,
        `${Math.round(nodeMetrics.gateway.utilization)}% load · ${p95Latency}ms p95`,
        `n-gateway frontend-node backend-node ${healthScore < 70 ? "node-stressed" : ""} ${showBottleneck && bottleneckId === "gateway" ? "stress-bottleneck" : ""} ${running && runStage === 1 ? "run-active" : ""}`,
      )}
      {renderCoreNode(
        "service",
        2,
        `${nodeMetrics.service.replicas} replicas · ${Math.round(nodeMetrics.service.utilization)}% load`,
        `n-service backend-node ${showBottleneck && bottleneckId === "service" ? "stress-bottleneck" : ""} ${running && runStage === 2 ? "run-active" : ""}`,
      )}
      {renderCoreNode(
        "queue",
        3,
        `${nodeMetrics.queue.demand.toLocaleString()} req/s · ${Math.round(nodeMetrics.queue.utilization)}% load`,
        `n-queue backend-node ${showBottleneck && bottleneckId === "queue" ? "stress-bottleneck" : ""} ${running && runStage === 3 ? "run-active" : ""}`,
      )}
      {renderCoreNode(
        "db",
        4,
        `${dataset} GB · ${Math.round(nodeMetrics.db.utilization)}% load`,
        `n-db backend-node ${dataset > 650 ? "node-stressed" : ""} ${showBottleneck && bottleneckId === "db" ? "stress-bottleneck" : ""} ${running && runStage === 4 ? "run-active" : ""}`,
      )}

      {addedComponents.map((component, index) => {
        const kind = getNodeKind(component.name);

        return (
          <CanvasNode
            nodeId={component.id}
            kind={kind}
            connecting={connectingFrom === component.id}
            onConnect={onConnect}
            key={component.id}
            basePoint={getAddedNodeBasePoint(index)}
            offset={offset(component.id)}
            onOffset={(value) => onOffset(component.id, value)}
            styleClass={`n-added added-${index} ${layerClassFor(component.name)} ${analysisFocusIds.includes(component.id) ? "analysis-focus" : ""}`}
            title={component.name}
            sub={customRuntimeStat(component.name)}
            properties={propertiesFor(component.id, component.name)}
            selected={selectedId === component.id || selectedIds.includes(component.id)}
            onClick={() => onSelect(component.id, component.name)}
            onDrag={onDrag}
          />
        );
      })}
    </>
  );
}

interface NodeActionMenuProps {
  // Node center in canvas units (percent-based) plus its drag offset in pixels.
  base: NodeOffset;
  shift: NodeOffset;
  aiEnabled: boolean;
  onAskArchie: () => void;
  onConfigure: () => void;
  onDelete: () => void;
}

// A small menu attached above the selected component, with exactly three actions. It is
// placed inside the canvas scene, so it moves and zooms with the node.
export function NodeActionMenu({
  base,
  shift,
  aiEnabled,
  onAskArchie,
  onConfigure,
  onDelete,
}: NodeActionMenuProps) {
  return (
    <div
      className="node-action-menu"
      role="toolbar"
      aria-label="Selected component actions"
      style={{
        left: `${base.x / 10}%`,
        top: `${base.y / 6.5}%`,
        transform: `translate(calc(-50% + ${shift.x}px), calc(-100% + ${shift.y}px - 52px))`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={onAskArchie}
        disabled={!aiEnabled}
        title={aiEnabled ? "Ask Archie about this component" : "Archie is not enabled"}
      >
        Ask Archie
      </button>
      <button type="button" onClick={onConfigure}>
        Configure
      </button>
      <button type="button" className="is-danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

interface LiveMetricsProps {
  mode: Mode;
  healthScore: number;
  p95Latency: number;
  traffic: number;
  readRatio: number;
  availability: number;
  monthlyCost: number;
  dataset: number;
  controlsOpen: boolean;
  onToggleControls: () => void;
}

export function LiveMetrics({
  mode,
  healthScore,
  p95Latency,
  traffic,
  readRatio,
  availability,
  monthlyCost,
  dataset,
  controlsOpen,
  onToggleControls,
}: LiveMetricsProps) {
  return (
    <div className={`live-metrics ${mode === "learn" ? "metrics-five" : ""}`}>
      {mode === "learn" && (
        <Metric
          label="HEALTH"
          value={`${healthScore}%`}
          delta={healthScore >= 80 ? "Healthy" : "Fair"}
          bad={healthScore < 60}
        />
      )}
      <Metric
        label="LATENCY"
        value={`${p95Latency} ms`}
        delta={p95Latency < 100 ? "Good" : "High"}
        bad={p95Latency >= 100}
      />
      <Metric
        label="THROUGHPUT"
        value={`${(traffic / 1000).toFixed(1)}k/s`}
        delta={`${readRatio}% reads`}
      />
      <Metric
        label="AVAILABILITY"
        value={`${availability.toFixed(2)}%`}
        delta="Live"
      />
      <Metric label="EST. COST" value={`$${monthlyCost}/mo`} delta={`${dataset}GB`} />
      <Button
        variant="ghost"
        size="md"
        className={controlsOpen ? "active" : ""}
        selected={controlsOpen}
        onClick={onToggleControls}
      >
        <Icon name="sliders" />
        <span>Simulation controls</span>
      </Button>
    </div>
  );
}
