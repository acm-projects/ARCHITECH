import type { CSSProperties } from "react";

import { ComponentGlyphGroup } from "../workspace/ComponentGlyph";
import { PREVIEW_BOX, computePreview, selectPreviewAccent } from "./preview";
import { previewNodeColor } from "./previewColors";
import type { Project } from "./projectStore";

const GLYPH_SIZE = 12;
const COUNT_WIDTH = 13;
const COUNT_HEIGHT = 9;

export default function TopologyPreview({ nodes, edges }: Pick<Project, "nodes" | "edges">) {
  const preview = computePreview(nodes, edges);
  const accentId = selectPreviewAccent(preview.nodes, preview.links);

  return (
    <svg viewBox={`0 0 ${preview.width} ${preview.height}`} className="ax-topology-preview h-full w-full" aria-hidden="true">
      {preview.links.map(link => (
        <path key={`${link.source}-${link.target}`} className="ax-topology-link" d={link.path} />
      ))}
      {preview.nodes.map(node => {
        const left = node.x - PREVIEW_BOX / 2;
        const top = node.y - PREVIEW_BOX / 2;
        return (
          <g key={node.id} className="ax-topology-node" style={{ "--ax-family": previewNodeColor(node.type) } as CSSProperties}>
            <rect
              className={node.id === accentId ? "ax-topology-box ax-preview-accent-node" : "ax-topology-box"}
              x={left}
              y={top}
              width={PREVIEW_BOX}
              height={PREVIEW_BOX}
              rx="3"
            />
            <ComponentGlyphGroup
              type={node.type}
              className="ax-topology-glyph"
              x={node.x - GLYPH_SIZE / 2}
              y={node.y - GLYPH_SIZE / 2}
              size={GLYPH_SIZE}
            />
            {node.count > 1 && (
              <>
                <rect
                  className="ax-topology-count-box"
                  x={left + PREVIEW_BOX - COUNT_WIDTH / 2}
                  y={top - COUNT_HEIGHT / 2}
                  width={COUNT_WIDTH}
                  height={COUNT_HEIGHT}
                  rx="2"
                />
                <text className="ax-topology-count" x={left + PREVIEW_BOX} y={top}>×{node.count}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
