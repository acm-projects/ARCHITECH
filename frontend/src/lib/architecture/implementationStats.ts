import { roleOf } from "./analysis.ts";
import {
  implementationsFor,
  resolveImplementation,
  type ComponentImplementationSeed,
} from "./componentLibrary.ts";
import { ASSUMPTIONS, DATABASE_REPLICAS_MAX, REPLICAS_MAX } from "./evaluation/capabilities.ts";
import { usableGraph } from "./evaluation/input.ts";
import { simulate, type NodeSimulation } from "./evaluation/simulation.ts";
import { sanitizeTraffic, type TrafficProfile } from "./evaluation/traffic.ts";
import type { GraphInput, GraphNode } from "./graph.ts";
import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// What each technology would cost and need in the system being built. Every number comes from
// the evaluation engine itself (simulate), so it always agrees with Run Design:
//   - the load is what actually reaches the component through the design (after the servers,
//     caches and queues in front of it), at the current traffic;
//   - instances needed is the fewest that carry that load with headroom: utilization at or
//     below ASSUMPTIONS.nearCapacityUtilization (the point Run Design calls "near capacity");
//   - monthly cost is for that many instances, plus storage for the dataset (databases and
//     object storage), exactly as Run Design prices it.
// A component that is not connected to a client yet gets an estimate from the traffic
// settings instead (basis "traffic"), so technologies can be compared before anything is wired.

export type TechnologyEstimate = {
  implementation: ComponentImplementationSeed;
  // Load reaching the component, requests (or operations) per second.
  demandRps: number;
  // Instances needed (a database: primary plus read replicas). null: capacity never limits it.
  instancesNeeded: number | null;
  // The `replicas` setting that gives instancesNeeded (a database: read replicas).
  replicasNeeded: number | null;
  // False when even the most instances allowed cannot carry the load (e.g. too many writes
  // for one database primary).
  enough: boolean;
  monthlyCost: number;
  // The part of monthlyCost that is storage for the dataset.
  storageCost: number;
  // This component's latency at that load.
  latencyMs: number;
};

export type TechnologyComparison = {
  // "design": measured in the user's design. "traffic": estimated from the traffic settings.
  basis: "design" | "traffic";
  demandRps: number;
  // The default first, as in the component library.
  options: TechnologyEstimate[];
};

const TARGET_UTILIZATION = ASSUMPTIONS.nearCapacityUtilization;

// Properties for sizing: the technology's own defaults (no capacity or hit rate override),
// with `replicas` set by the search.
function sizingProperties(properties: NodeProperties | undefined, replicas: number): NodeProperties {
  const rest: NodeProperties = { ...properties };
  delete rest.capacity;
  delete rest.cacheHitRate;
  return { ...rest, replicas };
}

function withNode(graph: GraphInput, nodeId: string, data: GraphNode["data"]): GraphInput {
  return {
    nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, data } : node)),
    edges: graph.edges,
  };
}

function nodeResult(graph: GraphInput, traffic: TrafficProfile, nodeId: string): NodeSimulation {
  const found = simulate(graph, traffic).nodes.find((node) => node.id === nodeId);
  if (!found) throw new Error(`Node "${nodeId}" is not in the graph.`);
  return found;
}

// Sizes one technology for the component `nodeId` of `graph`.
function sizeTechnology(
  graph: GraphInput,
  traffic: TrafficProfile,
  nodeId: string,
  implementation: ComponentImplementationSeed,
): TechnologyEstimate {
  const original = graph.nodes.find((node) => node.id === nodeId) as GraphNode;
  const type = original.data.type;
  const isDatabase = roleOf(type) === "database";
  const minReplicas = isDatabase ? 0 : 1;
  const maxReplicas = isDatabase ? DATABASE_REPLICAS_MAX : REPLICAS_MAX;
  const at = (replicas: number) =>
    nodeResult(
      withNode(graph, nodeId, {
        ...original.data,
        ...(implementation.isDefault ? { implementation: undefined } : { implementation: implementation.id }),
        properties: sizingProperties(original.data.properties, replicas),
      }),
      traffic,
      nodeId,
    );
  const fits = (result: NodeSimulation) => result.utilization <= TARGET_UTILIZATION;

  let result = at(minReplicas);
  let replicas = minReplicas;
  let enough = true;
  if (implementation.capacityPerInstance !== null && !fits(result)) {
    // Grow until it fits (doubling), then binary search for the fewest replicas that fit.
    let low = minReplicas;
    let high = Math.max(1, minReplicas);
    let highResult = at(high);
    while (!fits(highResult) && high < maxReplicas) {
      low = high;
      high = Math.min(maxReplicas, high * 2);
      highResult = at(high);
    }
    if (!fits(highResult)) {
      enough = false;
      replicas = maxReplicas;
      result = highResult;
    } else {
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        const midResult = at(mid);
        if (fits(midResult)) {
          high = mid;
          highResult = midResult;
        } else low = mid;
      }
      replicas = high;
      result = highResult;
    }
  }

  const storagePerGb =
    result.config.role === "database"
      ? ASSUMPTIONS.databaseCostPerGb
      : result.config.role === "storage"
        ? ASSUMPTIONS.storageCostPerGb
        : 0;
  const capacityLimited = implementation.capacityPerInstance !== null;
  return {
    implementation,
    demandRps: result.demandRps,
    instancesNeeded: capacityLimited ? result.config.instances : null,
    replicasNeeded: capacityLimited ? replicas : null,
    enough,
    monthlyCost: result.config.monthlyCost,
    storageCost: traffic.datasetGb * storagePerGb,
    latencyMs: result.latencyMs,
  };
}

// The smallest design that sends the traffic through a component of this type the usual way:
// front doors are reached from the client directly, a worker consumes a queue, and everything
// else sits behind a server. Whatever is in front is made big enough never to be the limit, so
// only the subject is being sized.
function trafficGraph(type: ArchitectureNodeType): { graph: GraphInput; nodeId: string } {
  const role = roleOf(type);
  const subject: GraphNode = { id: "subject", data: { type } };
  if (role === "entry") return { graph: { nodes: [subject], edges: [] }, nodeId: "subject" };
  const huge = { replicas: REPLICAS_MAX };
  const chain: GraphNode[] = [{ id: "client", data: { type: "client" } }];
  if (role !== "edge" && role !== "ingress" && type !== "server") {
    chain.push({ id: "server", data: { type: "server", properties: huge } });
    if (type === "worker") chain.push({ id: "queue", data: { type: "queue", properties: huge } });
  }
  chain.push(subject);
  return {
    graph: {
      nodes: chain,
      edges: chain.slice(1).map((node, index) => ({ source: chain[index].id, target: node.id })),
    },
    nodeId: "subject",
  };
}

// Every technology for a component type, estimated from the traffic settings alone (for the
// component library, before anything is placed or connected).
export function compareTechnologiesForTraffic(
  type: ArchitectureNodeType,
  traffic: unknown,
): TechnologyComparison {
  const clean = sanitizeTraffic(traffic).traffic;
  const { graph, nodeId } = trafficGraph(type);
  const options = implementationsFor(type).map((implementation) =>
    sizeTechnology(graph, clean, nodeId, implementation),
  );
  return { basis: "traffic", demandRps: options[0]?.demandRps ?? 0, options };
}

// Every technology for one component of a design, measured in that design. Falls back to the
// traffic estimate while the component receives no load (not connected to a client yet).
export function compareTechnologiesForNode(
  graphInput: unknown,
  traffic: unknown,
  nodeId: string,
): TechnologyComparison | null {
  const graph = usableGraph(graphInput);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;
  const clean = sanitizeTraffic(traffic).traffic;
  const type = node.data.type;
  const current = nodeResult(graph, clean, nodeId);
  if (!current.reachable || current.demandRps <= 0) return compareTechnologiesForTraffic(type, clean);
  const options = implementationsFor(type).map((implementation) =>
    sizeTechnology(graph, clean, nodeId, implementation),
  );
  return { basis: "design", demandRps: current.demandRps, options };
}

// The id a node is using, for marking the current option.
export function currentImplementationId(type: ArchitectureNodeType, implementation: string | undefined): string {
  return resolveImplementation(type, implementation).id;
}

// ---- Display ----

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatRate(value: number): string {
  if (value >= 10_000) return `${whole.format(Math.round(value / 1_000))}k`;
  return whole.format(value);
}

export function formatMonthlyCost(value: number): string {
  return `$${whole.format(Math.round(value))}/mo`;
}

export function formatLatency(value: number): string {
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : whole.format(value)} ms`;
}

// "3 instances", "needs more than 51 instances", or null when capacity never limits it.
export function formatInstances(estimate: TechnologyEstimate): string | null {
  if (estimate.instancesNeeded === null) return null;
  if (!estimate.enough) return `over ${estimate.instancesNeeded} instances`;
  return `${estimate.instancesNeeded} instance${estimate.instancesNeeded === 1 ? "" : "s"}`;
}
