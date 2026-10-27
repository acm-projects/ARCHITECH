import { BaseEdge, type EdgeProps } from "@xyflow/react";

export function getOrthogonalEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps): [string, number, number, number, number] {
  const middleX = sourceX + (targetX - sourceX) / 2;
  const middleY = sourceY + (targetY - sourceY) / 2;
  const path = `M ${sourceX} ${sourceY} H ${middleX} V ${targetY} H ${targetX}`;
  return [
    path,
    middleX,
    middleY,
    Math.abs(middleX - sourceX),
    Math.abs(middleY - sourceY),
  ];
}

export default function OrthogonalEdge(props: EdgeProps) {
  const [path] = getOrthogonalEdgePath(props);
  return <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} />;
}
