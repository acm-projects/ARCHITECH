import {
  createDirectedGraph,
  findLongestPath,
  reachableFrom,
  type GraphEdge,
  type GraphInput,
  type GraphNode,
} from "./graph.ts";
import type { ArchitectureNodeType } from "./types.ts";

export type ArchitectureFindingSeverity = "high" | "medium" | "low";
export type ArchitectureFindingCategory =
  | "Bottleneck"
  | "Single point of failure"
  | "Missing redundancy"
  | "Scaling risk"
  | "Database pressure"
  | "Cache opportunity"
  | "Expensive path"
  | "Questionable connection"
  | "Topology";

export type ArchitectureFinding = {
  id: string;
  category: ArchitectureFindingCategory;
  severity: ArchitectureFindingSeverity;
  title: string;
  detail: string;
  nodeIds: string[];
  components: string[];
};

export type GraphAnalysis = {
  // False until enough of the graph is connected for findings to mean anything.
  ready: boolean;
  nodeCount: number;
  connectedNodeCount: number;
  edgeCount: number;
  findings: ArchitectureFinding[];
};

// Load the design is meant to carry. `observed` holds values measured by a simulation
// run; findings that need them are skipped when it is absent, and the requested load
// stands in for the effective load.
export type TrafficInputs = {
  requestsPerSecond: number;
  datasetGb: number;
  // Percent of requests that are reads, 0-100.
  readRatio: number;
  networkLatencyMs: number;
  observed?: {
    effectiveRps: number;
    p95LatencyMs: number;
    monthlyCost: number;
    bottleneckNodeId?: string;
  };
};

// What a component does in a request path, derived from its type, never from its label.
export type NodeRole =
  | "entry"
  | "edge"
  | "ingress"
  | "compute"
  | "support"
  | "queue"
  | "cache"
  | "database"
  | "storage";

const ROLE_BY_TYPE: Record<ArchitectureNodeType, NodeRole> = {
  client: "entry",
  "web-app": "entry",
  "mobile-app": "entry",
  cdn: "edge",
  dns: "edge",
  "api-gateway": "ingress",
  "load-balancer": "ingress",
  server: "compute",
  worker: "compute",
  auth: "support",
  search: "support",
  queue: "queue",
  cache: "cache",
  database: "database",
  "object-storage": "storage",
};

export function roleOf(type: ArchitectureNodeType): NodeRole {
  return ROLE_BY_TYPE[type];
}

const SEVERITY_ORDER: Record<ArchitectureFindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const MAX_FINDINGS = 10;
const MAX_SPOF_CANDIDATES = 300;

const unique = <T>(items: readonly T[]): T[] => Array.from(new Set(items));

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

function labelOf(node: GraphNode): string {
  return node.data.label?.trim() || node.data.type;
}

// A numeric property such as `replicas`, or `fallback` when it is missing or not a number.
function numberProperty(node: GraphNode, key: string, fallback: number): number {
  const value = node.data.properties?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function questionableConnection(from: GraphNode, to: GraphNode): string | null {
  const fromRole = roleOf(from.data.type);
  const toRole = roleOf(to.data.type);

  if (fromRole === "entry" && toRole === "database") {
    return "The client is connected directly to persistence, bypassing the service boundary.";
  }
  if (fromRole === "ingress" && toRole === "database") {
    return "Ingress routes directly into persistence instead of a service or data-access layer.";
  }
  if (fromRole === "database" && (toRole === "entry" || toRole === "ingress")) {
    return "The connection runs backward from persistence into the request-entry layer.";
  }
  if (fromRole === "queue" && toRole === "entry") {
    return "A queue is feeding a client node directly; queues normally terminate at a worker or service consumer.";
  }
  return null;
}

// Reviews an architecture graph for topology and capacity problems. Pure and deterministic.
// It reads component types and connectivity (never labels) over any set of nodes and
// edges, so it works on a React Flow canvas as-is.
export function analyzeGraph(
  input: GraphInput,
  traffic: TrafficInputs,
  // Nodes that run as several instances (or have a standby): their loss does not cut
  // anything off, so they are never reported as a single point of failure.
  options: { redundantNodeIds?: ReadonlySet<string> } = {},
): GraphAnalysis {
  const graph = createDirectedGraph(input);
  const nodes = [...graph.nodes.values()];
  const degreeOf = (id: string) =>
    (graph.outgoing.get(id)?.size ?? 0) + (graph.incoming.get(id)?.size ?? 0);
  const connected = nodes.filter((node) => degreeOf(node.id) > 0);
  const connectedIds = new Set(connected.map((node) => node.id));
  const ready = connected.length >= 3 && graph.edges.length >= 2;

  const summary = {
    ready,
    nodeCount: nodes.length,
    connectedNodeCount: connected.length,
    edgeCount: graph.edges.length,
  };
  if (!ready) return { ...summary, findings: [] };

  const { observed } = traffic;
  const readRatio = Math.min(100, Math.max(0, finiteOr(traffic.readRatio, 50)));
  const writeRatio = 100 - readRatio;
  const datasetGb = finiteOr(traffic.datasetGb, 0);
  const networkLatencyMs = finiteOr(traffic.networkLatencyMs, 0);
  const load = finiteOr(observed?.effectiveRps ?? traffic.requestsPerSecond, 0);
  const p95 = observed ? finiteOr(observed.p95LatencyMs, 0) : 0;
  const cost = observed ? finiteOr(observed.monthlyCost, 0) : 0;
  const loadText = `${load.toLocaleString()} req/s`;

  const findings: ArchitectureFinding[] = [];
  const pushFinding = (finding: Omit<ArchitectureFinding, "components">) => {
    const nodeIds = unique(finding.nodeIds.filter((id) => graph.nodes.has(id)));
    findings.push({
      ...finding,
      nodeIds,
      components: nodeIds.map((id) => labelOf(graph.nodes.get(id) as GraphNode)),
    });
  };

  const ofRole = (...roles: NodeRole[]) =>
    connected.filter((node) => roles.includes(roleOf(node.data.type)));
  const entries = ofRole("entry");
  const databases = connected.filter((node) => node.data.type === "database");
  const servers = ofRole("compute");
  const queues = ofRole("queue");
  const caches = ofRole("cache");

  // Bottleneck: only known once a simulation has named the limiting component.
  const bottleneck = observed?.bottleneckNodeId
    ? graph.nodes.get(observed.bottleneckNodeId)
    : undefined;
  const hasActivePressure = load >= 7500 || p95 >= 120 || datasetGb >= 600;
  if (bottleneck && connectedIds.has(bottleneck.id) && hasActivePressure) {
    const evidence: string[] = [];
    if (load >= 7500) evidence.push(`${loadText} effective traffic`);
    if (p95 >= 120) evidence.push(`${p95} ms p95`);
    if (datasetGb >= 600) evidence.push(`${datasetGb} GB dataset`);

    pushFinding({
      id: `bottleneck-${bottleneck.id}`,
      category: "Bottleneck",
      severity: load >= 11000 || p95 >= 220 ? "high" : "medium",
      title: `${labelOf(bottleneck)} is the current capacity limit`,
      detail: `The simulator's limiting component is ${labelOf(bottleneck)} under ${evidence.join(", ")}.`,
      nodeIds: [bottleneck.id],
    });
  }

  // Single point of failure: the non-entry node whose removal cuts off the most
  // components from every entry point.
  const entryIds = entries.map((node) => node.id);
  const baselineReach = reachableFrom(graph, entryIds);
  let strongest: { node: GraphNode; lost: string[] } | undefined;
  // Each candidate costs a walk of the graph, so very large graphs check the best-connected
  // components first and stop at MAX_SPOF_CANDIDATES. Ties keep the order of the input.
  const candidates =
    connected.length <= MAX_SPOF_CANDIDATES
      ? connected
      : [...connected]
          .sort((a, b) => degreeOf(b.id) - degreeOf(a.id))
          .slice(0, MAX_SPOF_CANDIDATES);
  for (const node of candidates) {
    if (roleOf(node.data.type) === "entry" || !baselineReach.has(node.id)) continue;
    if (options.redundantNodeIds?.has(node.id)) continue;
    const reduced = reachableFrom(graph, entryIds, { without: node.id });
    const lost = [...baselineReach].filter(
      (id) => id !== node.id && !reduced.has(id),
    );
    if (lost.length > 0 && (!strongest || lost.length > strongest.lost.length)) {
      strongest = { node, lost };
    }
  }
  if (strongest) {
    const lostLabels = strongest.lost
      .slice(0, 3)
      .map((id) => labelOf(graph.nodes.get(id) as GraphNode));
    const more = strongest.lost.length - 3;
    pushFinding({
      id: `spof-${strongest.node.id}`,
      category: "Single point of failure",
      severity: strongest.lost.length >= 2 ? "high" : "medium",
      title: `${labelOf(strongest.node)} gates downstream reachability`,
      detail: `Removing this node disconnects ${lostLabels.join(", ")}${more > 0 ? ` and ${more} more component(s)` : ""} from the client path.`,
      nodeIds: [strongest.node.id, ...strongest.lost.slice(0, 3)],
    });
  }

  // Database redundancy: a single database with no read replica configured.
  if (databases.length === 1) {
    const replicas = numberProperty(databases[0], "replicas", 0);
    if (replicas < 1) {
      pushFinding({
        id: `database-redundancy-${databases[0].id}`,
        category: "Missing redundancy",
        severity: "medium",
        title: `${labelOf(databases[0])} has no configured replica`,
        detail: `It is the only connected database component and its replica count is ${replicas}.`,
        nodeIds: [databases[0].id],
      });
    }
  }

  // Database pressure from dataset size, write share or request volume.
  if (databases.length > 0 && (datasetGb >= 500 || writeRatio >= 65 || load >= 9000)) {
    const pressure: string[] = [];
    if (datasetGb >= 500) pressure.push(`${datasetGb} GB dataset`);
    if (writeRatio >= 65) pressure.push(`${writeRatio}% writes`);
    if (load >= 9000) pressure.push(loadText);
    pushFinding({
      id: "database-pressure",
      category: "Database pressure",
      severity: datasetGb >= 750 || load >= 12000 ? "high" : "medium",
      title: `${databases.map(labelOf).join(" + ")} carry elevated data pressure`,
      detail: `Current inputs put ${pressure.join(", ")} on the persistence layer.`,
      nodeIds: databases.map((node) => node.id),
    });
  }

  // Cache opportunity: read-heavy traffic reaches a database and nothing caches it.
  if (readRatio >= 65 && databases.length > 0 && caches.length === 0) {
    const upstream = databases.flatMap((db) => [...(graph.incoming.get(db.id) ?? [])]);
    pushFinding({
      id: "cache-opportunity",
      category: "Cache opportunity",
      severity: readRatio >= 80 ? "medium" : "low",
      title: `${readRatio}% read traffic reaches persistence without a connected cache`,
      detail:
        "No cache component is connected in the active data path, so repeated reads continue to reach the database/storage layer.",
      nodeIds: [...upstream, ...databases.map((node) => node.id)],
    });
  }

  // Compute scaling: every compute node counts as at least one instance.
  const instances = servers.reduce(
    (sum, node) => sum + Math.max(1, numberProperty(node, "replicas", 1)),
    0,
  );
  if (load >= 9000 && servers.length > 0 && instances <= 2) {
    pushFinding({
      id: "service-scaling-risk",
      category: "Scaling risk",
      severity: load >= 12000 ? "high" : "medium",
      title: `${instances} service instance${instances === 1 ? "" : "s"} carry ${loadText}`,
      detail:
        "The connected compute tier has little horizontal capacity relative to the current request load.",
      nodeIds: servers.map((node) => node.id),
    });
  }

  // Write scaling: heavy writes reach the data tier with nothing buffering them.
  if (load >= 9000 && writeRatio >= 50 && queues.length === 0 && databases.length > 0) {
    pushFinding({
      id: "write-scaling-risk",
      category: "Scaling risk",
      severity: "medium",
      title: "High write load has no connected buffering layer",
      detail: `${writeRatio}% writes at ${loadText} reach the data tier without a connected queue.`,
      nodeIds: [...servers, ...databases].map((node) => node.id),
    });
  }

  // Expensive path: a long client-to-data path under latency or cost pressure.
  const dataIds = new Set(ofRole("database", "storage").map((node) => node.id));
  const underPressure = networkLatencyMs >= 180 || p95 >= 160 || cost >= 420;
  const longestPath = underPressure ? findLongestPath(graph, entryIds, dataIds) : [];
  if (longestPath.length >= 4) {
    const labels = longestPath.map((id) => labelOf(graph.nodes.get(id) as GraphNode));
    const measured = observed ? `, ${p95} ms p95, and a $${cost}/mo system estimate` : "";
    pushFinding({
      id: "expensive-path",
      category: "Expensive path",
      severity: networkLatencyMs >= 260 || p95 >= 240 ? "high" : "medium",
      title: `${labels.length}-component client-to-data path is carrying the expensive route`,
      detail: `${labels.join(" → ")} runs under ${networkLatencyMs} ms configured network latency${measured}.`,
      nodeIds: longestPath,
    });
  }

  // Questionable and repeated connections. Repeats are only visible in the raw edges.
  const seenPairs = new Set<string>();
  const duplicated = new Set<string>();
  for (const { source, target } of input.edges) {
    const pair = `${source}->${target}`;
    if (seenPairs.has(pair)) duplicated.add(pair);
    seenPairs.add(pair);
  }
  const checkConnection = (edge: GraphEdge) => {
    const from = graph.nodes.get(edge.source) as GraphNode;
    const to = graph.nodes.get(edge.target) as GraphNode;
    const reason = questionableConnection(from, to);
    const repeated = duplicated.has(`${edge.source}->${edge.target}`);
    if (!reason && !repeated) return;
    pushFinding({
      id: `connection-${edge.source}->${edge.target}`,
      category: "Questionable connection",
      severity: reason ? "medium" : "low",
      title: `${labelOf(from)} → ${labelOf(to)} needs inspection`,
      detail:
        reason ?? "More than one edge connects the same two components in the same direction.",
      nodeIds: [from.id, to.id],
    });
  };
  graph.edges.forEach(checkConnection);

  // Components that take part in no connection at all.
  const orphans = nodes.filter((node) => degreeOf(node.id) === 0);
  if (orphans.length > 0) {
    pushFinding({
      id: "orphaned-components",
      category: "Topology",
      severity: "low",
      title:
        orphans.length === 1
          ? `${labelOf(orphans[0])} is not connected`
          : `${orphans.length} components are not connected`,
      detail:
        "These components are present on the canvas but do not participate in any request or data path.",
      nodeIds: orphans.map((node) => node.id),
    });
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.id.localeCompare(b.id),
  );

  return { ...summary, findings: findings.slice(0, MAX_FINDINGS) };
}
