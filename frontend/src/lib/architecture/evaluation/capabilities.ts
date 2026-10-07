import type { GraphNode } from "../graph.ts";

import { roleOf, type NodeRole } from "../analysis.ts";
import type { ArchitectureNodeType } from "../types.ts";

// What each kind of component does in the model, kept apart from how it looks (the
// visual catalog lives in components/workspace/componentCatalog.ts and is not touched
// here). Every number is an educational estimate chosen to make designs compare
// sensibly, not a benchmark. Change them here and nowhere else.
//
// How a component is understood comes only from its type, plus a few properties (below).
// Its name and position never matter.

export type SimulationProfile = {
  // Instances when no `replicas` property is set. For a database this counts the primary
  // only; `replicas` there means read replicas and may be 0.
  defaultInstances: number;
  minInstances: number;
  // Work one instance can do per second. null: never limits throughput (clients).
  capacityPerInstance: number | null;
  // Concurrent connections one instance can hold, where that is a limit.
  connectionsPerInstance?: number;
  // Added to a request that passes through, when idle.
  latencyMs: number;
  monthlyCostPerInstance: number;
  // Availability of a single instance, as a fraction.
  availability: number;
  // Share of reads served by a cache or CDN without going further.
  hitRate?: number;
};

export const SIMULATION_PROFILES: Record<ArchitectureNodeType, SimulationProfile> = {
  client: { defaultInstances: 1, minInstances: 1, capacityPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1 },
  "web-app": { defaultInstances: 1, minInstances: 1, capacityPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1 },
  "mobile-app": { defaultInstances: 1, minInstances: 1, capacityPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1 },
  cdn: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 50_000, latencyMs: 10, monthlyCostPerInstance: 40, availability: 0.9999, hitRate: 0.5 },
  dns: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 100_000, latencyMs: 5, monthlyCostPerInstance: 5, availability: 0.9999, hitRate: 0 },
  "api-gateway": { defaultInstances: 1, minInstances: 1, capacityPerInstance: 10_000, connectionsPerInstance: 100_000, latencyMs: 8, monthlyCostPerInstance: 54, availability: 0.9995 },
  "load-balancer": { defaultInstances: 1, minInstances: 1, capacityPerInstance: 12_000, connectionsPerInstance: 200_000, latencyMs: 4, monthlyCostPerInstance: 48, availability: 0.9999 },
  server: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 2_500, connectionsPerInstance: 20_000, latencyMs: 20, monthlyCostPerInstance: 42, availability: 0.999 },
  worker: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 1_500, latencyMs: 15, monthlyCostPerInstance: 42, availability: 0.999 },
  auth: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 4_000, latencyMs: 10, monthlyCostPerInstance: 30, availability: 0.999 },
  search: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 1_500, latencyMs: 30, monthlyCostPerInstance: 90, availability: 0.999 },
  queue: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 8_000, latencyMs: 6, monthlyCostPerInstance: 36, availability: 0.9995 },
  cache: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 40_000, latencyMs: 1.5, monthlyCostPerInstance: 25, availability: 0.999, hitRate: 0.7 },
  database: { defaultInstances: 1, minInstances: 1, capacityPerInstance: 5_000, latencyMs: 24, monthlyCostPerInstance: 90, availability: 0.999 },
  "object-storage": { defaultInstances: 1, minInstances: 1, capacityPerInstance: 12_000, latencyMs: 20, monthlyCostPerInstance: 20, availability: 0.9999 },
};

// ---- Model assumptions shared by the simulation and the scoring ----

export const ASSUMPTIONS = {
  // A write costs a database primary this many times what a read costs.
  databaseWriteCost: 2,
  // A dataset this large halves a database's capacity.
  databaseDatasetHalvingGb: 2_200,
  // Extra database cost per GB of data, and object storage cost per GB.
  databaseCostPerGb: 0.1,
  storageCostPerGb: 0.023,
  // Behind a queue, consumers see this share of the peak rate: the queue evens out bursts.
  queueSmoothing: 0.6,
  // Idle latency is multiplied as a component fills up: nothing below this utilization
  // (percent), a steady rise above it, and a steeper one once it is overloaded.
  latencyKneePercent: 62,
  latencyPressureDivisor: 42,
  latencyOverloadDivisor: 16,
  latencyMaxMultiplier: 20,
  // Each hop between components adds this much, and the client's network adds half its round trip.
  hopLatencyMs: 1.5,
  clientNetworkFactor: 0.5,
  // A branch carrying less than this share of a component's traffic does not shape the p95.
  p95BranchCutoff: 0.05,
  // Utilization at which a component is reported as approaching its capacity.
  nearCapacityUtilization: 0.8,
} as const;

// ---- Reading a node's configuration ----

export const REPLICAS_MAX = 1_000;
export const DATABASE_REPLICAS_MAX = 50;
export const CAPACITY_MAX = 10_000_000;

// A property that is a finite number is clamped into range; anything else (missing, text,
// NaN, a boolean) gives the fallback. Never throws.
function numberProperty(
  node: GraphNode,
  key: string,
  limits: { min: number; max: number; fallback: number; rejectBelowMin?: boolean },
): number {
  const value: unknown = node.data.properties?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return limits.fallback;
  if (limits.rejectBelowMin && value < limits.min) return limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, value));
}

export type NodeSimulationConfig = {
  type: ArchitectureNodeType;
  role: NodeRole;
  // Running instances. For a database: the primary plus its read replicas.
  instances: number;
  // Work per second one instance can do (after the `capacity` property), or null.
  capacityPerInstance: number | null;
  connectionsPerInstance: number | null;
  latencyMs: number;
  monthlyCost: number;
  // Availability of the component as a whole: it is up while any instance is up.
  availability: number;
  hitRate: number;
};

// Properties understood, all optional:
//   replicas      Instances to run (a database: read replicas). Whole number, default 1 (database 0).
//   capacity      Work per second per instance, replacing the type's default.
//   cacheHitRate  Share of reads a cache or CDN serves, 0-1.
// A larger `capacity` also costs proportionally more.
export function configureNode(node: GraphNode): NodeSimulationConfig {
  const type = node.data.type;
  const profile = SIMULATION_PROFILES[type];
  const isDatabase = roleOf(type) === "database";

  const replicas = Math.floor(
    numberProperty(node, "replicas", {
      min: isDatabase ? 0 : profile.minInstances,
      max: isDatabase ? DATABASE_REPLICAS_MAX : REPLICAS_MAX,
      fallback: isDatabase ? 0 : profile.defaultInstances,
    }),
  );
  const instances = isDatabase ? 1 + replicas : replicas;

  const capacityPerInstance =
    profile.capacityPerInstance === null
      ? null
      : numberProperty(node, "capacity", {
          min: 1,
          max: CAPACITY_MAX,
          fallback: profile.capacityPerInstance,
          // A capacity below 1 is a mistake, not a tiny component.
          rejectBelowMin: true,
        });
  const sizeFactor =
    capacityPerInstance === null || profile.capacityPerInstance === null
      ? 1
      : capacityPerInstance / profile.capacityPerInstance;

  return {
    type,
    role: roleOf(type),
    instances,
    capacityPerInstance,
    connectionsPerInstance: profile.connectionsPerInstance ?? null,
    latencyMs: profile.latencyMs,
    monthlyCost: instances * profile.monthlyCostPerInstance * sizeFactor,
    availability: 1 - Math.pow(1 - profile.availability, instances),
    hitRate: numberProperty(node, "cacheHitRate", {
      min: 0,
      max: 1,
      fallback: profile.hitRate ?? 0,
    }),
  };
}


