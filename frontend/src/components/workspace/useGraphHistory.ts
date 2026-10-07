import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Edge } from "@xyflow/react";

import {
  applySnapshot,
  createGraphHistory,
  toSnapshot,
  type GraphHistory,
} from "../../lib/architecture/graphHistory";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// Handles undo and redo for the whole architecture.
//
// We watch the graph instead of making every edit manually create a history entry.
// That means adding, deleting, connecting, moving, pasting, and resetting all go
// through the same history system.
//
// Each project gets its own history using scopeKey, so undo in one project
// can never affect another project.
export function useGraphHistory({
  scopeKey,
  nodes,
  edges,
  setNodes,
  setEdges,
}: {
  scopeKey: string | null;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<ArchitectureFlowNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}) {
  // Keep the current project's history around without causing rerenders.
  // If scopeKey changes, historyFor() will start a fresh history for the new project.
  const session = useRef<{
    scopeKey: string | null;
    history: GraphHistory;
  } | null>(null);

  // Get the history for the current project.
  // The first snapshot becomes the starting point for undo/redo.
  const historyFor = useCallback(() => {
    if (!session.current || session.current.scopeKey !== scopeKey) {
      session.current = {
        scopeKey,
        history: createGraphHistory(
          toSnapshot(nodes, edges),
        ),
      };
    }

    return session.current.history;
  }, [scopeKey, nodes, edges]);

  // Watch the graph and record real changes automatically.
  //
  // React Flow changes a node's position on every frame while dragging,
  // so we wait until the drag finishes and record the final position once.
  useEffect(() => {
    if (nodes.some((node) => node.dragging)) {
      return;
    }

    historyFor().observe(
      toSnapshot(nodes, edges),
    );
  }, [historyFor, nodes, edges]);

  // Put a saved history snapshot back onto the canvas.
  // Both nodes and edges are restored together so the graph stays consistent.
  const restore = useCallback(
    (snapshot: ReturnType<GraphHistory["undo"]>) => {
      if (!snapshot) {
        return false;
      }

      const next = applySnapshot(
        { nodes, edges },
        snapshot,
      );

      setNodes(next.nodes);
      setEdges(next.edges);

      return true;
    },
    [nodes, edges, setNodes, setEdges],
  );

  // Don't undo or redo while a node is still being dragged.
  // That drag has not been added to history yet, so changing history underneath
  // it could leave the canvas in a weird state.
  const busy = nodes.some((node) => node.dragging);

  const undo = useCallback(
    () =>
      !busy &&
      restore(historyFor().undo()),
    [busy, restore, historyFor],
  );

  const redo = useCallback(
    () =>
      !busy &&
      restore(historyFor().redo()),
    [busy, restore, historyFor],
  );

  // Replace the entire architecture as ONE history step.
  // Reset uses this so one Ctrl/Cmd+Z brings back the whole design from before the reset.
  //
  // We first record exactly what is currently on screen, then commit the replacement.
  // That keeps nodes, edges, positions, and node settings together in the same undo step.
  const replaceGraph = useCallback(
    (next: {
      nodes: ArchitectureFlowNode[];
      edges: Edge[];
    }) => {
      const history = historyFor();

      // Make sure the current graph is the exact state Undo should return to.
      history.observe(
        toSnapshot(nodes, edges),
      );

      // Record the replacement directly as the next history state.
      history.commit(
        toSnapshot(next.nodes, next.edges),
      );

      setNodes(next.nodes);
      setEdges(next.edges);
    },
    [
      historyFor,
      nodes,
      edges,
      setNodes,
      setEdges,
    ],
  );

  // The workspace only needs these three history actions.
  return {
    undo,
    redo,
    replaceGraph,
  };
}