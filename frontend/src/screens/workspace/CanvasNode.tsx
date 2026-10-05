import { useEffect, useRef, useState, type PointerEvent } from "react";

import { Icon } from "../../components/ui";
import {
  getNodeDefinition,
  getNodeSummary,
  type NodeKind,
  type NodePropertyValues,
} from "./workspaceData";
import type { NodeOffset } from "./workspaceModel";

interface CanvasNodeProps {
  nodeId: string;
  title: string;
  sub: string;
  kind: NodeKind;
  properties: NodePropertyValues;
  styleClass: string;
  selected?: boolean;
  connecting?: boolean;
  onClick: () => void;
  onConnect?: (id: string, portId: string) => void;
  onDrag: (active: boolean) => void;
  offset?: NodeOffset;
  basePoint: NodeOffset;
  onOffset?: (value: NodeOffset) => void;
}

export function CanvasNode({
  nodeId,
  title,
  sub,
  kind,
  properties,
  styleClass,
  selected,
  connecting,
  onClick,
  onConnect,
  onDrag,
  offset = { x: 0, y: 0 },
  basePoint,
  onOffset,
}: CanvasNodeProps) {
  const [localOffset, setLocalOffset] = useState(offset);
  const [start, setStart] = useState<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const moved = useRef(false);
  const definition = getNodeDefinition(kind);
  const summary = getNodeSummary(kind, properties);

  useEffect(() => {
    setLocalOffset(offset);
  }, [offset.x, offset.y]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start) return;

    const rawX = event.clientX - start.x + start.ox;
    const rawY = event.clientY - start.y + start.oy;
    const value = {
      x: Math.round(rawX / 12) * 12,
      y: Math.round(rawY / 12) * 12,
    };

    if (Math.abs(event.clientX - start.x) > 3 || Math.abs(event.clientY - start.y) > 3) {
      moved.current = true;
    }

    setLocalOffset(value);
    onOffset?.(value);
  };

  const finishDrag = () => {
    setStart(null);
    onDrag(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-node-id={nodeId}
      aria-label={`${definition.label}: ${title}`}
      aria-pressed={selected}
      title={`Select ${title}`}
      onClick={() => {
        if (!moved.current) onClick();
        moved.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        moved.current = false;
        setStart({
          x: event.clientX,
          y: event.clientY,
          ox: localOffset.x,
          oy: localOffset.y,
        });
        onDrag(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        left: `${basePoint.x / 10}%`,
        top: `${basePoint.y / 6.5}%`,
        transform: `translate(calc(-50% + ${localOffset.x}px), calc(-50% + ${localOffset.y}px))`,
      }}
      className={`canvas-node architecture-node node-${kind} ${styleClass} ${selected ? "selected" : ""} ${connecting ? "connecting" : ""}`}
    >
      <span className="node-visual" aria-hidden="true">
        <Icon name={definition.icon} size={19} />
      </span>

      <span className="node-content">
        <span className="node-kicker">{definition.label}</span>
        <span className="node-title-row">
          <b>{title}</b>
          <i className="node-state" />
        </span>
        <small className="node-config-summary">{summary}</small>
        <small className="node-runtime-stat">{sub}</small>
      </span>

      {definition.ports.map((port) => (
        <button
          type="button"
          aria-label={`${port.label} port on ${title}`}
          title={`${port.label} · ${port.direction}`}
          data-tooltip={`${port.label} · ${port.direction}`}
          key={port.id}
          className={`connector-handle architecture-port ${port.side} port-${port.direction}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onConnect?.(nodeId, port.id);
          }}
        >
          <span>{port.label}</span>
        </button>
      ))}
    </div>
  );
}
