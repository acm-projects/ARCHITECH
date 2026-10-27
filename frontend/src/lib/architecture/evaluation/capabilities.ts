import type { GraphNode } from "../graph.ts";

import { roleOf, type NodeRole } from "../analysis.ts";
import type { ArchitectureNodeType } from "../types.ts";
import {
  COMPONENT_TYPES,
  defaultImplementationFor,
  resolveImplementation,
  type ComponentImplementationSeed,
} from "../componentLibrary.ts";

// What each kind of component does in the model, kept apart from how it looks (the
// visual catalog lives in components/workspace/componentCatalog.ts and is not touched
// here). The numbers come from the component library (../componentLibrary.ts): change
// them there and nowhere else. Every number is an educational estimate, not a benchmark.
//
// How a component is understood comes only from its type, its chosen implementation
// (data.implementation, optional) and a few properties (below).
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

// Built from the component library: a type's profile is its default implementation's
// numbers. Every component starts with one instance.
function profileFromImplementation(implementation: ComponentImplementationSeed): SimulationProfile {
  const profile: SimulationProfile = {
    defaultInstances: 1,
    minInstances: 1,
    capacityPerInstance: implementation.capacityPerInstance,
    latencyMs: implementation.latencyMs,
    monthlyCostPerInstance: implementation.monthlyCostPerInstance,
    availability: implementation.availability,
  };
  if (implementation.connectionsPerInstance !== null) {
    profile.connectionsPerInstance = implementation.connectionsPerInstance;
  }
  if (implementation.hitRate !== null) profile.hitRate = implementation.hitRate;
  return profile;
}

export const SIMULATION_PROFILES: Record<ArchitectureNodeType, SimulationProfile> = Object.fromEntries(
  COMPONENT_TYPES.map((componentType) => [
    componentType.name,
    profileFromImplementation(defaultImplementationFor(componentType.name)),
  ]),
) as Record<ArchitectureNodeType, SimulationProfile>;

// The profile a node uses: its chosen implementation's numbers when `implementationId` is a
// real implementation of `type`, otherwise the type's default profile.
export function profileOf(type: ArchitectureNodeType, implementationId?: string): SimulationProfile {
  if (implementationId === undefined) return SIMULATION_PROFILES[type];
  const implementation = resolveImplementation(type, implementationId);
  return implementation.isDefault ? SIMULATION_PROFILES[type] : profileFromImplementation(implementation);
}

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
  // Share of the requests passing a caller that it sends to this component. 1 for everything
  // except authentication (`authCheckRate`) and search (`searchRate`).
  checkRate: number;
};

// Share of requests that reach the authentication service by default. With JWTs (the modern
// default) the gateway or service verifies the signed token itself; only sign-ins and token
// refreshes reach the identity service. Session lookups would be 1 (every request).
export const AUTH_CHECK_RATE_DEFAULT = 0.05;
// Share of requests that run a search by default (search boxes, filters, autocomplete).
export const SEARCH_RATE_DEFAULT = 0.1;

// Properties understood, all optional:
//   replicas      Instances to run (a database: read replicas). Whole number, default 1 (database 0).
//   capacity      Work per second per instance, replacing the type's default.
//   cacheHitRate  Share of reads a cache or CDN serves, 0-1.
//   authCheckRate Authentication only: share of requests that call it, 0-1 (default 0.05, JWT).
//   searchRate    Search only: share of requests that run a search, 0-1 (default 0.1).
// A larger `capacity` also costs proportionally more.
export function configureNode(node: GraphNode): NodeSimulationConfig {
  const type = node.data.type;
  const standard = profileOf(type, node.data.implementation);
  // A measured custom component's own numbers (customComponents.ts) replace the standard ones.
  const overrides = node.data.profile;
  const profile = overrides
    ? {
        ...standard,
        ...(overrides.latencyMs === undefined ? {} : { latencyMs: overrides.latencyMs }),
        ...(overrides.monthlyCostPerInstance === undefined ? {} : { monthlyCostPerInstance: overrides.monthlyCostPerInstance }),
        ...(overrides.availability === undefined ? {} : { availability: overrides.availability }),
      }
    : standard;
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
  // A bigger instance costs proportionally more, unless its cost was given explicitly.
  const sizeFactor =
    capacityPerInstance === null || profile.capacityPerInstance === null || overrides?.monthlyCostPerInstance !== undefined
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
    checkRate:
      type === "auth"
        ? numberProperty(node, "authCheckRate", { min: 0, max: 1, fallback: AUTH_CHECK_RATE_DEFAULT })
        : type === "search"
          ? numberProperty(node, "searchRate", { min: 0, max: 1, fallback: SEARCH_RATE_DEFAULT })
          : 1,
  };
}


