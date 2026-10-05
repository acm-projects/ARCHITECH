export interface DirectedEdge {
  from: string;
  to: string;
}

export interface DirectedGraph {
  nodes: Set<string>;
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
}

export function createDirectedGraph(
  nodeIds: Iterable<string>,
  edges: readonly DirectedEdge[],
): DirectedGraph {
  const nodes = new Set(nodeIds);
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const nodeId of nodes) {
    outgoing.set(nodeId, new Set());
    incoming.set(nodeId, new Set());
  }

  for (const edge of edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) {
      continue;
    }
    outgoing.get(edge.from)?.add(edge.to);
    incoming.get(edge.to)?.add(edge.from);
  }

  return { nodes, outgoing, incoming };
}

export function reachableFrom(
  graph: DirectedGraph,
  entryIds: Iterable<string>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [...entryIds].filter((id) => graph.nodes.has(id));

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;

    visited.add(nodeId);
    for (const next of graph.outgoing.get(nodeId) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return visited;
}

export function canReachAny(
  graph: DirectedGraph,
  startId: string,
  targetIds: ReadonlySet<string>,
): boolean {
  if (!graph.nodes.has(startId)) return false;

  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    if (nodeId !== startId && targetIds.has(nodeId)) return true;

    visited.add(nodeId);
    for (const next of graph.outgoing.get(nodeId) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return false;
}
