import type { GraphInput } from "../../lib/architecture/graph.ts";
import { evaluateArchitecture, DEFAULT_TRAFFIC } from "../../lib/architecture/evaluation/evaluate.ts";

// The landing illustration and simulation share this topology.
export const LANDING_NODES = [
  { id: "client", x: 7, y: 42, icon: "globe", label: "Web client", meta: "Next.js", type: "client" },
  { id: "gateway", x: 37, y: 17, icon: "layers", label: "API gateway", meta: "Edge", type: "api-gateway" },
  { id: "auth", x: 37, y: 64, icon: "server", label: "Auth service", meta: "Node.js", type: "auth" },
  { id: "api", x: 69, y: 17, icon: "server", label: "Core API", meta: "3 replicas", type: "api" },
  { id: "database", x: 69, y: 64, icon: "database", label: "PostgreSQL", meta: "Primary", type: "database" },
] as const;

export const LANDING_GRAPH: GraphInput = {
  nodes: LANDING_NODES.map(node => ({
    id: node.id,
    data: { type: node.type, label: node.label, ...(node.id === "api" ? { properties: { replicas: 3 } } : {}) },
  })),
  edges: [
    { source: "client", target: "gateway" },
    { source: "client", target: "auth" },
    { source: "gateway", target: "api" },
    { source: "auth", target: "api" },
    { source: "api", target: "database" },
  ],
};

export function runLandingSimulation(requestsPerSecond: number) {
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0 || requestsPerSecond > 10_000_000) {
    throw new RangeError("Traffic must be between 1 and 10,000,000 requests per second.");
  }
  return evaluateArchitecture({
    graph: LANDING_GRAPH,
    traffic: { ...DEFAULT_TRAFFIC, requestsPerSecond, concurrentUsers: requestsPerSecond * 5 },
  });
}
