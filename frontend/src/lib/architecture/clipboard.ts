import { connectionId } from "./connections.ts";
import type { NodeIdAllocator } from "./nodeIds.ts";
import type { EdgeLike, GraphState, NodeLike } from "./nodeOperations.ts";
import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// Copy, paste and duplicate share one description of a piece of graph: the selected nodes
// with their types, labels, properties and positions, and the edges that run between
// them. It holds no node or edge ids and no selection state, so pasting can only create
// new items and can never touch the originals.

export type ClipboardNode = {
  type: ArchitectureNodeType;
  label: string;
  properties?: NodeProperties;
  // Relative to `origin`.
  offset: { x: number; y: number };
  nodeType?: string;
};
export type ClipboardEdge = {
  // Indexes into `nodes`.
  from: number;
  to: number;
  sourceHandle?: string;
  targetHandle?: string;
};
export type ClipboardContent = {
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
  // Top-left of the copied nodes when they were copied.
  origin: { x: number; y: number };
};

// How far each paste moves from the original, so it never lands exactly on top of it.
export const PASTE_OFFSET = 24;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// What the selected nodes look like, or null when no node is selected (a selected edge on
// its own copies nothing). Edges are included only when both ends are selected.
export function copySelection<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
): ClipboardContent | null {
  const selected = graph.nodes.filter((node) => node.selected);
  if (selected.length === 0) return null;

  const origin = {
    x: Math.min(...selected.map((node) => node.position.x)),
    y: Math.min(...selected.map((node) => node.position.y)),
  };
  const indexById = new Map(selected.map((node, index) => [node.id, index]));

  const edges: ClipboardEdge[] = [];
  for (const edge of graph.edges) {
    const from = indexById.get(edge.source);
    const to = indexById.get(edge.target);
    if (from === undefined || to === undefined || from === to) continue;
    edges.push({
      from,
      to,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    });
  }

  return {
    origin,
    edges,
    nodes: selected.map((node) => ({
      type: node.data.type,
      label: node.data.label,
      ...(node.data.properties ? { properties: clone(node.data.properties) } : {}),
      offset: { x: node.position.x - origin.x, y: node.position.y - origin.y },
      ...(node.type === undefined ? {} : { nodeType: node.type }),
    })),
  };
}

// Adds a copy of `content` to the graph, `steps` paste offsets away from where it was
// copied (1 for the first paste, 2 for the next, and so on). Every node gets a new id from
// `allocate`, every edge a new id, and the pasted nodes become the only selection.
// Returns the new graph in one piece, so it is one change.
export function pasteClipboard<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
  content: ClipboardContent,
  allocate: NodeIdAllocator,
  steps = 1,
): { graph: GraphState<N, E>; nodeIds: string[] } {
  const taken = graph.nodes.map((node) => node.id);
  const nodeIds: string[] = [];
  for (const item of content.nodes) {
    const id = allocate(item.type, [...taken, ...nodeIds]);
    nodeIds.push(id);
  }

  const shift = steps * PASTE_OFFSET;
  const pasted = content.nodes.map(
    (item, index) =>
      ({
        id: nodeIds[index],
        ...(item.nodeType === undefined ? {} : { type: item.nodeType }),
        position: {
          x: content.origin.x + item.offset.x + shift,
          y: content.origin.y + item.offset.y + shift,
        },
        data: {
          type: item.type,
          label: item.label,
          ...(item.properties ? { properties: clone(item.properties) } : {}),
        },
        selected: true,
      }) as unknown as N,
  );

  const edges = content.edges.map(
    (edge) =>
      ({
        id: connectionId({
          source: nodeIds[edge.from],
          target: nodeIds[edge.to],
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        }),
        source: nodeIds[edge.from],
        target: nodeIds[edge.to],
        ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      }) as unknown as E,
  );

  const deselect = <T extends { selected?: boolean }>(items: T[]): T[] =>
    items.map((item) => (item.selected ? { ...item, selected: false } : item));

  return {
    graph: {
      nodes: [...deselect(graph.nodes), ...pasted],
      edges: [...deselect(graph.edges), ...edges],
    },
    nodeIds,
  };
}

// Duplicate is copy followed by one paste, with nothing left on the clipboard. Returns
// null when no node is selected.
export function duplicateSelection<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
  allocate: NodeIdAllocator,
): { graph: GraphState<N, E>; nodeIds: string[] } | null {
  const content = copySelection(graph);
  return content ? pasteClipboard(graph, content, allocate, 1) : null;
}
