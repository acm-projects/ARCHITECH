// The graph algorithms live in src/lib/architecture/graph.ts, shared with the workspace
// analysis. These aliases keep the Challenge evaluator's imports unchanged.
export {
  countConnectedNodes,
  getNodesOfType,
  getReachableNodes,
  hasDirectConnection,
  hasPath,
} from "../../../lib/architecture/graph.ts";
export type {
  GraphEdge as EvalEdge,
  GraphNode as EvalNode,
} from "../../../lib/architecture/graph.ts";
