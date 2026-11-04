import { BaseEdge, Position, type EdgeProps } from "@xyflow/react";

import { arrowHeadPath, getOrthogonalEdgePath } from "../../lib/architecture/edgeRouting";

// The breakdown shares this route.
export { getOrthogonalEdgePath };

export default function OrthogonalEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getOrthogonalEdgePath(props);
  const targetSide = props.targetPosition ?? Position.Left;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={props.style}
        label={props.label}
        labelX={labelX}
        labelY={labelY}
        interactionWidth={props.interactionWidth}
      />
      <path className="ax-edge-arrow" d={arrowHeadPath(props.targetX, props.targetY, targetSide)} />
    </>
  );
}
