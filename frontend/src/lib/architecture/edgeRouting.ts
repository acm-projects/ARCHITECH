import { getSmoothStepPath, Position, type EdgeProps } from "@xyflow/react";

import { ARCHITECTURE_NODE_SIZE } from "./nodeLayout.ts";

// Right-angle route that leaves and enters each handle on the handle's own side, with a short
// stub before the first turn, so back-edges and stacked components still read in the direction
// traffic flows. Returns [path, labelX, labelY, offsetX, offsetY] like React Flow's helpers.
export const EDGE_STUB = 12;
// How far a back-edge's detour stays from the centre of the components it passes: clear of
// the component itself by one stub.
export const EDGE_DETOUR = ARCHITECTURE_NODE_SIZE.height / 2 + EDGE_STUB;
// A forward connection turns this far in front of its target, not halfway between the two
// components. Component widths follow their text, so a midpoint would differ per source;
// a fixed lane lets everything entering a component run together into one arrow.
export const EDGE_TARGET_LANE = 24;

// Room a connection needs between two components to run straight from one side to the other:
// a stub out, a turn, and the arrow.
export const EDGE_MIN_GAP = 40;

export type EdgeBox = { x: number; y: number; width: number; height: number };
export type EdgeSides = { sourcePosition: Position; targetPosition: Position };

export const FORWARD_SIDES: EdgeSides = { sourcePosition: Position.Right, targetPosition: Position.Left };

// The sides of two components that face each other, so a connection takes the short way round
// wherever they are moved. Traffic left to right keeps its usual route; anything else leaves
// from the side nearest the target. Boxes too close to clear each other stay on the usual
// route, which detours around them.
export function facingSides(source: EdgeBox, target: EdgeBox): EdgeSides {
  const gapRight = target.x - (source.x + source.width);
  const gapLeft = source.x - (target.x + target.width);
  const gapBelow = target.y - (source.y + source.height);
  const gapAbove = source.y - (target.y + target.height);
  if (gapRight >= EDGE_MIN_GAP) return FORWARD_SIDES;

  const gapVertical = Math.max(gapBelow, gapAbove);
  if (gapVertical >= EDGE_MIN_GAP && gapVertical >= gapLeft) {
    return gapBelow >= gapAbove
      ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
      : { sourcePosition: Position.Top, targetPosition: Position.Bottom };
  }
  if (gapLeft >= EDGE_MIN_GAP) return { sourcePosition: Position.Left, targetPosition: Position.Right };
  return FORWARD_SIDES;
}

// The middle of one side of a component.
export function sideAnchor(box: EdgeBox, side: Position): { x: number; y: number } {
  switch (side) {
    case Position.Left: return { x: box.x, y: box.y + box.height / 2 };
    case Position.Right: return { x: box.x + box.width, y: box.y + box.height / 2 };
    case Position.Top: return { x: box.x + box.width / 2, y: box.y };
    case Position.Bottom: return { x: box.x + box.width / 2, y: box.y + box.height };
  }
}

// A plug is centred on the component's border (7px wide, `.ax-handle` in the stylesheet), and a
// line lands on its outer edge. Handles measure out to the same point, so every side matches.
const PLUG_RADIUS = 3.5;

// Where a line meets the plug on one side of a component.
export function plugAnchor(box: EdgeBox, side: Position): { x: number; y: number } {
  const { x, y } = sideAnchor(box, side);
  const outward = OUTWARD[side];
  return { x: x + outward.x * PLUG_RADIUS, y: y + outward.y * PLUG_RADIUS };
}

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
  const forward = sourcePosition === Position.Right && targetPosition === Position.Left;
  return getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: EDGE_STUB,
    centerX: forward ? Math.max(sourceX + EDGE_STUB, targetX - EDGE_TARGET_LANE) : undefined,
  });
}

// The arrow points into the target along the side it enters.
// A focused connection carries a heavier line, so its arrow grows with it.
const ARROW = { idle: { length: 8, halfWidth: 4 }, active: { length: 8, halfWidth: 6 } } as const;
// The tip stops just short of the handle so the arrow and the dot stay two separate shapes.
const ARROW_HANDLE_GAP = 1;
// The line runs slightly under the arrow so no seam shows at its base.
const ARROW_LINE_OVERLAP = 1;
const OUTWARD: Record<Position, { x: number; y: number }> = {
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
};

// Where a connection into a handle ends: the arrow's tip, and the point its line stops at.
export function connectionEnd(x: number, y: number, side: Position) {
  const outward = OUTWARD[side];
  const lineBack = ARROW_HANDLE_GAP + ARROW.idle.length - ARROW_LINE_OVERLAP;
  return {
    tipX: x + outward.x * ARROW_HANDLE_GAP,
    tipY: y + outward.y * ARROW_HANDLE_GAP,
    lineX: x + outward.x * lineBack,
    lineY: y + outward.y * lineBack,
  };
}

export function arrowHeadPath(x: number, y: number, side: Position, active = false): string {
  const { length: l, halfWidth: w } = active ? ARROW.active : ARROW.idle;
  switch (side) {
    case Position.Left: return `M${x} ${y}L${x - l} ${y - w}L${x - l} ${y + w}Z`;
    case Position.Right: return `M${x} ${y}L${x + l} ${y - w}L${x + l} ${y + w}Z`;
    case Position.Top: return `M${x} ${y}L${x - w} ${y - l}L${x + w} ${y - l}Z`;
    case Position.Bottom: return `M${x} ${y}L${x - w} ${y + l}L${x + w} ${y + l}Z`;
  }
}
