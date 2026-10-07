import type { GraphNode } from "./graph.ts";

// Which connections may be made. Every mode refuses connections that make the graph
// invalid (missing endpoints, a node connected to itself, an exact repeat). Rules about
// which component types may connect are per mode and live in CONNECTION_RULES.
//
// workspace: free experimentation. Only the structural checks apply.
// learn:     the lesson engine decides what a step requires and explains mistakes, so
//            wrong-but-valid connections are still allowed.
// challenge: the design is judged afterwards, not prevented.
export type ConnectionMode = "workspace" | "learn" | "challenge";

export type ConnectionRequest = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type ConnectionRecord = ConnectionRequest & { id: string };

export type ConnectionGraph = {
  nodes: readonly GraphNode[];
  edges: readonly ConnectionRequest[];
};

export type ConnectionRejection =
  | "missing-source"
  | "missing-target"
  | "self-connection"
  | "duplicate"
  | "rule";

export type ConnectionVerdict =
  | { ok: true }
  | { ok: false; reason: ConnectionRejection; message: string };

// Returns why `from` may not connect to `to`, or null when it may.
export type ConnectionRule = (from: GraphNode, to: GraphNode) => string | null;

// Direction is already guaranteed by the node handles (a connection always runs from a
// source handle to a target handle). Type-pair rules such as "a client connects to a load
// balancer, not straight to a database" are added per mode here when a mode needs them;
// none do today, so no mode refuses a connection for the types involved.
export const CONNECTION_RULES: Record<ConnectionMode, readonly ConnectionRule[]> = {
  workspace: [],
  learn: [],
  challenge: [],
};

const reject = (reason: ConnectionRejection, message: string): ConnectionVerdict => ({
  ok: false,
  reason,
  message,
});

const handleOf = (handle: string | null | undefined) => handle ?? null;

export function validateConnection(
  graph: ConnectionGraph,
  request: ConnectionRequest,
  mode: ConnectionMode = "workspace",
  rules: readonly ConnectionRule[] = CONNECTION_RULES[mode],
): ConnectionVerdict {
  const source = typeof request?.source === "string" ? request.source : null;
  const target = typeof request?.target === "string" ? request.target : null;

  const from = source === null ? undefined : graph.nodes.find((node) => node.id === source);
  const to = target === null ? undefined : graph.nodes.find((node) => node.id === target);
  if (!from) return reject("missing-source", "The connection starts at a component that does not exist.");
  if (!to) return reject("missing-target", "The connection ends at a component that does not exist.");
  if (from.id === to.id) return reject("self-connection", "A component cannot connect to itself.");

  const duplicate = graph.edges.some(
    (edge) =>
      edge.source === from.id &&
      edge.target === to.id &&
      handleOf(edge.sourceHandle) === handleOf(request.sourceHandle) &&
      handleOf(edge.targetHandle) === handleOf(request.targetHandle),
  );
  if (duplicate) return reject("duplicate", "These components are already connected this way.");

  for (const rule of rules) {
    const message = rule(from, to);
    if (message) return reject("rule", message);
  }
  return { ok: true };
}

// `source->target`, with the handle ids appended when there are any. Stable, so the same
// connection always has the same id (the starter architecture uses this shape too).
export function connectionId(request: ConnectionRequest): string {
  const { source, target, sourceHandle, targetHandle } = request;
  const handles = sourceHandle || targetHandle ? `:${sourceHandle ?? ""}:${targetHandle ?? ""}` : "";
  return `${source}->${target}${handles}`;
}

export function createConnection(request: ConnectionRequest): ConnectionRecord {
  const record: ConnectionRecord = {
    id: connectionId(request),
    source: request.source,
    target: request.target,
  };
  if (request.sourceHandle) record.sourceHandle = request.sourceHandle;
  if (request.targetHandle) record.targetHandle = request.targetHandle;
  return record;
}

// Validates, then adds the connection. A refused connection leaves `edges` untouched.
export function addConnection<E extends ConnectionRequest & { id: string }>(
  graph: { nodes: readonly GraphNode[]; edges: E[] },
  request: ConnectionRequest,
  mode: ConnectionMode = "workspace",
): { ok: true; edges: E[] } | Extract<ConnectionVerdict, { ok: false }> {
  const verdict = validateConnection(graph, request, mode);
  if (!verdict.ok) return verdict;
  return { ok: true, edges: [...graph.edges, createConnection(request) as E] };
}
