import { analyzeGraph, type ArchitectureFinding } from "../analysis.ts";
import type { GraphInput } from "../graph.ts";
import { ASSUMPTIONS } from "./capabilities.ts";
import type {
  EvaluationFinding,
  FindingCategory,
  Recommendation,
  Severity,
} from "./contract.ts";
import type { NodeSimulation, Simulation } from "./simulation.ts";
import type { TrafficProfile } from "./traffic.ts";

// Turns a simulation into findings: specific, ranked observations about this design, each
// naming the components involved and carrying the advice that follows from it. Topology
// findings (single points of failure, missing redundancy, odd connections, a missing
// cache) come from the shared analysis in ../analysis.ts, so there is one definition of them.

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const CATEGORY_ORDER: FindingCategory[] = [
  "scalability",
  "reliability",
  "performance",
  "architecture",
  "cost",
];

const SLOW_MEDIUM_MS = 400;
const SLOW_HIGH_MS = 1_000;
const LONG_PATH_COMPONENTS = 7;
const LOW_AVAILABILITY = 0.999;
const VERY_LOW_AVAILABILITY = 0.99;
const OVERPROVISIONED_UTILIZATION = 0.15;
const LOW_READ_SHARE = 0.3;
const IDLE_COST_SHARE_FOR_MEDIUM = 0.2;

const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const rps = (value: number) => `${Math.round(value).toLocaleString("en-US")} req/s`;

// What to do about a component that is out of capacity, by what it is.
function scaleAdvice(node: NodeSimulation, label: string, writeShare: number): string {
  switch (node.config.role) {
    case "database":
      return writeShare >= 0.5
        ? `Buffer writes to ${label} through a queue or split the data across more databases; read replicas do not help a write-heavy load.`
        : `Add read replicas to ${label}, or put a cache in front of it, to take reads off the primary.`;
    case "cache":
      return `Add instances to ${label} or raise its capacity.`;
    case "queue":
      return `Add instances to ${label} so it can accept writes as fast as they arrive.`;
    case "ingress":
      return `Add instances to ${label}, or spread traffic across a second ${node.config.type === "load-balancer" ? "load balancer" : "gateway"}.`;
    case "compute":
      return `Add instances of ${label} (raise its replicas) or spread its work across more services.`;
    default:
      return `Add instances of ${label} to raise its capacity.`;
  }
}

const TOPOLOGY: Record<string, { category: FindingCategory; recommendation: (f: ArchitectureFinding) => string }> = {
  spof: {
    category: "reliability",
    recommendation: (f) =>
      `Run more than one instance of ${f.components[0] ?? "this component"}, or add a second path, so losing it does not cut off what is behind it.`,
  },
  "database-redundancy": {
    category: "reliability",
    recommendation: (f) =>
      `Add a read replica or standby for ${f.components[0] ?? "the database"} so it survives the loss of its primary.`,
  },
  "cache-opportunity": {
    category: "performance",
    recommendation: () =>
      "Add a cache between the service and the database so repeated reads are answered without reaching it.",
  },
  connection: {
    category: "architecture",
    recommendation: (f) =>
      `Check whether ${f.components.join(" → ")} should go through an intermediate component, and remove the connection if it was a mistake.`,
  },
};

// A tangled design can close many loops; the first few are enough to point at the problem.
const MAX_CYCLE_FINDINGS = 3;

function topologyFindings(
  input: GraphInput,
  traffic: TrafficProfile,
  sim: Simulation,
): EvaluationFinding[] {
  const redundantNodeIds = new Set(
    sim.nodes.filter((node) => node.config.instances >= 2).map((node) => node.id),
  );
  // Load figures are zeroed so the shared analysis reports only structure; capacity and
  // latency are judged by the simulation.
  const analysis = analyzeGraph(
    input,
    {
      requestsPerSecond: 0,
      datasetGb: 0,
      readRatio: traffic.readRatio,
      networkLatencyMs: 0,
    },
    { redundantNodeIds },
  );

  const findings: EvaluationFinding[] = [];
  for (const finding of analysis.findings) {
    const kind = Object.keys(TOPOLOGY).find((prefix) => finding.id.startsWith(prefix));
    if (!kind) continue;
    findings.push({
      id: finding.id,
      category: TOPOLOGY[kind].category,
      severity: finding.severity,
      title: finding.title,
      message: finding.detail,
      nodeIds: finding.nodeIds,
      recommendation: TOPOLOGY[kind].recommendation(finding),
    });
  }
  return findings;
}

export function buildFindings(
  input: GraphInput,
  traffic: TrafficProfile,
  sim: Simulation,
): EvaluationFinding[] {
  const labels = new Map(input.nodes.map((node) => [node.id, node.data.label?.trim() || node.data.type]));
  const label = (id: string) => labels.get(id) ?? id;
  const findings: EvaluationFinding[] = [];

  if (!sim.ready) {
    findings.push({
      id: "no-entry-point",
      category: "architecture",
      severity: "high",
      title: input.nodes.length === 0 ? "The architecture is empty" : "No request reaches a component",
      message:
        input.nodes.length === 0
          ? "There is nothing to evaluate yet."
          : "No client is connected to a component that can receive its requests.",
      nodeIds: [],
      recommendation: "Add a client and connect it to the first component a request reaches.",
    });
    return findings;
  }

  const reachable = sim.nodes.filter((node) => node.reachable);

  // A request path that loops back on itself. Evaluation cuts the loop where it closes, so the
  // numbers are still sound, but the design is almost certainly not what was meant.
  for (const cycle of sim.cycles.slice(0, MAX_CYCLE_FINDINGS)) {
    const path = cycle.map(label).join(" -> ");
    findings.push({
      id: `request-cycle-${cycle.join("--")}`,
      category: "architecture",
      severity: "low",
      title: `Request path contains a cycle: ${path}.`,
      message: "A request can reach a component it has already passed through. The evaluation ignores the connection that closes the loop.",
      nodeIds: [...new Set(cycle)],
      recommendation: `Remove the connection from ${label(cycle[cycle.length - 2])} back to ${label(cycle[cycle.length - 1])}; requests should flow in one direction.`,
    });
  }

  const syncReachable = reachable.filter((node) => node.sync);

  // ---- Architecture ----
  const connectedEntries = new Set(sim.entryIds);
  for (const node of sim.nodes) {
    if (node.config.role === "entry" && !connectedEntries.has(node.id)) {
      findings.push({
        id: `entry-disconnected-${node.id}`,
        category: "architecture",
        severity: "medium",
        title: `${label(node.id)} is not connected`,
        message: "This client sends no requests because it has no outgoing connection.",
        nodeIds: [node.id],
        recommendation: `Connect ${label(node.id)} to the component it should send requests to, or remove it.`,
      });
    }
  }

  if (!reachable.some((node) => node.config.role === "compute")) {
    findings.push({
      id: "no-backend",
      category: "architecture",
      severity: "high",
      title: "Requests never reach a backend service",
      message: "No server or worker is on any request path, so nothing runs the application logic.",
      nodeIds: reachable.filter((node) => node.config.role !== "entry").map((node) => node.id),
      recommendation: "Add a server and connect the request path through it.",
    });
  }

  const storeRoles = ["database", "storage"];
  for (const node of sim.nodes) {
    if (storeRoles.includes(node.config.role) && !node.reachable) {
      findings.push({
        id: `unreachable-data-${node.id}`,
        category: "architecture",
        severity: "medium",
        title: `${label(node.id)} receives no requests`,
        message: "No request path leads from a client to this data store, so it holds data nothing can read or write.",
        nodeIds: [node.id],
        recommendation: `Connect a service to ${label(node.id)}, or remove it to avoid paying for it.`,
      });
    }
  }
  if (
    reachable.some((node) => node.config.role === "compute") &&
    !reachable.some((node) => storeRoles.includes(node.config.role)) &&
    sim.writeShare > 0
  ) {
    findings.push({
      id: "no-data-store",
      category: "architecture",
      severity: "low",
      title: "Writes have nowhere to be stored",
      message: `${percent(sim.writeShare)} of requests are writes, but no database or storage is on a request path.`,
      nodeIds: [],
      recommendation: "Connect a database or object storage to the service that handles writes.",
    });
  }

  for (const node of reachable) {
    const hasConsumer = input.edges.some(
      (edge) => edge.source === node.id && edge.target !== node.id && labels.has(edge.target),
    );
    if (node.config.role === "queue" && !hasConsumer) {
      findings.push({
        id: `queue-no-consumer-${node.id}`,
        category: "architecture",
        severity: "medium",
        title: `${label(node.id)} has no consumer`,
        message: "Messages are accepted but nothing is connected to read them, so work piles up.",
        nodeIds: [node.id],
        recommendation: `Connect a worker or service after ${label(node.id)} to process its messages.`,
      });
    }
  }

  // ---- Capacity ----
  for (const node of reachable) {
    if (node.utilization < ASSUMPTIONS.nearCapacityUtilization || node.config.capacityPerInstance === null) {
      continue;
    }
    const over = node.utilization >= 1;
    const use = `${percent(node.utilization)} of capacity (${rps(node.demandRps)} against ${rps(node.capacityRps ?? 0)})`;
    if (node.sync) {
      findings.push({
        id: `saturated-${node.id}`,
        category: "scalability",
        severity: over ? "high" : "medium",
        title: over ? `${label(node.id)} is overloaded` : `${label(node.id)} is close to its capacity`,
        message: `${label(node.id)} is at ${use}${over ? ", so requests are dropped or delayed" : ""}.`,
        nodeIds: [node.id],
        recommendation: scaleAdvice(node, label(node.id), sim.writeShare),
      });
    } else {
      findings.push({
        id: `backlog-${node.id}`,
        category: "scalability",
        severity: over ? "high" : "medium",
        title: over ? `${label(node.id)} cannot keep up with queued work` : `${label(node.id)} is close to keeping up with queued work`,
        message: `${label(node.id)} handles queued work at ${use}${over ? ", so the backlog keeps growing" : ""}.`,
        nodeIds: [node.id],
        recommendation: `Add instances of ${label(node.id)} so queued work drains as fast as it arrives.`,
      });
    }
  }

  // ---- Performance ----
  if (sim.p95LatencyMs >= SLOW_MEDIUM_MS) {
    const path = sim.criticalPath.filter((id) => sim.nodes.find((n) => n.id === id)?.config.role !== "entry");
    const slowest = path
      .map((id) => sim.nodes.find((n) => n.id === id) as NodeSimulation)
      .reduce<NodeSimulation | null>(
        (worst, node) => (!worst || node.latencyMs > worst.latencyMs ? node : worst),
        null,
      );
    findings.push({
      id: "slow-requests",
      category: "performance",
      severity: sim.p95LatencyMs >= SLOW_HIGH_MS ? "high" : "medium",
      title: `p95 latency is ${Math.round(sim.p95LatencyMs)} ms`,
      message: slowest
        ? `The slowest common request path adds ${Math.round(sim.p95LatencyMs)} ms; the largest share is ${label(slowest.id)} (${Math.round(slowest.latencyMs)} ms).`
        : `The client's network round trip alone accounts for ${Math.round(sim.p95LatencyMs)} ms.`,
      nodeIds: path,
      recommendation: !slowest
        ? "Serve requests closer to the client, for example from a CDN."
        : slowest.utilization >= ASSUMPTIONS.nearCapacityUtilization
          ? `Relieve ${label(slowest.id)}: it is slow because it is close to or over capacity.`
          : `Shorten the request path or serve more requests before ${label(slowest.id)}, for example with a cache.`,
    });
  }
  const pathComponents = sim.criticalPath.filter((id) => sim.nodes.find((n) => n.id === id)?.config.role !== "entry");
  if (pathComponents.length >= LONG_PATH_COMPONENTS) {
    findings.push({
      id: "long-request-path",
      category: "performance",
      severity: "low",
      title: `Requests cross ${pathComponents.length} components`,
      message: "Every component on the path adds latency and another thing that can fail.",
      nodeIds: pathComponents,
      recommendation: "Remove components from the request path that do not need to be there, or combine them.",
    });
  }
  for (const node of reachable) {
    if (node.config.role === "cache" && sim.readShare < LOW_READ_SHARE) {
      findings.push({
        id: `cache-low-benefit-${node.id}`,
        category: "performance",
        severity: "low",
        title: `${label(node.id)} helps little with this workload`,
        message: `Only ${percent(sim.readShare)} of requests are reads, and caches mostly speed up reads.`,
        nodeIds: [node.id],
        recommendation: `Remove ${label(node.id)} for this workload, or use a queue to absorb the writes instead.`,
      });
    }
  }

  // ---- Reliability ----
  if (sim.uptimeAvailability < LOW_AVAILABILITY) {
    const weakest = syncReachable
      .filter((node) => node.config.role !== "entry")
      .reduce<NodeSimulation | null>(
        (worst, node) => (!worst || node.config.availability < worst.config.availability ? node : worst),
        null,
      );
    findings.push({
      id: "low-availability",
      category: "reliability",
      severity: sim.uptimeAvailability < VERY_LOW_AVAILABILITY ? "high" : "medium",
      title: `Availability is ${(sim.uptimeAvailability * 100).toFixed(2)}%`,
      message: weakest
        ? `Every request depends on a chain of single instances; ${label(weakest.id)} is the least available link.`
        : "Every request depends on a chain of single instances.",
      nodeIds: weakest ? [weakest.id] : [],
      recommendation: weakest
        ? `Run more than one instance of ${label(weakest.id)} and put a load balancer in front of the instances.`
        : "Run more than one instance of each component on the request path.",
    });
  }

  // ---- Cost ----
  const idle = sim.nodes.filter((node) => !node.reachable && node.config.role !== "entry");
  if (idle.length > 0) {
    const idleCost = idle.reduce((sum, node) => sum + node.config.monthlyCost, 0);
    findings.push({
      id: "idle-components",
      category: "cost",
      severity: idleCost / Math.max(1, sim.monthlyCost) >= IDLE_COST_SHARE_FOR_MEDIUM ? "medium" : "low",
      title: idle.length === 1 ? `${label(idle[0].id)} serves no requests` : `${idle.length} components serve no requests`,
      message: `${idle.length === 1 ? "It adds" : "They add"} about ${money(idleCost)} a month and are not on any request path.`,
      nodeIds: idle.map((node) => node.id),
      recommendation: "Connect them to the request path, or remove them.",
    });
  }
  if (sim.requestedRps > 0) {
    for (const node of syncReachable) {
      if (
        ["compute", "ingress", "cache"].includes(node.config.role) &&
        node.config.instances > 1 &&
        node.utilization < OVERPROVISIONED_UTILIZATION
      ) {
        findings.push({
          id: `overprovisioned-${node.id}`,
          category: "cost",
          severity: "low",
          title: `${label(node.id)} has more capacity than it needs`,
          message: `${node.config.instances} instances run at ${percent(node.utilization)} of capacity.`,
          nodeIds: [node.id],
          recommendation: `Reduce the replicas of ${label(node.id)}, keeping at least two if availability matters.`,
        });
      }
    }
  }

  findings.push(...topologyFindings(input, traffic, sim));

  // One finding per id, most severe first, with a stable order for ties.
  const seen = new Set<string>();
  return findings
    .filter((finding) => !seen.has(finding.id) && seen.add(finding.id))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

// One recommendation per finding, in the findings' order.
export function buildRecommendations(findings: readonly EvaluationFinding[]): Recommendation[] {
  return findings.map((finding) => ({
    id: `recommend-${finding.id}`,
    findingId: finding.id,
    severity: finding.severity,
    text: finding.recommendation,
    nodeIds: finding.nodeIds,
  }));
}
