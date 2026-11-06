import { useEffect, useRef } from "react";
import { useReactFlow, useStore, type Edge } from "@xyflow/react";

import { ARCHITECTURE_NODE_SIZE } from "../../lib/architecture/nodeLayout";
import { viewportAfterShrink } from "../../lib/architecture/viewportFit";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

const PAN_MS = 200;

// A right panel narrows the canvas, and React Flow keeps the view where it was, so components
// near the right edge would be cut off. This moves them back into the space that is left.
export function useKeepNodesInView(minZoom: number) {
  const { getNodes, getViewport, setViewport } = useReactFlow<ArchitectureFlowNode, Edge>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const previous = useRef({ width, height });

  useEffect(() => {
    const before = previous.current;
    previous.current = { width, height };
    if (!before.width || width >= before.width) return;

    const nodes = getNodes();
    // Moving the view mid-drag would pull the component out from under the pointer.
    if (nodes.some((node) => node.dragging)) return;
    const next = viewportAfterShrink(
      nodes.map((node) => ({
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? ARCHITECTURE_NODE_SIZE.width,
        height: node.measured?.height ?? ARCHITECTURE_NODE_SIZE.height,
      })),
      getViewport(),
      before,
      { width, height },
      minZoom,
    );
    if (!next) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void setViewport(next, { duration: reduced ? 0 : PAN_MS });
  }, [width, height, minZoom, getNodes, getViewport, setViewport]);
}
