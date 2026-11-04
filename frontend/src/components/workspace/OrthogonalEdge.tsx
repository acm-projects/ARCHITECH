import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export function getOrthogonalEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps): [string, number, number, number, number] {
  return getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
}

export default function OrthogonalEdge(props: EdgeProps) {
  const [path] = getOrthogonalEdgePath(props);
  return <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} />;
}
