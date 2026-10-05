import type { Mode } from "../../types";
import { canReachAny, createDirectedGraph, reachableFrom } from "./architectureGraph";
import {
  getDefaultNodeProperties,
  getNodeKind,
  type NodePropertyValues,
} from "./workspaceData";

export type CoreNodeId = "client" | "gateway" | "service" | "queue" | "db";

export const CORE_NODE_IDS: readonly CoreNodeId[] = [
  "client",
  "gateway",
  "service",
  "queue",
  "db",
];

export interface NodeOffset {
  x: number;
  y: number;
}

export interface AddedComponent {
  id: string;
  name: string;
}

export interface Connection {
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
  label?: string;
}

export interface SimulationInputs {
  running: boolean;
  stressComplete: boolean;
  stressProgress: number;
  traffic: number;
  dataset: number;
  readRatio: number;
  networkLatency: number;
  nodeNames: readonly string[];
  addedComponents: AddedComponent[];
  nodeProperties: Record<string, NodePropertyValues>;
  deletedNodes: string[];
  deletedEdges: string[];
  userConnections: Connection[];
}

export interface NodeRuntimeMetrics {
  id: CoreNodeId;
  replicas: number;
  demand: number;
  capacity: number;
  utilization: number;
  baseLatency: number;
  latency: number;
  reliability: number;
  monthlyCost: number;
}

export interface SimulationMetrics {
  effectiveTraffic: number;
  bottleneckId: Exclude<CoreNodeId, "client">;
  bottleneckUtilization: number;
  showBottleneck: boolean;
  healthScore: number;
  p95Latency: number;
  monthlyCost: number;
  availability: number;
  stressStage: string;
  nodeMetrics: Record<CoreNodeId, NodeRuntimeMetrics>;
}

export const NODE_NAMES: Record<Mode, readonly [string, string, string, string, string]> = {
  learn: ["Smart TV", "Load Balancer", "Playback Service", "CDN Edge", "Content Store"],
  challenge: ["Web Client", "API Gateway", "Checkout Service", "Message Queue", "PostgreSQL"],
};

export const CORE_CONNECTIONS = [
  { key: "client-gateway", from: "client", to: "gateway" },
  { key: "gateway-service", from: "gateway", to: "service" },
  { key: "gateway-queue", from: "gateway", to: "queue" },
  { key: "queue-db", from: "queue", to: "db" },
] as const;

export type CoreEdgeKey = (typeof CORE_CONNECTIONS)[number]["key"];

export const BASE_NODE_POINTS: Record<CoreNodeId, NodeOffset> = {
  client: { x: 117, y: 305 },
  gateway: { x: 337, y: 200 },
  service: { x: 647, y: 136 },
  queue: { x: 647, y: 363 },
  db: { x: 913, y: 514 },
};

export const RUN_STAGE_MESSAGES = [
  "Request leaves the client",
  "Load balancer selects a healthy route",
  "Service processes business logic",
  "Queue absorbs asynchronous work",
  "Database commits the result",
] as const;

export const RUN_STAGE_EXPLANATIONS = [
  "The client packages the request and starts the latency clock.",
  "Traffic is distributed so no single service instance is overwhelmed.",
  "The service validates and processes the request.",
  "The queue smooths the traffic spike and protects downstream systems.",
  "The database persists the final state and returns success.",
] as const;

const NODE_ID_BY_LABEL: Record<string, CoreNodeId> = {
  "Smart TV": "client",
  "Web Client": "client",
  "Load Balancer": "gateway",
  "API Gateway": "gateway",
  "Playback Service": "service",
  "Checkout Service": "service",
  "CDN Edge": "queue",
  "Message Queue": "queue",
  "Content Store": "db",
  PostgreSQL: "db",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numeric(values: NodePropertyValues, key: string, fallback: number) {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : fallback;
}

function nodeValues(
  id: string,
  name: string,
  nodeProperties: Record<string, NodePropertyValues>,
) {
  return {
    ...getDefaultNodeProperties(name),
    ...(nodeProperties[id] ?? {}),
  };
}

function makeMetric(
  id: CoreNodeId,
  demand: number,
  replicas: number,
  capacity: number,
  baseLatency: number,
  reliability: number,
  monthlyCost: number,
): NodeRuntimeMetrics {
  const utilization = capacity <= 0 ? 0 : (demand / capacity) * 100;
  const pressure = Math.max(0, utilization - 62);
  const latency = Math.round(
    baseLatency *
      (1 + pressure / 42 + Math.max(0, utilization - 100) / 16),
  );
  const adjustedReliability = clamp(
    reliability - Math.max(0, utilization - 82) * 0.018,
    96,
    99.999,
  );

  return {
    id,
    replicas,
    demand: Math.round(demand),
    capacity: Math.round(capacity),
    utilization,
    baseLatency,
    latency,
    reliability: adjustedReliability,
    monthlyCost: Math.round(monthlyCost),
  };
}

export function getNodeNames(mode: Mode) {
  return NODE_NAMES[mode];
}

export function getNodeIdForLabel(label: string): CoreNodeId | undefined {
  return NODE_ID_BY_LABEL[label];
}

export function getSelectedNodeId(selected: string, names: readonly string[]): CoreNodeId | null {
  const index = names.indexOf(selected);
  return CORE_NODE_IDS[index] ?? null;
}

export function getAddedNodeBasePoint(index: number): NodeOffset {
  const columns = [190, 410, 630, 850];
  const row = Math.floor(index / columns.length);

  return {
    x: columns[index % columns.length],
    y: Math.min(590, 475 + row * 95),
  };
}

export function calculateSimulation(inputs: SimulationInputs): SimulationMetrics {
  const {
    running,
    stressComplete,
    stressProgress,
    traffic,
    dataset,
    readRatio,
    networkLatency,
    nodeNames,
    addedComponents,
    nodeProperties,
    deletedNodes,
    deletedEdges,
    userConnections,
  } = inputs;

  const stressFactor = running
    ? 1 + 1.2 * (stressProgress / 100)
    : stressComplete
      ? 2.2
      : 1;
  const effectiveTraffic = Math.max(100, Math.round(traffic * stressFactor));
  const activeCoreIds = CORE_NODE_IDS.filter((id) => !deletedNodes.includes(id));
  const nodeIds = [
    ...activeCoreIds,
    ...addedComponents.map((component) => component.id),
  ];
  const activeEdges = [
    ...CORE_CONNECTIONS
      .filter(
        (edge) =>
          !deletedEdges.includes(edge.key) &&
          !deletedNodes.includes(edge.from) &&
          !deletedNodes.includes(edge.to),
      )
      .map(({ from, to }) => ({ from, to })),
    ...userConnections.flatMap((connection, index) => {
      const edgeKey = `user-${connection.from}-${connection.to}-${index}`;
      if (
        deletedEdges.includes(edgeKey) ||
        deletedNodes.includes(connection.from) ||
        deletedNodes.includes(connection.to)
      ) {
        return [];
      }
      return [{ from: connection.from, to: connection.to }];
    }),
  ];
  const graph = createDirectedGraph(nodeIds, activeEdges);
  const reachable = reachableFrom(graph, ["client"]);
  const nameById = new Map<string, string>(
    CORE_NODE_IDS.map((id, index) => [id, nodeNames[index] ?? id]),
  );
  for (const component of addedComponents) {
    nameById.set(component.id, component.name);
  }
  const dataTargets = new Set(
    nodeIds.filter((id) => {
      const kind = getNodeKind(nameById.get(id) ?? id);
      return kind === "database" || kind === "storage";
    }),
  );

  let cacheOffload = 0;
  let ingressCapacityBonus = 0;
  let serviceCapacityBonus = 0;
  let queueCapacityBonus = 0;
  let databaseCapacityBonus = 0;
  let extraMonthlyCost = 0;

  addedComponents.forEach((component) => {
    const kind = getNodeKind(component.name);
    const values = nodeValues(component.id, component.name, nodeProperties);
    const receivesTraffic = reachable.has(component.id);
    const reachesData =
      receivesTraffic && canReachAny(graph, component.id, dataTargets);

    switch (kind) {
      case "cache":
        if (reachesData) {
          cacheOffload += Math.min(
            0.28,
            0.12 + numeric(values, "memory", 8) / 160,
          );
        }
        extraMonthlyCost += 22 + numeric(values, "memory", 8) * 1.8;
        break;
      case "cdn":
        if (reachesData) {
          cacheOffload += Math.min(
            0.34,
            numeric(values, "regions", 35) / 140,
          );
          ingressCapacityBonus += 5000;
        }
        extraMonthlyCost += 38 + numeric(values, "regions", 35) * 0.7;
        break;
      case "lb":
        if (receivesTraffic) {
          ingressCapacityBonus += numeric(values, "capacity", 12000) * 0.75;
        }
        extraMonthlyCost += 48;
        break;
      case "gateway":
        if (receivesTraffic) ingressCapacityBonus += 9000;
        extraMonthlyCost += 54;
        break;
      case "service": {
        const replicas = Math.max(1, numeric(values, "replicas", 3));
        if (receivesTraffic) serviceCapacityBonus += replicas * 2500;
        extraMonthlyCost += replicas * 42;
        break;
      }
      case "queue": {
        const partitions = Math.max(1, numeric(values, "partitions", 12));
        if (reachesData) queueCapacityBonus += partitions * 700;
        extraMonthlyCost += 36 + partitions * 2.2;
        break;
      }
      case "database": {
        const replicas = Math.max(0, numeric(values, "replicas", 2));
        if (receivesTraffic) {
          databaseCapacityBonus += 4200 + replicas * 1800;
        }
        extraMonthlyCost += 86 + replicas * 58;
        break;
      }
      case "storage":
        extraMonthlyCost += numeric(values, "capacity", 2000) * 0.035;
        break;
      case "external":
        extraMonthlyCost += 45;
        break;
      case "client":
        break;
    }
  });

  cacheOffload = clamp(cacheOffload, 0, 0.68);

  const gatewayName = nodeNames[1] ?? "API Gateway";
  const serviceName = nodeNames[2] ?? "API Server";
  const queueName = nodeNames[3] ?? "Queue";
  const databaseName = nodeNames[4] ?? "Database";

  const gatewayValues = nodeValues("gateway", gatewayName, nodeProperties);
  const serviceValues = nodeValues("service", serviceName, nodeProperties);
  const queueValues = nodeValues("queue", queueName, nodeProperties);
  const databaseValues = nodeValues("db", databaseName, nodeProperties);

  const gatewayKind = getNodeKind(gatewayName);
  const queueKind = getNodeKind(queueName);
  const databaseKind = getNodeKind(databaseName);

  const gatewayBaseCapacity =
    gatewayKind === "lb" ? numeric(gatewayValues, "capacity", 12000) : 10000;
  const serviceReplicas = Math.max(1, numeric(serviceValues, "replicas", 3));
  const serviceBaseCapacity = serviceReplicas * 2500;
  const queuePartitions = Math.max(1, numeric(queueValues, "partitions", 12));
  const queueBaseCapacity = queueKind === "cdn" ? 18000 : queuePartitions * 700;
  const databaseReplicas = Math.max(
    0,
    numeric(databaseValues, "replicas", databaseKind === "storage" ? 1 : 2),
  );
  const databaseBaseCapacity =
    databaseKind === "storage" ? 12000 : 4200 + databaseReplicas * 1800;

  const gatewayDemand = effectiveTraffic;
  const serviceDemand = gatewayDemand * (1 - cacheOffload * 0.38);
  const writeShare = clamp((100 - readRatio) / 100, 0.08, 0.92);
  const queueDemand =
    queueKind === "cdn"
      ? effectiveTraffic * (readRatio / 100) * (1 - cacheOffload * 0.45)
      : serviceDemand * Math.max(0.14, writeShare * 0.76);
  const databaseDemand =
    (serviceDemand * (readRatio / 100) * (1 - cacheOffload) +
      serviceDemand * writeShare * 0.84) *
    (1 + dataset / 2200);

  const client = makeMetric("client", effectiveTraffic, 1, 1000000, 2, 99.999, 0);
  const gateway = makeMetric(
    "gateway",
    gatewayDemand,
    Math.max(1, 1 + Math.round(ingressCapacityBonus / 10000)),
    gatewayBaseCapacity + ingressCapacityBonus,
    8,
    99.97,
    48 + ingressCapacityBonus / 320,
  );
  const service = makeMetric(
    "service",
    serviceDemand,
    serviceReplicas + Math.round(serviceCapacityBonus / 2500),
    serviceBaseCapacity + serviceCapacityBonus,
    18,
    99.95,
    serviceReplicas * 42 + serviceCapacityBonus / 60,
  );
  const queue = makeMetric(
    "queue",
    queueDemand,
    Math.max(1, queuePartitions),
    queueBaseCapacity + queueCapacityBonus,
    queueKind === "cdn" ? 7 : 12,
    99.97,
    38 + queueCapacityBonus / 190,
  );
  const db = makeMetric(
    "db",
    databaseDemand,
    Math.max(1, 1 + databaseReplicas),
    databaseBaseCapacity + databaseCapacityBonus,
    24 + dataset / 85,
    99.96,
    92 + databaseReplicas * 58 + dataset * 0.11 + databaseCapacityBonus / 170,
  );

  const nodeMetrics: Record<CoreNodeId, NodeRuntimeMetrics> = {
    client,
    gateway,
    service,
    queue,
    db,
  };
  const bottleneck = [gateway, service, queue, db].reduce((worst, metric) =>
    metric.utilization > worst.utilization ? metric : worst,
  );
  const bottleneckUtilization = bottleneck.utilization;
  const p95Latency = Math.max(
    8,
    Math.round(
      networkLatency * 0.48 +
        gateway.latency +
        service.latency +
        db.latency +
        queue.latency * (queueKind === "cdn" ? readRatio / 100 : writeShare),
    ),
  );
  const healthScore = Math.round(
    clamp(
      100 -
        Math.max(0, bottleneckUtilization - 68) * 0.52 -
        p95Latency / 38 -
        dataset / 480,
      28,
      99,
    ),
  );
  const reliabilityProduct = [gateway, service, queue, db].reduce(
    (product, metric) => product * (metric.reliability / 100),
    1,
  );
  const availability = clamp(reliabilityProduct * 100, 96.5, 99.99);
  const monthlyCost = Math.round(
    gateway.monthlyCost +
      service.monthlyCost +
      queue.monthlyCost +
      db.monthlyCost +
      extraMonthlyCost,
  );

  return {
    effectiveTraffic,
    bottleneckId: bottleneck.id as Exclude<CoreNodeId, "client">,
    bottleneckUtilization,
    showBottleneck: stressComplete || (running && stressProgress >= 52),
    healthScore,
    p95Latency,
    monthlyCost,
    availability,
    stressStage:
      stressProgress < 20
        ? "Warming up traffic"
        : stressProgress < 45
          ? "Ramping request volume"
          : stressProgress < 70
            ? "Pushing past steady state"
            : stressProgress < 95
              ? "Finding the weak point"
              : "Finalizing results",
    nodeMetrics,
  };
}

export function getBottleneckLabel(
  bottleneckId: SimulationMetrics["bottleneckId"],
  names: readonly string[],
): string {
  const indexById: Record<SimulationMetrics["bottleneckId"], number> = {
    gateway: 1,
    service: 2,
    queue: 3,
    db: 4,
  };

  return names[indexById[bottleneckId]];
}

export function getBottleneckFeedback(
  bottleneckId: SimulationMetrics["bottleneckId"],
  bottleneckLabel: string,
  metric?: NodeRuntimeMetrics,
): string {
  const load = metric
    ? `${Math.round(metric.utilization)}% utilization with ${metric.demand.toLocaleString()} req/s demand against ${metric.capacity.toLocaleString()} req/s capacity. `
    : "";

  if (bottleneckId === "db") {
    return `${load}${bottleneckLabel} is the limiting component. Add a cache or database replica before pushing more traffic.`;
  }
  if (bottleneckId === "service") {
    return `${load}${bottleneckLabel} runs out of compute first. Add an API Server replica or reduce repeated work with caching.`;
  }
  if (bottleneckId === "gateway") {
    return `${load}${bottleneckLabel} becomes the choke point. Add another gateway or load balancer and split ingress traffic.`;
  }

  return `${load}${bottleneckLabel} absorbs the burst, but consumers are not draining it fast enough. Add queue capacity or scale workers behind it.`;
}
