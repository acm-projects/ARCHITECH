import { roleOf } from "../analysis.ts";
import { configureNode } from "../evaluation/capabilities.ts";
import type { ArchitectureEvaluation } from "../evaluation/contract.ts";
import { evaluateArchitecture } from "../evaluation/evaluate.ts";
import { TRAFFIC_LIMITS, sanitizeTraffic, type TrafficProfile } from "../evaluation/traffic.ts";
import { createDirectedGraph, reachableFrom, type GraphInput, type GraphNode } from "../graph.ts";
import type { NodeProperties } from "../types.ts";

// Incidents: what happens to a design when part of it fails, as the metrics engine models it.
// Pure and deterministic, so the same incident on the same design always gives the same answer.
//
// The failure rules are explicit and simple (this is a modelled incident, not chaos engineering):
//   component-down  every instance of a component is gone, with its connections. Requests that
//                   need it fail; parts only reachable through it are cut off.
//   instance-down   one instance is lost; the others carry on (a database promotes a replica).
//                   A component with one instance is then down.
//   capacity-drop   each instance does `factor` of its usual work (a slow disk, a bad deploy).
//   traffic-spike   requests arrive `multiplier` times faster.
// Which user operations still work is worked out from what the clients can still reach:
//   use the app     a client reaches an API server, gateway or other request handler
//   read data       a database is reachable along the request path (not through a queue and
//                   worker, which answer nobody); with only a cache, just its cache hits (partly)
//   save data       a database or a queue is reachable (queued writes are saved later)
//   sign in, search, files: their component is reachable along the request path; sign-ins and
//                   searches are the share of requests set on the component (authCheckRate, searchRate)
//   background jobs a worker is reachable; partly when it cannot keep up (a growing backlog)
// Requests still served = API requests whose operation still works (reads at the cache hit rate
// when only the cache answers), times the share the engine says the remaining design serves.

export type Incident =
  | { kind: "component-down"; nodeId: string }
  | { kind: "instance-down"; nodeId: string }
  | { kind: "capacity-drop"; nodeId: string; factor: number }
  | { kind: "traffic-spike"; multiplier: number };

export type OperationId = "use-app" | "read" | "save" | "sign-in" | "search" | "files" | "jobs";
export type OperationStatus = "works" | "partly" | "down";
export type Operation = { id: OperationId; label: string; status: OperationStatus; note?: string };

export type IncidentSnapshot = {
  ready: boolean;
  // Percent of API requests answered successfully, 0-100.
  servedPercent: number;
  capacityRps: number | null;
  p95LatencyMs: number;
  monthlyCost: number;
  // Components over or near capacity, most loaded first.
  overloaded: { nodeId: string; utilization: number }[];
};

export type IncidentImpact = {
  incident: Incident;
  // The incident in a sentence: "Orders DB goes down (all 1 instance)."
  description: string;
  // Components the failure removed outright, and components still there but cut off from clients.
  failed: string[];
  cutOff: string[];
  operations: Operation[];
  healthy: IncidentSnapshot;
  during: IncidentSnapshot;
  // Plain sentences: what broke, what kept working, and why.
  explanation: string[];
};

export const INCIDENT_LIMITS = { factor: { min: 0.05, max: 0.95 }, multiplier: { min: 1.1, max: 100 } } as const;

const OPERATION_LABELS: Record<OperationId, string> = {
  "use-app": "Use the app",
  read: "Read data",
  save: "Save data",
  "sign-in": "Sign in",
  search: "Search",
  files: "Upload and download files",
  jobs: "Background jobs",
};

type Node = GraphNode & { [key: string]: unknown };
const labelOf = (graph: GraphInput, id: string) => {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  return node ? node.data.label?.trim() || node.data.type : id;
};
const percent = (value: number) => `${Math.round(value * 10) / 10}%`;

// Checks an incident against a design: a known kind, a component that exists, sensible numbers.
export function parseIncident(raw: unknown, graph: GraphInput): { ok: true; incident: Incident } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "incident must be an object." };
  const value = raw as Record<string, unknown>;
  const exists = (id: unknown): id is string => typeof id === "string" && graph.nodes.some((node) => node.id === id);
  switch (value.kind) {
    case "component-down":
    case "instance-down":
      if (!exists(value.nodeId)) return { ok: false, error: "incident.nodeId must be a component of the design." };
      return { ok: true, incident: { kind: value.kind, nodeId: value.nodeId } };
    case "capacity-drop": {
      if (!exists(value.nodeId)) return { ok: false, error: "incident.nodeId must be a component of the design." };
      const { min, max } = INCIDENT_LIMITS.factor;
      if (typeof value.factor !== "number" || !(value.factor >= min && value.factor <= max)) return { ok: false, error: `incident.factor must be between ${min} and ${max}.` };
      return { ok: true, incident: { kind: "capacity-drop", nodeId: value.nodeId, factor: value.factor } };
    }
    case "traffic-spike": {
      const { min, max } = INCIDENT_LIMITS.multiplier;
      if (typeof value.multiplier !== "number" || !(value.multiplier >= min && value.multiplier <= max)) return { ok: false, error: `incident.multiplier must be between ${min} and ${max}.` };
      return { ok: true, incident: { kind: "traffic-spike", multiplier: value.multiplier } };
    }
    default:
      return { ok: false, error: 'incident.kind must be "component-down", "instance-down", "capacity-drop" or "traffic-spike".' };
  }
}

function withProperty(graph: GraphInput, nodeId: string, key: string, value: number): GraphInput {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, properties: { ...(node.data.properties ?? {}), [key]: value } as NodeProperties } } : node)),
  };
}
function without(graph: GraphInput, nodeId: string): GraphInput {
  return { nodes: graph.nodes.filter((node) => node.id !== nodeId), edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId) };
}

// The design and traffic during the incident, and which components it removed.
export function applyIncident(graph: GraphInput, traffic: TrafficProfile, incident: Incident): { graph: GraphInput; traffic: TrafficProfile; removed: string[]; description: string } {
  if (incident.kind === "traffic-spike") {
    const requestsPerSecond = Math.min(TRAFFIC_LIMITS.requestsPerSecond.max, traffic.requestsPerSecond * incident.multiplier);
    const concurrentUsers = Math.min(TRAFFIC_LIMITS.concurrentUsers.max, traffic.concurrentUsers * incident.multiplier);
    return { graph, traffic: { ...traffic, requestsPerSecond, concurrentUsers }, removed: [], description: `Traffic jumps ${incident.multiplier}× to ${Math.round(requestsPerSecond).toLocaleString("en-US")} req/s.` };
  }
  const node = graph.nodes.find((candidate) => candidate.id === incident.nodeId);
  // A component that is no longer in the design (the fix removed it) cannot fail.
  if (!node) return { graph, traffic, removed: [], description: `${incident.nodeId} is no longer in the design.` };
  const name = labelOf(graph, node.id);
  const config = configureNode(node);
  const isDatabase = roleOf(node.data.type) === "database";

  if (incident.kind === "capacity-drop") {
    if (config.capacityPerInstance === null) return { graph, traffic, removed: [], description: `${name} slows down, but it has no capacity limit to lose.` };
    const capacity = Math.max(1, config.capacityPerInstance * incident.factor);
    return { graph: withProperty(graph, node.id, "capacity", capacity), traffic, removed: [], description: `${name} drops to ${Math.round(incident.factor * 100)}% of its usual capacity.` };
  }
  if (incident.kind === "instance-down" && config.instances > 1) {
    const replicas = isDatabase ? config.instances - 2 : config.instances - 1;
    const description = isDatabase
      ? `${name}'s primary fails; a read replica takes over (${config.instances - 1} of ${config.instances} instances left).`
      : `One instance of ${name} fails (${config.instances - 1} of ${config.instances} left).`;
    return { graph: withProperty(graph, node.id, "replicas", replicas), traffic, removed: [], description };
  }
  const description =
    incident.kind === "instance-down"
      ? `${name}'s only instance fails, so ${name} is down.`
      : `${name} goes down (all ${config.instances} instance${config.instances === 1 ? "" : "s"}).`;
  return { graph: without(graph, node.id), traffic, removed: [node.id], description };
}

function snapshot(evaluation: ArchitectureEvaluation, structuralShare: number): IncidentSnapshot {
  const ready = evaluation.ready && structuralShare > 0;
  return {
    ready,
    servedPercent: ready ? Math.round(structuralShare * evaluation.metrics.availability * 1000) / 1000 : 0,
    capacityRps: ready ? evaluation.metrics.capacityRps : 0,
    p95LatencyMs: ready ? evaluation.metrics.p95LatencyMs : 0,
    monthlyCost: evaluation.metrics.estimatedMonthlyCost,
    overloaded: evaluation.bottlenecks.map((b) => ({ nodeId: b.nodeId, utilization: Math.round(b.utilization * 100) / 100 })).sort((a, b) => b.utilization - a.utilization),
  };
}

// What still works, from what the clients can reach.
function operationsOf(graph: GraphInput, healthy: GraphInput, traffic: TrafficProfile, backlog: boolean): { operations: Operation[]; share: number; reached: Set<string> } {
  const entries = graph.nodes.filter((node) => roleOf(node.data.type) === "entry").map((node) => node.id);
  const reached = reachableFrom(createDirectedGraph(graph), entries);
  // The request path: what answers a request while the client waits. Queues and workers do
  // their work later and answer nobody.
  const asyncTypes = new Set(["queue", "worker"]);
  const requestGraph: GraphInput = {
    nodes: graph.nodes.filter((node) => !asyncTypes.has(node.data.type)),
    edges: graph.edges.filter((edge) => {
      const type = (id: string) => graph.nodes.find((node) => node.id === id)?.data.type ?? "";
      return !asyncTypes.has(type(edge.source)) && !asyncTypes.has(type(edge.target));
    }),
  };
  const answered = reachableFrom(createDirectedGraph(requestGraph), entries);
  const inPath = (set: Set<string>) => (test: (node: Node) => boolean) => graph.nodes.some((node) => set.has(node.id) && !entries.includes(node.id) && test(node as Node));
  const reachable = inPath(answered);
  const reachableLater = inPath(reached);
  const had = (test: (node: Node) => boolean) => healthy.nodes.some((node) => test(node as Node));
  const isType = (...types: string[]) => (node: Node) => types.includes(node.data.type);
  const handles = (node: Node) => ["compute", "ingress", "custom"].includes(roleOf(node.data.type)) && node.data.type !== "worker";

  const appUp = reachable(handles);
  const operations: Operation[] = [{ id: "use-app", label: OPERATION_LABELS["use-app"], status: appUp ? "works" : "down" }];
  let readShare = 1;
  let saveShare = 1;

  if (had(isType("database"))) {
    const database = reachable(isType("database"));
    const caches = graph.nodes.filter((node) => answered.has(node.id) && node.data.type === "cache");
    const hitRate = caches.reduce((best, node) => Math.max(best, configureNode(node).hitRate), 0);
    readShare = !appUp ? 0 : database ? 1 : hitRate;
    operations.push({
      id: "read",
      label: OPERATION_LABELS.read,
      status: readShare >= 1 ? "works" : readShare > 0 ? "partly" : "down",
      ...(readShare > 0 && readShare < 1 ? { note: `Only cache hits, about ${Math.round(hitRate * 100)}% of reads.` } : {}),
    });
    // A queue accepts writes even while the database is unreachable; its worker saves them.
    const queued = reachableLater(isType("queue"));
    saveShare = appUp && (database || queued) ? 1 : 0;
    const note = !database && queued
      ? reachableLater(isType("database"))
        ? "Writes go through the queue, and its worker saves them."
        : "Writes wait on the queue and are saved once the database is back."
      : undefined;
    operations.push({ id: "save", label: OPERATION_LABELS.save, status: saveShare ? "works" : "down", ...(saveShare && note ? { note } : {}) });
  }
  // Requests that sign in or search are the share set on those components; they fail when it is down.
  let lostShare = 0;
  const optional: [OperationId, string][] = [["sign-in", "auth"], ["search", "search"], ["files", "object-storage"]];
  for (const [id, type] of optional) {
    if (!had(isType(type))) continue;
    const works = appUp && reachable(isType(type));
    operations.push({ id, label: OPERATION_LABELS[id], status: works ? "works" : "down" });
    if (!works && (type === "auth" || type === "search")) {
      const part = healthy.nodes.find((node) => node.data.type === type);
      if (part) lostShare += configureNode(part).checkRate;
    }
  }
  if (had(isType("worker"))) {
    const works = appUp && reachableLater(isType("worker"));
    operations.push({
      id: "jobs",
      label: OPERATION_LABELS.jobs,
      status: !works ? "down" : backlog ? "partly" : "works",
      ...(works && backlog ? { note: "Jobs arrive faster than the workers finish them, so the queue keeps growing." } : {}),
    });
  }
  const reads = traffic.readRatio / 100;
  const share = appUp ? (reads * readShare + (1 - reads) * saveShare) * Math.max(0, 1 - Math.min(1, lostShare)) : 0;
  return { operations, share, reached: answered };
}

// The design during the incident, compared with the design when healthy.
export function incidentImpact(graphInput: GraphInput, trafficInput: unknown, incident: Incident): IncidentImpact {
  const traffic = sanitizeTraffic(trafficInput).traffic;
  const graph: GraphInput = { nodes: graphInput.nodes, edges: graphInput.edges };
  const applied = applyIncident(graph, traffic, incident);

  const healthyEvaluation = evaluateArchitecture({ graph, traffic });
  const duringEvaluation = evaluateArchitecture({ graph: applied.graph, traffic: applied.traffic });
  const backlogOf = (evaluation: ArchitectureEvaluation) => evaluation.findings.some((finding) => finding.id.startsWith("backlog-") && finding.severity === "high");
  const healthyOps = operationsOf(graph, graph, traffic, backlogOf(healthyEvaluation));
  const duringOps = operationsOf(applied.graph, graph, applied.traffic, backlogOf(duringEvaluation));
  const healthy = snapshot(healthyEvaluation, healthyOps.share);
  const during = snapshot(duringEvaluation, duringOps.share);

  const healthyReached = healthyOps.reached;
  const cutOff = graph.nodes
    .map((node) => node.id)
    .filter((id) => healthyReached.has(id) && !applied.removed.includes(id) && !duringOps.reached.has(id));

  const explanation: string[] = [applied.description];
  const down = duringOps.operations.filter((operation) => operation.status === "down");
  const partly = duringOps.operations.filter((operation) => operation.status === "partly");
  if (cutOff.length > 0) explanation.push(`Clients can no longer reach ${cutOff.map((id) => labelOf(graph, id)).join(", ")}: every path to ${cutOff.length === 1 ? "it" : "them"} went through the failed part.`);
  if (down.length > 0) explanation.push(`Stopped working: ${down.map((operation) => operation.label.toLowerCase()).join(", ")}.`);
  for (const operation of partly) explanation.push(`${operation.label}: ${operation.note ?? "partly working."}`);
  for (const operation of duringOps.operations) if (operation.status === "works" && operation.note) explanation.push(`${operation.label} still works. ${operation.note}`);
  const newlyOverloaded = during.overloaded.filter((part) => part.utilization >= 1 && part.utilization > (healthy.overloaded.find((before) => before.nodeId === part.nodeId)?.utilization ?? 0) + 0.05);
  if (newlyOverloaded.length > 0) {
    explanation.push(`Now overloaded: ${newlyOverloaded.map((part) => `${labelOf(graph, part.nodeId)} (${Math.round(part.utilization * 100)}% of capacity)`).join(", ")}, so requests are dropped or delayed.`);
  }
  explanation.push(
    during.servedPercent >= healthy.servedPercent - 0.01
      ? duringOps.operations.every((operation) => operation.status === "works")
        ? `Requests served stay at ${percent(during.servedPercent)}: the design absorbs this failure.`
        : `Requests served stay at ${percent(during.servedPercent)}, but not everything works.`
      : `Requests served fall from ${percent(healthy.servedPercent)} to ${percent(during.servedPercent)}.`,
  );

  return {
    incident,
    description: applied.description,
    failed: applied.removed,
    cutOff,
    operations: duringOps.operations,
    healthy,
    during,
    explanation,
  };
}
