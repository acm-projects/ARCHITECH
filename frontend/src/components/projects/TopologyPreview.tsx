import type { CSSProperties } from "react";

import { computePreview, selectPreviewAccent } from "./preview";
import { previewNodeColor } from "./previewColors";
import type { Project } from "./projectStore";

export default function TopologyPreview({ nodes, edges }: Pick<Project, "nodes" | "edges">) {
  const preview = computePreview(nodes, edges);
  const accentId = selectPreviewAccent(preview.nodes, edges);
  const nodeTypes = new Map(nodes.map(node => [node.id, node.data.type]));

  return (
    <svg viewBox="0 0 200 64" className="ax-topology-preview h-full w-full" aria-hidden="true">
      {preview.lines.map((line, index) => (
        <line
          key={index}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="var(--canvas-line-strong)"
          strokeWidth="0.75"
        />
      ))}
      {preview.nodes.map(node => {
        const color = previewNodeColor(nodeTypes.get(node.id) ?? "");
        return (
          <rect
            key={node.id}
            className={node.id === accentId ? "ax-preview-accent-node" : undefined}
            style={{ "--preview-accent": color } as CSSProperties}
            x={node.x - 6}
            y={node.y - 4.5}
            width="12"
            height="9"
            rx="1.5"
            fill={color}
            stroke={color}
            strokeWidth="0.75"
          />
        );
      })}
    </svg>
  );
}

