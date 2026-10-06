import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useReactFlow } from "@xyflow/react";

import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// Selection, rename and delete for the selected node. Not mounted while the Properties
// panel is out of the layout; kept so it can be reused by the next inspector.
export function useNodeEditing(
  nodes: ArchitectureFlowNode[],
  setNodes: Dispatch<SetStateAction<ArchitectureFlowNode[]>>,
) {
  const { deleteElements } = useReactFlow();

  // React Flow marks the clicked node as `selected` inside `nodes` (and clears it when
  // the empty canvas is clicked).
  const selectedNode = nodes.find((node) => node.selected);

  const renameNode = useCallback(
    (nodeId: string, name: string) =>
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, label: name } } : node,
        ),
      ),
    [setNodes],
  );

  // deleteElements is the same path as keyboard deletion: React Flow also removes
  // every edge connected to the deleted node.
  const deleteNode = useCallback(
    (nodeId: string) => {
      void deleteElements({ nodes: [{ id: nodeId }] });
    },
    [deleteElements],
  );

  return { selectedNode, renameNode, deleteNode };
}
