import {
  DEFAULT_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  record,
  redo,
  undo,
  type History,
} from "./history.ts";
import type { EdgeLike, GraphState, NodeLike } from "./nodeOperations.ts";

// What history remembers about a graph: the nodes and edges, and nothing else. Selection,
// measured sizes, the dragging flag and other React Flow UI state are not part of it, so
// changing any of those is never an undo step.
export type NodeSnapshot = Pick<NodeLike, "id" | "type" | "position" | "data">;
export type EdgeSnapshot = Pick<
  EdgeLike,
  "id" | "source" | "target" | "sourceHandle" | "targetHandle"
>;
export type GraphSnapshot = { nodes: NodeSnapshot[]; edges: EdgeSnapshot[] };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function nodeSnapshot(node: NodeLike): NodeSnapshot {
  return {
    id: node.id,
    ...(node.type === undefined ? {} : { type: node.type }),
    position: { x: node.position.x, y: node.position.y },
    data: clone(node.data),
  };
}

function edgeSnapshot(edge: EdgeLike): EdgeSnapshot {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  };
}

// A deep copy, so later edits to the live graph cannot change a remembered state.
export function toSnapshot(
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
): GraphSnapshot {
  return { nodes: nodes.map(nodeSnapshot), edges: edges.map(edgeSnapshot) };
}

export const snapshotKey = (snapshot: GraphSnapshot) => JSON.stringify(snapshot);

// Turns a remembered state back into live nodes and edges. An item that is unchanged
// keeps its live object, and with it its selection and measured size, so restoring does
// not make nodes flicker. Anything not in the snapshot is gone, which also means a deleted
// item cannot stay selected. Restored items come back unselected.
export function applySnapshot<N extends NodeLike, E extends EdgeLike>(
  current: GraphState<N, E>,
  snapshot: GraphSnapshot,
): GraphState<N, E> {
  const liveNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const liveEdges = new Map(current.edges.map((edge) => [edge.id, edge]));

  const nodes = snapshot.nodes.map((remembered) => {
    const live = liveNodes.get(remembered.id);
    const same = live && JSON.stringify(nodeSnapshot(live)) === JSON.stringify(remembered);
    return same ? live : (clone(remembered) as unknown as N);
  });
  const edges = snapshot.edges.map((remembered) => {
    const live = liveEdges.get(remembered.id);
    const same = live && JSON.stringify(edgeSnapshot(live)) === JSON.stringify(remembered);
    return same ? live : (clone(remembered) as unknown as E);
  });
  return { nodes, edges };
}

// A name for the kind of edit that turned `previous` into `next`, when it is the sort of
// edit that arrives in many small steps while typing: a node's label. Consecutive edits
// with the same name share one undo step. Anything else is null and always gets its own
// step. Property edits are deliberately not coalesced: each one is committed on purpose
// (see propertyEditing.ts), and merging "set to 3" with a later "reset" would make the 3
// impossible to undo back to.
export function coalesceKeyFor(previous: GraphSnapshot, next: GraphSnapshot): string | null {
  if (JSON.stringify(previous.edges) !== JSON.stringify(next.edges)) return null;
  if (previous.nodes.length !== next.nodes.length) return null;

  let changed = -1;
  for (let index = 0; index < next.nodes.length; index += 1) {
    if (previous.nodes[index].id !== next.nodes[index].id) return null;
    if (JSON.stringify(previous.nodes[index]) === JSON.stringify(next.nodes[index])) continue;
    if (changed !== -1) return null;
    changed = index;
  }
  if (changed === -1) return null;

  const before = previous.nodes[changed];
  const after = next.nodes[changed];
  const onlyLabelChanged =
    before.data.label !== after.data.label &&
    JSON.stringify(before.position) === JSON.stringify(after.position) &&
    before.type === after.type &&
    before.data.type === after.data.type &&
    JSON.stringify(before.data.properties ?? null) === JSON.stringify(after.data.properties ?? null);
  return onlyLabelChanged ? `label:${after.id}` : null;
}

// Undo and redo for one editing session of one graph. Create a new one for each project,
// so one project's history can never apply to another.
export function createGraphHistory(
  initial: GraphSnapshot,
  options: { limit?: number } = {},
) {
  let history: History<GraphSnapshot> = createHistory(initial, {
    key: snapshotKey,
    limit: options.limit ?? DEFAULT_HISTORY_LIMIT,
  });

  return {
    // Reports the graph as it is now. Returns true when it was recorded as a new undo step.
    // While a drag is in progress it does nothing: the whole drag is recorded once, from the
    // first report after it ends. Selection, measuring and other changes that leave the
    // snapshot equal are ignored.
    observe(next: GraphSnapshot, options: { dragging?: boolean } = {}): boolean {
      if (options.dragging) return false;
      const updated = record(history, next, coalesceKeyFor(history.present, next));
      const recorded = updated !== history;
      history = updated;
      return recorded;
    },

    // Records a deliberate whole-graph replacement (Reset) as exactly one step. Unlike observe,
    // it never merges with the edit before it, so undo always returns to the design as it was
    // just before the replacement, even when the two differ only by a label.
    commit(next: GraphSnapshot): boolean {
      const updated = record(history, next, null);
      const recorded = updated !== history;
      history = updated;
      return recorded;
    },

    // The state to restore, or null when there is nothing to undo.
    undo(): GraphSnapshot | null {
      const updated = undo(history);
      if (updated === history) return null;
      history = updated;
      return history.present;
    },

    redo(): GraphSnapshot | null {
      const updated = redo(history);
      if (updated === history) return null;
      history = updated;
      return history.present;
    },

    canUndo: () => canUndo(history),
    canRedo: () => canRedo(history),
    undoDepth: () => history.past.length,
  };
}

export type GraphHistory = ReturnType<typeof createGraphHistory>;
