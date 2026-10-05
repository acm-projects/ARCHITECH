import type { AddedComponent, Connection, CoreNodeId, SimulationMetrics } from "./workspaceModel";
import {
  getDefaultNodeProperties,
  getNodeKind,
  type NodeKind,
  type NodePropertyValues,
} from "./workspaceData.ts";

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

export interface ArchitectureFinding {
  id: string;
  category: ArchitectureFindingCategory;
  severity: ArchitectureFindingSeverity;
  title: string;
  detail: string;
  nodeIds: string[];
  components: string[];
}

export interface ArchitectureAnalysis {
  ready: boolean;
  nodeCount: number;
  connectedNodeCount: number;
  edgeCount: number;
  findings: ArchitectureFinding[];
}

interface ArchitectureAnalysisInput {
  names: readonly string[];
  deletedNodes: string[];
  deletedEdges: string[];
  addedComponents: AddedComponent[];
  userConnections: Connection[];
  nodeProperties: Record<string, NodePropertyValues>;
  traffic: number;
  dataset: number;
  readRatio: number;
  networkLatency: number;
  effectiveTraffic: number;
  p95Latency: number;
  monthlyCost: number;
  bottleneckId: SimulationMetrics["bottleneckId"];
}

interface AnalysisNode {
  id: string;
  label: string;
  kind: NodeKind;
  added: boolean;
}

interface AnalysisEdge {
  key: string;
  from: string;
  to: string;
  source: "core" | "user";
}

const CORE_NODE_IDS: CoreNodeId[] = ["client", "gateway", "service", "queue", "db"];

const CORE_EDGES: AnalysisEdge[] = [
  { key: "client-gateway", from: "client", to: "gateway", source: "core" },
  { key: "gateway-service", from: "gateway", to: "service", source: "core" },
  { key: "gateway-queue", from: "gateway", to: "queue", source: "core" },
  { key: "queue-db", from: "queue", to: "db", source: "core" },
];

const SEVERITY_ORDER: Record<ArchitectureFindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildGraph(input: ArchitectureAnalysisInput) {
  const nodes: AnalysisNode[] = CORE_NODE_IDS.flatMap((id, index) => {
    if (input.deletedNodes.includes(id) || !input.names[index]) return [];

    return [{
      id,
      label: input.names[index],
      kind: getNodeKind(input.names[index]),
      added: false,
    }];
  });

  input.addedComponents.forEach((component) => {
    nodes.push({
      id: component.id,
      label: component.name,
      kind: getNodeKind(component.name),
      added: true,
    });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: AnalysisEdge[] = [];

  CORE_EDGES.forEach((edge) => {
    if (
      nodeIds.has(edge.from) &&
      nodeIds.has(edge.to) &&
      !input.deletedEdges.includes(edge.key)
    ) {
      edges.push(edge);
    }
  });

  input.userConnections.forEach((connection, index) => {
    const key = `user-${connection.from}-${connection.to}-${index}`;
    if (
      nodeIds.has(connection.from) &&
      nodeIds.has(connection.to) &&
      !input.deletedEdges.includes(key)
    ) {
      edges.push({
        key,
        from: connection.from,
        to: connection.to,
        source: "user",
      });
    }
  });

  const dedupedEdges = edges.filter(
    (edge, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.from === edge.from &&
          candidate.to === edge.to &&
          candidate.source === edge.source,
      ) === index,
  );

  return { nodes, edges: dedupedEdges };
}

function buildDegreeMap(nodes: AnalysisNode[], edges: AnalysisEdge[]) {
  const degree = new Map(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  });

  return degree;
}

function reachableFrom(
  starts: string[],
  edges: AnalysisEdge[],
  removedNodeId?: string,
): Set<string> {
  const adjacency = new Map<string, string[]>();

  edges.forEach((edge) => {
    if (edge.from === removedNodeId || edge.to === removedNodeId) return;
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  });

  const visited = new Set<string>();
  const queue = starts.filter((id) => id !== removedNodeId);

  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;

    visited.add(id);
    (adjacency.get(id) ?? []).forEach((next) => {
      if (!visited.has(next)) queue.push(next);
    });
  }

  return visited;
}

function findLongestClientToDataPath(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): string[] {
  const adjacency = new Map<string, string[]>();
  const dataNodeIds = new Set(
    nodes
      .filter((node) => node.kind === "database" || node.kind === "storage")
      .map((node) => node.id),
  );
  const clientIds = nodes
    .filter((node) => node.kind === "client")
    .map((node) => node.id);

  edges.forEach((edge) => {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  });

  let longest: string[] = [];

  const visit = (current: string, path: string[], seen: Set<string>) => {
    if (path.length > nodes.length) return;
    if (dataNodeIds.has(current) && path.length > longest.length) {
      longest = path;
    }

    (adjacency.get(current) ?? []).forEach((next) => {
      if (seen.has(next)) return;
      visit(next, [...path, next], new Set([...seen, next]));
    });
  };

  clientIds.forEach((clientId) => {
    visit(clientId, [clientId], new Set([clientId]));
  });

  return longest;
}

function questionableConnection(
  from: AnalysisNode,
  to: AnalysisNode,
): string | null {
  if (from.kind === "client" && to.kind === "database") {
    return "The client is connected directly to persistence, bypassing the service boundary.";
  }

  if (
    (from.kind === "lb" || from.kind === "gateway") &&
    to.kind === "database"
  ) {
    return "Ingress routes directly into persistence instead of a service or data-access layer.";
  }

  if (
    from.kind === "database" &&
    (to.kind === "client" || to.kind === "lb" || to.kind === "gateway")
  ) {
    return "The connection runs backward from persistence into the request-entry layer.";
  }

  if (from.kind === "queue" && to.kind === "client") {
    return "A queue is feeding a client node directly; queues normally terminate at a worker or service consumer.";
  }

  return null;
}

export function analyzeArchitecture(
  input: ArchitectureAnalysisInput,
): ArchitectureAnalysis {
  const { nodes, edges } = buildGraph(input);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const degree = buildDegreeMap(nodes, edges);
  const connectedNodes = nodes.filter((node) => (degree.get(node.id) ?? 0) > 0);
  const connectedIds = new Set(connectedNodes.map((node) => node.id));
  const ready = connectedNodes.length >= 3 && edges.length >= 2;

  if (!ready) {
    return {
      ready,
      nodeCount: nodes.length,
      connectedNodeCount: connectedNodes.length,
      edgeCount: edges.length,
      findings: [],
    };
  }

  const findings: ArchitectureFinding[] = [];
  const pushFinding = (
    finding: Omit<ArchitectureFinding, "components">,
  ) => {
    const nodeIds = unique(
      finding.nodeIds.filter((id) => nodeById.has(id)),
    );
    findings.push({
      ...finding,
      nodeIds,
      components: nodeIds
        .map((id) => nodeById.get(id)?.label)
        .filter((label): label is string => Boolean(label)),
    });
  };

  const bottleneckNode = nodeById.get(input.bottleneckId);
  const hasActivePressure =
    input.effectiveTraffic >= 7500 ||
    input.p95Latency >= 120 ||
    input.dataset >= 600;

  if (bottleneckNode && connectedIds.has(bottleneckNode.id) && hasActivePressure) {
    const evidence: string[] = [];
    if (input.effectiveTraffic >= 7500) {
      evidence.push(`${input.effectiveTraffic.toLocaleString()} req/s effective traffic`);
    }
    if (input.p95Latency >= 120) {
      evidence.push(`${input.p95Latency} ms p95`);
    }
    if (input.dataset >= 600) {
      evidence.push(`${input.dataset} GB dataset`);
    }

    pushFinding({
      id: `bottleneck-${bottleneckNode.id}`,
      category: "Bottleneck",
      severity:
        input.effectiveTraffic >= 11000 || input.p95Latency >= 220
          ? "high"
          : "medium",
      title: `${bottleneckNode.label} is the current capacity limit`,
      detail: `The simulator's limiting component is ${bottleneckNode.label} under ${evidence.join(", ")}.`,
      nodeIds: [bottleneckNode.id],
    });
  }

  const clientIds = connectedNodes
    .filter((node) => node.kind === "client")
    .map((node) => node.id);
  const baselineReach = reachableFrom(clientIds, edges);
  let strongestFailure:
    | { node: AnalysisNode; lost: string[] }
    | undefined;

  connectedNodes.forEach((node) => {
    if (node.kind === "client" || !baselineReach.has(node.id)) return;

    const reducedReach = reachableFrom(clientIds, edges, node.id);
    const lost = [...baselineReach].filter(
      (id) => id !== node.id && !reducedReach.has(id),
    );

    if (
      lost.length > 0 &&
      (!strongestFailure || lost.length > strongestFailure.lost.length)
    ) {
      strongestFailure = { node, lost };
    }
  });

  if (strongestFailure) {
    const lostLabels = strongestFailure.lost
      .slice(0, 3)
      .map((id) => nodeById.get(id)?.label)
      .filter((label): label is string => Boolean(label));

    pushFinding({
      id: `spof-${strongestFailure.node.id}`,
      category: "Single point of failure",
      severity: strongestFailure.lost.length >= 2 ? "high" : "medium",
      title: `${strongestFailure.node.label} gates downstream reachability`,
      detail: `Removing this node disconnects ${lostLabels.join(", ")}${strongestFailure.lost.length > 3 ? ` and ${strongestFailure.lost.length - 3} more component(s)` : ""} from the client path.`,
      nodeIds: [
        strongestFailure.node.id,
        ...strongestFailure.lost.slice(0, 3),
      ],
    });
  }

  const propertiesFor = (node: AnalysisNode): NodePropertyValues => ({
    ...getDefaultNodeProperties(node.kind),
    ...(input.nodeProperties[node.id] ?? {}),
  });
  const numberProperty = (
    node: AnalysisNode,
    key: string,
    fallback = 0,
  ): number => {
    const value = Number(propertiesFor(node)[key]);
    return Number.isFinite(value) ? value : fallback;
  };

  const databases = connectedNodes.filter((node) => node.kind === "database");
  if (databases.length === 1) {
    const replicas = numberProperty(databases[0], "replicas");

    if (replicas < 1) {
      pushFinding({
        id: `database-redundancy-${databases[0].id}`,
        category: "Missing redundancy",
        severity: "medium",
        title: `${databases[0].label} has no configured replica`,
        detail: `It is the only connected database component and its replica count is ${replicas}.`,
        nodeIds: [databases[0].id],
      });
    }
  }

  const writeRatio = 100 - input.readRatio;
  if (
    databases.length > 0 &&
    (input.dataset >= 500 ||
      writeRatio >= 65 ||
      input.effectiveTraffic >= 9000)
  ) {
    const pressure: string[] = [];
    if (input.dataset >= 500) pressure.push(`${input.dataset} GB dataset`);
    if (writeRatio >= 65) pressure.push(`${writeRatio}% writes`);
    if (input.effectiveTraffic >= 9000) {
      pressure.push(`${input.effectiveTraffic.toLocaleString()} req/s`);
    }

    pushFinding({
      id: "database-pressure",
      category: "Database pressure",
      severity:
        input.dataset >= 750 || input.effectiveTraffic >= 12000
          ? "high"
          : "medium",
      title: `${databases.map((node) => node.label).join(" + ")} carry elevated data pressure`,
      detail: `Current inputs put ${pressure.join(", ")} on the persistence layer.`,
      nodeIds: databases.map((node) => node.id),
    });
  }

  const connectedCaches = connectedNodes.filter((node) => node.kind === "cache");
  if (
    input.readRatio >= 65 &&
    databases.length > 0 &&
    connectedCaches.length === 0
  ) {
    const dbIds = new Set(databases.map((node) => node.id));
    const immediateUpstream = edges
      .filter((edge) => dbIds.has(edge.to))
      .map((edge) => edge.from);

    pushFinding({
      id: "cache-opportunity",
      category: "Cache opportunity",
      severity: input.readRatio >= 80 ? "medium" : "low",
      title: `${input.readRatio}% read traffic reaches persistence without a connected cache`,
      detail:
        "No cache component is connected in the active data path, so repeated reads continue to reach the database/storage layer.",
      nodeIds: [...immediateUpstream, ...databases.map((node) => node.id)],
    });
  }

  const services = connectedNodes.filter((node) => node.kind === "service");
  const totalServiceReplicas = services.reduce(
    (sum, node) => sum + Math.max(1, numberProperty(node, "replicas", 1)),
    0,
  );

  if (
    input.effectiveTraffic >= 9000 &&
    services.length > 0 &&
    totalServiceReplicas <= 2
  ) {
    pushFinding({
      id: "service-scaling-risk",
      category: "Scaling risk",
      severity: input.effectiveTraffic >= 12000 ? "high" : "medium",
      title: `${totalServiceReplicas} service replica${totalServiceReplicas === 1 ? "" : "s"} carry ${input.effectiveTraffic.toLocaleString()} req/s`,
      detail:
        "The connected compute tier has little horizontal capacity relative to the current effective request load.",
      nodeIds: services.map((node) => node.id),
    });
  }

  const queues = connectedNodes.filter((node) => node.kind === "queue");
  if (
    input.effectiveTraffic >= 9000 &&
    writeRatio >= 50 &&
    queues.length === 0 &&
    databases.length > 0
  ) {
    const serviceNodes = connectedNodes.filter((node) => node.kind === "service");
    pushFinding({
      id: "write-scaling-risk",
      category: "Scaling risk",
      severity: "medium",
      title: "High write load has no connected buffering layer",
      detail: `${writeRatio}% writes at ${input.effectiveTraffic.toLocaleString()} req/s reach the data tier without a connected queue.`,
      nodeIds: [
        ...serviceNodes.map((node) => node.id),
        ...databases.map((node) => node.id),
      ],
    });
  }

  const longestPath = findLongestClientToDataPath(nodes, edges);
  if (
    longestPath.length >= 4 &&
    (input.networkLatency >= 180 ||
      input.p95Latency >= 160 ||
      input.monthlyCost >= 420)
  ) {
    const pathLabels = longestPath
      .map((id) => nodeById.get(id)?.label)
      .filter((label): label is string => Boolean(label));

    pushFinding({
      id: "expensive-path",
      category: "Expensive path",
      severity:
        input.networkLatency >= 260 || input.p95Latency >= 240
          ? "high"
          : "medium",
      title: `${pathLabels.length}-component client-to-data path is carrying the expensive route`,
      detail: `${pathLabels.join(" → ")} runs under ${input.networkLatency} ms configured network latency, ${input.p95Latency} ms p95, and a $${input.monthlyCost}/mo system estimate.`,
      nodeIds: longestPath,
    });
  }

  const corePairs = new Set(CORE_EDGES.map((edge) => `${edge.from}->${edge.to}`));
  input.userConnections.forEach((connection, index) => {
    const key = `user-${connection.from}-${connection.to}-${index}`;
    if (input.deletedEdges.includes(key)) return;

    const from = nodeById.get(connection.from);
    const to = nodeById.get(connection.to);
    if (!from || !to) return;

    const reason = questionableConnection(from, to);
    const duplicatesCore = corePairs.has(`${from.id}->${to.id}`);

    if (!reason && !duplicatesCore) return;

    pushFinding({
      id: `connection-${index}`,
      category: "Questionable connection",
      severity: reason ? "medium" : "low",
      title: `${from.label} → ${to.label} needs inspection`,
      detail:
        reason ??
        "This user-created edge duplicates an existing core connection between the same components.",
      nodeIds: [from.id, to.id],
    });
  });

  const orphanedAdded = nodes.filter(
    (node) => node.added && (degree.get(node.id) ?? 0) === 0,
  );
  if (orphanedAdded.length > 0) {
    pushFinding({
      id: "orphaned-components",
      category: "Topology",
      severity: "low",
      title:
        orphanedAdded.length === 1
          ? `${orphanedAdded[0].label} is not connected`
          : `${orphanedAdded.length} added components are not connected`,
      detail:
        "These components are present on the canvas but do not participate in any active request or data path.",
      nodeIds: orphanedAdded.map((node) => node.id),
    });
  }

  findings.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return severityDiff || a.category.localeCompare(b.category);
  });

  return {
    ready,
    nodeCount: nodes.length,
    connectedNodeCount: connectedNodes.length,
    edgeCount: edges.length,
    findings: findings.slice(0, 10),
  };
}
