import type { ArchitectureNodeType } from "../../workspace/nodes/ArchitectureNode";

// Structural subsets of React Flow's node and edge, so everything here stays pure.
export type EvalNode = { id: string; data: { type: ArchitectureNodeType } };
export type EvalEdge = { source: string; target: string };

export function getNodesOfType<T extends EvalNode>(
  nodes: readonly T[],
  type: ArchitectureNodeType,
): T[] {
  return nodes.filter((node) => node.data.type === type);
}

// Directed: an edge from `from` to `to`.
export function hasDirectConnection(
  edges: readonly EvalEdge[],
  from: string,
  to: string,
): boolean {
  return edges.some((edge) => edge.source === from && edge.target === to);
}

// Every node reachable by following edges in their direction. The start node is only
// included if a cycle leads back to it.
export function getReachableNodes(
  edges: readonly EvalEdge[],
  startId: string,
): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = next.get(edge.source);
    if (targets) targets.push(edge.target);
    else next.set(edge.source, [edge.target]);
  }

  const reached = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const target of next.get(current) ?? []) {
      if (reached.has(target)) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return reached;
}

export function hasPath(
  edges: readonly EvalEdge[],
  from: string,
  to: string,
): boolean {
  return getReachableNodes(edges, from).has(to);
}

// Nodes that have at least one edge to another node in the graph.
export function countConnectedNodes(
  nodes: readonly EvalNode[],
  edges: readonly EvalEdge[],
): number {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return nodes.filter((node) => connected.has(node.id)).length;
}
