import { getSmoothStepPath, Position, type EdgeProps } from "@xyflow/react";

// Right-angle route that leaves and enters each handle on the handle's own side, with a short
// stub before the first turn, so back-edges and stacked components still read in the direction
// traffic flows. Returns [path, labelX, labelY, offsetX, offsetY] like React Flow's helpers.
export const EDGE_STUB = 12;
// How far a back-edge's detour stays from the centre of the components it passes.
export const EDGE_DETOUR = 26;

type RouteProps = Pick<EdgeProps, "sourceX" | "sourceY" | "targetX" | "targetY" | "sourcePosition" | "targetPosition">;

export function getOrthogonalEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: RouteProps): [string, number, number, number, number] {
  // A back-edge: out of a right-hand handle into a left-hand handle that is not far enough to
  // the right. Step routing would run back through both components, so go out by the stub,
  // turn into the gap between the rows (or below both when they share a row), cross over, and
  // enter the target from its own side.
  if (sourcePosition === Position.Right && targetPosition === Position.Left && targetX < sourceX + 2 * EDGE_STUB) {
    const outX = sourceX + EDGE_STUB;
    const inX = targetX - EDGE_STUB;
    const gap = Math.abs(targetY - sourceY);
    const crossY = gap >= 2 * EDGE_DETOUR ? (sourceY + targetY) / 2 : Math.max(sourceY, targetY) + EDGE_DETOUR;
    const path = `M${sourceX} ${sourceY}H${outX}V${crossY}H${inX}V${targetY}H${targetX}`;
    const labelX = (outX + inX) / 2;
    return [path, labelX, crossY, Math.abs(labelX - sourceX), Math.abs(crossY - sourceY)];
  }
  return getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: EDGE_STUB,
  });
}

// The arrow points into the target along the side it enters, so its tip sits on the handle.
const ARROW_LENGTH = 6;
const ARROW_HALF_WIDTH = 3;

export function arrowHeadPath(x: number, y: number, side: Position): string {
  const l = ARROW_LENGTH;
  const w = ARROW_HALF_WIDTH;
  switch (side) {
    case Position.Left: return `M${x} ${y}L${x - l} ${y - w}L${x - l} ${y + w}Z`;
    case Position.Right: return `M${x} ${y}L${x + l} ${y - w}L${x + l} ${y + w}Z`;
    case Position.Top: return `M${x} ${y}L${x - w} ${y - l}L${x + w} ${y - l}Z`;
    case Position.Bottom: return `M${x} ${y}L${x - w} ${y + l}L${x + w} ${y + l}Z`;
  }
}
