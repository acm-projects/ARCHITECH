import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import {
  copySelection,
  duplicateSelection,
  pasteClipboard,
  type ClipboardContent,
} from "../../lib/architecture/clipboard";
import type { NodeIdAllocator } from "../../lib/architecture/nodeIds";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// The editor's own clipboard. It lives in memory, not in the system clipboard, and holds
// no ids, so it is safe to paste into another project. `pastes` counts pastes since the
// last copy, so each one lands a step further from the original.
let clipboard: { content: ClipboardContent; pastes: number } | null = null;

// Copy, paste and duplicate. Each returns true when it did something. The graph logic is
// in lib/architecture/clipboard; a paste or duplicate sets nodes and edges together, so
// it is one change for history and for autosave.
export function useGraphClipboard({
  nodes,
  edges,
  setNodes,
  setEdges,
  allocate,
}: {
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<ArchitectureFlowNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  allocate: NodeIdAllocator;
}) {
  const copy = useCallback(() => {
    const content = copySelection({ nodes, edges });
    if (!content) return false;
    clipboard = { content, pastes: 0 };
    return true;
  }, [nodes, edges]);

  const paste = useCallback(() => {
    if (!clipboard) return false;
    clipboard.pastes += 1;
    const { graph } = pasteClipboard({ nodes, edges }, clipboard.content, allocate, clipboard.pastes);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    return true;
  }, [nodes, edges, allocate, setNodes, setEdges]);

  const duplicate = useCallback(() => {
    const result = duplicateSelection({ nodes, edges }, allocate);
    if (!result) return false;
    setNodes(result.graph.nodes);
    setEdges(result.graph.edges);
    return true;
  }, [nodes, edges, allocate, setNodes, setEdges]);

  return { copy, paste, duplicate };
}
