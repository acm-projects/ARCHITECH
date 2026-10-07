import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import {
  applySnapshot,
  createGraphHistory,
  toSnapshot,
  type GraphHistory,
} from "../../lib/architecture/graphHistory";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// Undo and redo for the nodes and edges. Nothing needs to be called when something
// changes: it watches the graph and records each real change, so every way of editing
// (dropping, connecting, deleting, renaming, resetting, pasting) is covered the same way.
// A node being dragged is recorded once, when the drag ends. `scopeKey` (the project id)
// gives each project its own history, so one project's undo can never touch another's.
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
  const session = useRef<{ scopeKey: string | null; history: GraphHistory } | null>(null);

  const historyFor = useCallback(() => {
    if (!session.current || session.current.scopeKey !== scopeKey) {
      session.current = { scopeKey, history: createGraphHistory(toSnapshot(nodes, edges)) };
    }
    return session.current.history;
  }, [scopeKey, nodes, edges]);

  useEffect(() => {
    // A drag is recorded once, after it ends, so while one is going on there is nothing to
    // copy: skipping here saves a full copy of the graph on every frame of the drag.
    if (nodes.some((node) => node.dragging)) return;
    historyFor().observe(toSnapshot(nodes, edges));
  }, [historyFor, nodes, edges]);

  const restore = useCallback(
    (snapshot: ReturnType<GraphHistory["undo"]>) => {
      if (!snapshot) return false;
      const next = applySnapshot({ nodes, edges }, snapshot);
      setNodes(next.nodes);
      setEdges(next.edges);
      return true;
    },
    [nodes, edges, setNodes, setEdges],
  );

  // A drag in progress is not part of the history yet, so it is not undone from under the user.
  const busy = nodes.some((node) => node.dragging);

  const undo = useCallback(() => !busy && restore(historyFor().undo()), [busy, restore, historyFor]);
  const redo = useCallback(() => !busy && restore(historyFor().redo()), [busy, restore, historyFor]);

  // Replaces the whole graph (Reset) as ONE history step. The graph on screen is recorded first,
  // so the step undo returns to is exactly what was there, even if the watcher above has not
  // seen it yet; the replacement is then recorded directly, so the watcher finds nothing new
  // to record. Undo restores nodes, edges, positions and settings together; redo replays it.
  const replaceGraph = useCallback(
    (next: { nodes: ArchitectureFlowNode[]; edges: Edge[] }) => {
      const history = historyFor();
      history.observe(toSnapshot(nodes, edges));
      history.commit(toSnapshot(next.nodes, next.edges));
      setNodes(next.nodes);
      setEdges(next.edges);
    },
    [historyFor, nodes, edges, setNodes, setEdges],
  );

  return { undo, redo, replaceGraph };
}
