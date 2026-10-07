import type { GraphInput, GraphNode } from "../graph.ts";
import type { NodeProperties } from "../types.ts";
import { SIMULATION_PROFILES } from "./capabilities.ts";

// Keeps what can be evaluated and ignores the rest, without touching the input: nodes
// with an id and a known component type, and edges with a source and a target.
export function usableGraph(graph: unknown): GraphInput {
  const source = (typeof graph === "object" && graph !== null ? graph : {}) as {
    nodes?: unknown;
    edges?: unknown;
  };
  const nodes = (Array.isArray(source.nodes) ? source.nodes : []).filter(
    (node): node is GraphNode =>
      typeof node === "object" &&
      node !== null &&
      typeof (node as GraphNode).id === "string" &&
      typeof (node as GraphNode).data === "object" &&
      (node as GraphNode).data !== null &&
      typeof (node as GraphNode).data.type === "string" &&
      Object.hasOwn(SIMULATION_PROFILES, (node as GraphNode).data.type),
  );
  const edges = (Array.isArray(source.edges) ? source.edges : []).filter(
    (edge): edge is { source: string; target: string } =>
      typeof edge === "object" &&
      edge !== null &&
      typeof (edge as { source?: unknown }).source === "string" &&
      typeof (edge as { target?: unknown }).target === "string",
  );
  return { nodes, edges };
}

type SnapshotNode = {
  id: string;
  data: { type: GraphNode["data"]["type"]; label?: string; properties?: NodeProperties };
};

// A copy of a live graph holding only what evaluation looks at, so it can be sent for
// evaluation (possibly to a server) while the user keeps editing the original.
export function snapshotGraph(
  nodes: readonly SnapshotNode[],
  edges: readonly { source: string; target: string }[],
): GraphInput {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      data: {
        type: node.data.type,
        ...(node.data.label === undefined ? {} : { label: node.data.label }),
        ...(node.data.properties
          ? { properties: JSON.parse(JSON.stringify(node.data.properties)) as NodeProperties }
          : {}),
      },
    })),
    edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
  };
}
