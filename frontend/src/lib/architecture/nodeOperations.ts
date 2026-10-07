import { generateNodeId, type NodeIdAllocator } from "./nodeIds.ts";
import { sanitizeNodeProperties } from "./nodeProperties.ts";
import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// Pure edits to a graph. Each takes the current nodes and edges and returns new ones,
// leaving its input untouched. When an edit changes nothing it returns the very same
// array, so callers (and React) can tell that nothing happened. Written against minimal
// structural types, so they accept React Flow nodes and edges and return the same types.

export type NodeLike = {
  id: string;
  type?: string;
  selected?: boolean;
  position: { x: number; y: number };
  data: { type: ArchitectureNodeType; label: string; properties?: NodeProperties };
};
export type EdgeLike = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  selected?: boolean;
};

export type GraphState<N extends NodeLike, E extends EdgeLike> = {
  nodes: N[];
  edges: E[];
};

// ---- Nodes ----

// Adds a node of `type`, selected and alone in being selected. `build` receives the id,
// which is unique among all existing nodes, and returns the node. Pass a session
// allocator (createNodeIdAllocator) to also avoid ids that were used and then deleted.
export function addNode<N extends NodeLike>(
  nodes: N[],
  type: ArchitectureNodeType,
  build: (id: string) => N,
  allocate: NodeIdAllocator = generateNodeId,
): { nodes: N[]; nodeId: string } {
  const nodeId = allocate(type, nodes.map((node) => node.id));
  const added: N = { ...build(nodeId), selected: true };
  return {
    nodes: [...nodes.map((node) => (node.selected ? { ...node, selected: false } : node)), added],
    nodeId,
  };
}

// Moves one node. Every other field of it, and every other node, is untouched.
export function moveNode<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  position: { x: number; y: number },
): N[] {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (
    !node ||
    !Number.isFinite(position?.x) ||
    !Number.isFinite(position?.y) ||
    (node.position.x === position.x && node.position.y === position.y)
  ) {
    return nodes;
  }
  return nodes.map((candidate) =>
    candidate.id === nodeId ? { ...candidate, position: { x: position.x, y: position.y } } : candidate,
  );
}

// ---- Removing ----

// Removes the given nodes and edges. Edges attached to a removed node go with it, and
// so does any edge that points at a node that is not there.
export function removeFromGraph<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
  ids: { nodeIds?: Iterable<string>; edgeIds?: Iterable<string> },
): GraphState<N, E> {
  const removedNodes = new Set(ids.nodeIds ?? []);
  const removedEdges = new Set(ids.edgeIds ?? []);

  const nodes = graph.nodes.filter((node) => !removedNodes.has(node.id));
  const remaining = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) =>
      !removedEdges.has(edge.id) && remaining.has(edge.source) && remaining.has(edge.target),
  );

  return {
    nodes: nodes.length === graph.nodes.length ? graph.nodes : nodes,
    edges: edges.length === graph.edges.length ? graph.edges : edges,
  };
}

// Removes everything that is currently selected, with the edges attached to it.
export function removeSelected<N extends NodeLike, E extends EdgeLike>(
  graph: GraphState<N, E>,
): GraphState<N, E> {
  return removeFromGraph(graph, {
    nodeIds: graph.nodes.filter((node) => node.selected).map((node) => node.id),
    edgeIds: graph.edges.filter((edge) => edge.selected).map((edge) => edge.id),
  });
}

// ---- Properties ----

export type PropertyUpdate<N extends NodeLike> =
  | {
      ok: true;
      nodes: N[];
      // False when the node already had exactly these properties; `nodes` is then the
      // same array that was passed in, and nothing needs saving.
      changed: boolean;
      // Keys of the patch that were not applied because they were invalid.
      rejectedKeys: string[];
    }
  | { ok: false; reason: "node-not-found" };

const NODE_NOT_FOUND = { ok: false, reason: "node-not-found" } as const;

const sameProperties = (a: NodeProperties | undefined, b: NodeProperties | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function withProperties<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  properties: NodeProperties | undefined,
): N[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const data = { ...node.data };
    delete data.properties;
    return { ...node, data: properties ? { ...data, properties } : data };
  });
}

// Merges `patch` into a node's properties. Entries are checked by the same sanitizer the
// project store uses on load, so only valid values are applied and the rest are listed in
// `rejectedKeys`; an invalid value never removes or replaces an existing valid one.
export function updateNodeProperties<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  patch: Record<string, unknown>,
): PropertyUpdate<N> {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return NODE_NOT_FOUND;

  const accepted = sanitizeNodeProperties(patch) ?? {};
  const next = sanitizeNodeProperties({ ...node.data.properties, ...accepted });
  const requested =
    typeof patch === "object" && patch !== null && !Array.isArray(patch) ? Object.keys(patch) : [];
  // Rejected: the value was invalid, or it was valid but fell outside the property limit.
  const rejectedKeys = requested.filter(
    (key) => !Object.hasOwn(accepted, key) || !next || !Object.hasOwn(next, key),
  );

  const current = sanitizeNodeProperties(node.data.properties);
  if (sameProperties(current, next)) {
    return { ok: true, nodes, changed: false, rejectedKeys };
  }
  return { ok: true, nodes: withProperties(nodes, nodeId, next), changed: true, rejectedKeys };
}

export function setNodeProperty<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  key: string,
  value: unknown,
): PropertyUpdate<N> {
  return updateNodeProperties(nodes, nodeId, { [key]: value });
}

// Removing the last property removes the `properties` field itself, so a node with no
// configuration looks the same as one that never had any.
export function removeNodeProperty<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  key: string,
): PropertyUpdate<N> {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return NODE_NOT_FOUND;

  const existing = node.data.properties;
  if (!existing || !Object.hasOwn(existing, key)) {
    return { ok: true, nodes, changed: false, rejectedKeys: [] };
  }
  const rest = { ...existing };
  delete rest[key];
  return {
    ok: true,
    nodes: withProperties(nodes, nodeId, sanitizeNodeProperties(rest)),
    changed: true,
    rejectedKeys: [],
  };
}
