import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// Structural subsets of React Flow's node and edge, so React Flow nodes and edges can be
// passed in directly and everything here stays pure and independent of the UI.
export type GraphNode = {
  id: string;
  data: { type: ArchitectureNodeType; label?: string; properties?: NodeProperties };
};
export type GraphEdge = { source: string; target: string };
export type GraphInput = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
};

// A directed graph over any set of nodes. Only edges between nodes in the input are
// kept; self-loops and repeated edges are dropped.
export type DirectedGraph = {
  nodes: ReadonlyMap<string, GraphNode>;
  edges: readonly GraphEdge[];
  outgoing: ReadonlyMap<string, ReadonlySet<string>>;
  incoming: ReadonlyMap<string, ReadonlySet<string>>;
};

export function createDirectedGraph(input: GraphInput): DirectedGraph {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const id of nodes.keys()) {
    outgoing.set(id, new Set());
    incoming.set(id, new Set());
  }

  const edges: GraphEdge[] = [];
  for (const { source, target } of input.edges) {
    if (!nodes.has(source) || !nodes.has(target) || source === target) continue;
    if (outgoing.get(source)?.has(target)) continue;
    outgoing.get(source)?.add(target);
    incoming.get(target)?.add(source);
    edges.push({ source, target });
  }

  return { nodes, edges, outgoing, incoming };
}

// Breadth-first walk that includes the start ids and never enters `skip`.
function walk(
  adjacency: ReadonlyMap<string, Iterable<string>>,
  startIds: Iterable<string>,
  skip?: string,
): Set<string> {
  const visited = new Set<string>();
  const queue = [...startIds].filter((id) => id !== skip);

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (next !== skip && !visited.has(next)) queue.push(next);
    }
  }
  return visited;
}

// Every node reachable from any of `startIds` (the start nodes themselves included).
// `without` treats that node as removed, which is how single points of failure are found.
export function reachableFrom(
  graph: DirectedGraph,
  startIds: Iterable<string>,
  options: { without?: string } = {},
): Set<string> {
  const starts = [...startIds].filter((id) => graph.nodes.has(id));
  return walk(graph.outgoing, starts, options.without);
}

// Whether `startId` can reach any node in `targetIds` through at least one edge.
export function canReachAny(
  graph: DirectedGraph,
  startId: string,
  targetIds: ReadonlySet<string>,
): boolean {
  if (!graph.nodes.has(startId)) return false;
  const reached = walk(graph.outgoing, graph.outgoing.get(startId) ?? []);
  for (const id of reached) {
    if (id !== startId && targetIds.has(id)) return true;
  }
  return false;
}

// Longest simple path that starts at one of `startIds` and ends at a node in `endIds`
// (a path of one node counts when a start is itself an end). Finding the longest path is
// expensive on large dense graphs, so the search stops after `maxVisits` steps and
// returns the best path found so far.
export function findLongestPath(
  graph: DirectedGraph,
  startIds: Iterable<string>,
  endIds: ReadonlySet<string>,
  maxVisits = 10_000,
): string[] {
  let longest: string[] = [];
  let visits = 0;

  // Depth-first with an explicit stack, so a very long chain cannot overflow the call stack.
  for (const start of startIds) {
    if (!graph.nodes.has(start)) continue;
    const path = [start];
    const onPath = new Set([start]);
    const frames = [{ next: [...(graph.outgoing.get(start) ?? [])], index: 0 }];
    if (visits < maxVisits) {
      visits += 1;
      if (endIds.has(start) && path.length > longest.length) longest = [...path];
    }

    while (frames.length > 0 && visits < maxVisits) {
      const frame = frames[frames.length - 1];
      if (frame.index >= frame.next.length) {
        frames.pop();
        onPath.delete(path.pop() as string);
        continue;
      }
      const next = frame.next[frame.index];
      frame.index += 1;
      if (onPath.has(next)) continue;

      visits += 1;
      path.push(next);
      onPath.add(next);
      if (endIds.has(next) && path.length > longest.length) longest = [...path];
      frames.push({ next: [...(graph.outgoing.get(next) ?? [])], index: 0 });
    }
  }
  return longest;
}

// ---- Edge-list helpers ----
// These work on a plain edge list without checking that the endpoints exist, for callers
// that have already cleaned their edges (the Challenge evaluator).

function adjacencyOf(edges: readonly GraphEdge[]): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = next.get(edge.source);
    if (targets) targets.push(edge.target);
    else next.set(edge.source, [edge.target]);
  }
  return next;
}

// Every node reachable by following edges in their direction. The start node is only
// included if a cycle leads back to it.
export function getReachableNodes(
  edges: readonly GraphEdge[],
  startId: string,
): Set<string> {
  const adjacency = adjacencyOf(edges);
  return walk(adjacency, adjacency.get(startId) ?? []);
}

// Directed: an edge from `from` to `to`.
export function hasDirectConnection(
  edges: readonly GraphEdge[],
  from: string,
  to: string,
): boolean {
  return edges.some((edge) => edge.source === from && edge.target === to);
}

export function hasPath(
  edges: readonly GraphEdge[],
  from: string,
  to: string,
): boolean {
  return getReachableNodes(edges, from).has(to);
}

export function getNodesOfType<T extends GraphNode>(
  nodes: readonly T[],
  type: ArchitectureNodeType,
): T[] {
  return nodes.filter((node) => node.data.type === type);
}

// Nodes that have at least one edge to another node in the graph.
export function countConnectedNodes(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): number {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return nodes.filter((node) => connected.has(node.id)).length;
}
