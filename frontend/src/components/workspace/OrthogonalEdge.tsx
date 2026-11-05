import type { ReactNode } from "react";
import { BaseEdge, EdgeLabelRenderer, Position, useStore, type ConnectionLineComponentProps, type EdgeProps } from "@xyflow/react";

import { arrowHeadPath, connectionEnd, getOrthogonalEdgePath } from "../../lib/architecture/edgeRouting";

function EdgeLabel({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <EdgeLabelRenderer>
      <span className="ax-edge-label" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>{children}</span>
    </EdgeLabelRenderer>
  );
}

export type EdgeRoute = (props: EdgeProps) => readonly [path: string, labelX: number, labelY: number, ...unknown[]];

// The one connection drawing, for the project canvas and every breakdown: change the line,
// arrow or label here and in the `.react-flow__edge` rules and both follow. `route` replaces
// the default path for hand-drawn lanes; `lit` marks a connection in use by a live preview.
export function ArchitectureEdge({ route = getOrthogonalEdgePath, lit = false, ...props }: EdgeProps & { route?: EdgeRoute; lit?: boolean }) {
  const { id, source, target, selected, style, label, interactionWidth } = props;
  const targetSide = props.targetPosition ?? Position.Left;
  const end = connectionEnd(props.targetX, props.targetY, targetSide);
  // The line stops at the base of the arrow, so the arrow keeps a clean point.
  const [path, labelX, labelY] = route({ ...props, targetX: end.lineX, targetY: end.lineY });
  // Read from React Flow's store so highlighting never touches the saved edges.
  const componentFocused = useStore((state) =>
    Boolean(state.nodeLookup.get(source)?.selected || state.nodeLookup.get(target)?.selected));
  const highlighted = componentFocused || lit;
  const state = `${highlighted ? " is-active" : ""}${lit ? " is-lit" : ""}`;
  return (
    <>
      <BaseEdge id={id} path={path} className={state.trim() || undefined} style={style} interactionWidth={interactionWidth} />
      <path className={`ax-edge-arrow${state}`} d={arrowHeadPath(end.tipX, end.tipY, targetSide, highlighted || Boolean(selected))} />
      {/* A connection names itself only while it or one of its components is in focus. */}
      {(componentFocused || selected) && label && <EdgeLabel x={labelX} y={labelY}>{label}</EdgeLabel>}
    </>
  );
}

export default function OrthogonalEdge(props: EdgeProps) {
  return <ArchitectureEdge {...props} />;
}

// The line under the cursor while connecting takes the route and arrow the finished edge
// will have, so nothing jumps on release.
export function ConnectionPreview({ fromX, fromY, toX, toY, fromPosition, toPosition, fromHandle, connectionStatus }: ConnectionLineComponentProps) {
  // A drag can start from an input handle; the traffic still flows into it.
  const reversed = fromHandle.type === "target";
  const [start, finish] = reversed
    ? [{ x: toX, y: toY, side: toPosition }, { x: fromX, y: fromY, side: fromPosition }]
    : [{ x: fromX, y: fromY, side: fromPosition }, { x: toX, y: toY, side: toPosition }];
  const end = connectionEnd(finish.x, finish.y, finish.side);
  const [path] = getOrthogonalEdgePath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: start.side,
    targetX: end.lineX,
    targetY: end.lineY,
    targetPosition: finish.side,
  });
  const invalid = connectionStatus === "invalid";
  return (
    <g className={invalid ? "ax-connection-preview is-invalid" : "ax-connection-preview"}>
      <path className="react-flow__connection-path" fill="none" d={path} />
      <path className="ax-edge-arrow is-active" d={arrowHeadPath(end.tipX, end.tipY, finish.side, true)} />
    </g>
  );
}
