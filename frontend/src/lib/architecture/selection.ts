import type { EdgeLike, GraphState, NodeLike } from "./nodeOperations.ts";

// What is selected on the canvas. It is derived from the `selected` flags that React Flow
// keeps on nodes and edges, so nodes and edges stay the only source of truth: anything
// that reads the selection (a properties editor, a toolbar) can never hold on to an item
// that was deleted.
export type Selection =
  | { kind: "none" }
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string }
  | { kind: "multiple"; nodeIds: string[]; edgeIds: string[] };

const NONE: Selection = { kind: "none" };

export function getSelection(
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
): Selection {
  const nodeIds = nodes.filter((node) => node.selected).map((node) => node.id);
  const edgeIds = edges.filter((edge) => edge.selected).map((edge) => edge.id);

  if (nodeIds.length === 0 && edgeIds.length === 0) return NONE;
  if (nodeIds.length === 1 && edgeIds.length === 0) return { kind: "node", nodeId: nodeIds[0] };
  if (nodeIds.length === 0 && edgeIds.length === 1) return { kind: "edge", edgeId: edgeIds[0] };
  return { kind: "multiple", nodeIds, edgeIds };
}

function setSelected<T extends { id: string; selected?: boolean }>(
  items: T[],
  isSelected: (item: T) => boolean,
): T[] {
  let changed = false;
  const next = items.map((item) => {
    const selected = isSelected(item);
    if (Boolean(item.selected) === selected) return item;
    changed = true;
    return { ...item, selected };
  });
  return changed ? next : items;
}

// Deselects everything. Returns the same arrays when nothing was selected.
export function clearSelection<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
): GraphState<N, E> {
  return {
    nodes: setSelected(graph.nodes, () => false),
    edges: setSelected(graph.edges, () => false),
  };
}

// Selects only this node. An id that does not exist clears the selection instead, so the
// selection never points at nothing.
export function selectNode<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
  nodeId: string,
): GraphState<N, E> {
  if (!graph.nodes.some((node) => node.id === nodeId)) return clearSelection(graph);
  return {
    nodes: setSelected(graph.nodes, (node) => node.id === nodeId),
    edges: setSelected(graph.edges, () => false),
  };
}

// Selects only this edge, with the same rule for missing ids.
export function selectEdge<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
  edgeId: string,
): GraphState<N, E> {
  if (!graph.edges.some((edge) => edge.id === edgeId)) return clearSelection(graph);
  return {
    nodes: setSelected(graph.nodes, () => false),
    edges: setSelected(graph.edges, (edge) => edge.id === edgeId),
  };
}
