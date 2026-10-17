import type { NodeRole } from "../analysis.ts";
import { createDirectedGraph, type GraphInput } from "../graph.ts";
import { ASSUMPTIONS, configureNode, type NodeSimulationConfig } from "./capabilities.ts";
import type { TrafficProfile } from "./traffic.ts";

// Pushes the requested load through the graph and measures what each component sees.
//
// How requests move (a deliberately simple educational model):
//  - Clients split the load evenly among whatever they connect to.
//  - Load balancers and gateways send each request to one of their downstream services.
//  - A service reads through its caches, writes through its queues, and otherwise goes to
//    its data stores. Several stores share the load (sharding or replicas).
//  - A cache serves the share of reads it hits and passes the rest on. A cache with no
//    connection onward is "cache-aside": the service sends its misses to the store.
//  - A queue accepts writes and hands them on at a smoothed rate; everything behind it is
//    asynchronous and does not hold up the request that was answered.
//  - When a service has both downstream services and data, requests split evenly.
//  - Static files (traffic.staticShare of all requests: images, scripts, video) are reads
//    that never need the database. A client or CDN sends them to object storage (or a CDN)
//    when it is connected to one; a CDN answers its hit rate of them at the edge; a service
//    reads them from object storage when connected to it, otherwise serves them itself.
//    readRatio is the read share of the remaining (API) requests.
//  - Support services (auth, search) are called alongside; authentication only for its
//    check rate (with JWTs, sign-ins and refreshes).
// Cycles are cut where they close, so the flow always ends.
//
// Flow is linear in the requested rate, so it is computed once per 1 request/s and scaled.

const EPSILON = 1e-12;

// Requests per second of each kind reaching a point, per 1 request/s asked of the system.
// The sync fields count only what the client is still waiting for (not behind a queue).
// read and write are API requests; asset is static files (always reads).
type Flow = {
  read: number;
  write: number;
  asset: number;
  syncRead: number;
  syncWrite: number;
  syncAsset: number;
};

const ZERO: Flow = { read: 0, write: 0, asset: 0, syncRead: 0, syncWrite: 0, syncAsset: 0 };

// Static files are reads, so they follow the read factor unless told otherwise.
const mix = (flow: Flow, readFactor: number, writeFactor: number, assetFactor = readFactor): Flow => ({
  read: flow.read * readFactor,
  write: flow.write * writeFactor,
  asset: flow.asset * assetFactor,
  syncRead: flow.syncRead * readFactor,
  syncWrite: flow.syncWrite * writeFactor,
  syncAsset: flow.syncAsset * assetFactor,
});

const addFlow = (a: Flow, b: Flow): Flow => ({
  read: a.read + b.read,
  write: a.write + b.write,
  asset: a.asset + b.asset,
  syncRead: a.syncRead + b.syncRead,
  syncWrite: a.syncWrite + b.syncWrite,
  syncAsset: a.syncAsset + b.syncAsset,
});

const totalOf = (flow: Flow) => flow.read + flow.write + flow.asset;
const syncOf = (flow: Flow) => flow.syncRead + flow.syncWrite + flow.syncAsset;

export type NodeSimulation = {
  id: string;
  config: NodeSimulationConfig;
  reachable: boolean;
  // Some of what reaches it is waited on by a client (as opposed to only queued work).
  sync: boolean;
  demandRps: number;
  // The part of demandRps that is static files (images, scripts, video).
  staticRps: number;
  capacityRps: number | null;
  // The most requested load this component alone can carry, or Infinity.
  limitRps: number;
  utilization: number;
  latencyMs: number;
  // Availability of this component and everything it needs downstream, as a fraction.
  pathAvailability: number;
};

export type Simulation = {
  ready: boolean;
  entryIds: string[];
  nodes: NodeSimulation[];
  requestedRps: number;
  effectiveRps: number;
  capacityRps: number | null;
  limitingNodeId: string | null;
  p95LatencyMs: number;
  criticalPath: string[];
  uptimeAvailability: number;
  monthlyCost: number;
  // Share of all requests that are static files, and the read/write split of the rest.
  staticShare: number;
  readShare: number;
  writeShare: number;
  // Each connection that leads back into a component already on the request path, as the node
  // ids from that component round to itself (A, B, A). Only the part reachable from a client.
  cycles: string[][];
};

type Groups = {
  forward: string[];
  sidecars: string[];
  caches: string[];
  queues: string[];
  stores: string[];
};

export function simulate(input: GraphInput, traffic: TrafficProfile): Simulation {
  const graph = createDirectedGraph(input);
  const configs = new Map<string, NodeSimulationConfig>();
  for (const [id, node] of graph.nodes) configs.set(id, configureNode(node));
  const roleOf = (id: string): NodeRole => (configs.get(id) as NodeSimulationConfig).role;

  const requestedRps = traffic.requestsPerSecond;
  // Static files, then the API requests split into reads and writes.
  const staticShare = traffic.staticShare / 100;
  const readShare = traffic.readRatio / 100;
  const writeShare = 1 - readShare;

  const entryIds = [...graph.nodes.keys()].filter(
    (id) => roleOf(id) === "entry" && (graph.outgoing.get(id)?.size ?? 0) > 0,
  );

  // ---- Order the reachable nodes so every node comes after what feeds it ----
  // Depth-first from the clients, dropping edges into clients and edges that close a cycle.
  const succ = new Map<string, string[]>();
  const postOrder: string[] = [];
  const state = new Map<string, 1 | 2>();
  const cycles: string[][] = [];
  for (const entry of entryIds) {
    if (state.has(entry)) continue;
    const stack: { id: string; targets: string[]; next: number }[] = [];
    const open = (id: string) => {
      state.set(id, 1);
      const kept: string[] = [];
      for (const target of graph.outgoing.get(id) ?? []) {
        if (roleOf(target) === "entry") continue;
        if (state.get(target) !== 1) {
          kept.push(target);
          continue;
        }
        // The target is still open, so this connection closes a cycle: report the loop.
        const from = stack.findIndex((frame) => frame.id === target);
        cycles.push([...(from === -1 ? [] : stack.slice(from).map((frame) => frame.id)), id, target]);
      }
      succ.set(id, kept);
      stack.push({ id, targets: kept, next: 0 });
    };
    open(entry);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.next < top.targets.length) {
        const target = top.targets[top.next];
        top.next += 1;
        if (!state.has(target)) open(target);
      } else {
        state.set(top.id, 2);
        postOrder.push(top.id);
        stack.pop();
      }
    }
  }
  // Safety net: keep only edges that point at something that finished first, so `succ` is
  // acyclic whatever shape the graph has.
  const position = new Map(postOrder.map((id, index) => [id, index]));
  for (const [id, targets] of succ) {
    succ.set(
      id,
      targets.filter((target) => (position.get(target) ?? -1) < (position.get(id) ?? 0)),
    );
  }
  const order = [...postOrder].reverse();

  const groupsOf = (id: string): Groups => {
    const groups: Groups = { forward: [], sidecars: [], caches: [], queues: [], stores: [] };
    for (const target of succ.get(id) ?? []) {
      const role = roleOf(target);
      if (role === "support") groups.sidecars.push(target);
      else if (role === "cache") groups.caches.push(target);
      else if (role === "queue") groups.queues.push(target);
      else if (role === "database" || role === "storage") groups.stores.push(target);
      else groups.forward.push(target);
    }
    return groups;
  };

  // How a service or gateway divides its requests between downstream services and data.
  const sharesOf = (id: string, groups: Groups) => {
    const hasData = groups.caches.length + groups.queues.length + groups.stores.length > 0;
    if (groups.forward.length > 0 && (roleOf(id) === "ingress" || !hasData)) {
      return { forwardShare: 1, dataShare: 0 };
    }
    if (groups.forward.length > 0) return { forwardShare: 0.5, dataShare: 0.5 };
    return { forwardShare: 0, dataShare: hasData ? 1 : 0 };
  };

  const isThroughCache = (id: string) => (succ.get(id)?.length ?? 0) > 0;
  const isStorage = (id: string) => roleOf(id) === "storage";
  // Where a client sends static files when it can: object storage, or a CDN (an edge that caches).
  const takesAssets = (id: string) =>
    isStorage(id) || (roleOf(id) === "edge" && (configs.get(id) as NodeSimulationConfig).hitRate > 0);

  // Static files to `assetTargets`, API requests to `others`, when both exist; otherwise
  // everything is spread over all targets. `assetFactor` scales the static files sent on.
  const splitAssets = (
    flow: Flow,
    targets: string[],
    isAssetTarget: (id: string) => boolean,
    assetFactor: number,
  ): [string, Flow][] => {
    const assetTargets = targets.filter(isAssetTarget);
    const others = targets.filter((target) => !isAssetTarget(target));
    if (assetTargets.length === 0 || others.length === 0) {
      const each = 1 / targets.length;
      return targets.map((t) => [t, mix(flow, each, each, assetFactor * each)]);
    }
    return [
      ...assetTargets.map((t): [string, Flow] => [t, mix(flow, 0, 0, assetFactor / assetTargets.length)]),
      ...others.map((t): [string, Flow] => [t, mix(flow, 1 / others.length, 1 / others.length, 0)]),
    ];
  };

  // ---- Flow ----
  const route = (id: string, flow: Flow): [string, Flow][] => {
    const targets = succ.get(id) ?? [];
    const config = configs.get(id) as NodeSimulationConfig;
    if (targets.length === 0) return [];
    const each = 1 / targets.length;

    switch (config.role) {
      case "database":
      case "storage":
        return [];
      case "entry":
        return splitAssets(flow, targets, takesAssets, 1);
      case "queue":
        return targets.map((t) => [
          t,
          {
            read: flow.read * ASSUMPTIONS.queueSmoothing * each,
            write: flow.write * ASSUMPTIONS.queueSmoothing * each,
            asset: flow.asset * ASSUMPTIONS.queueSmoothing * each,
            syncRead: 0,
            syncWrite: 0,
            syncAsset: 0,
          },
        ]);
      case "cache":
        return targets.map((t) => [t, mix(flow, (1 - config.hitRate) * each, each)]);
      case "edge":
        // A CDN answers its hit rate of the static files; API requests always go to the origin.
        return splitAssets(flow, targets, isStorage, 1 - config.hitRate);
      default:
        break;
    }

    const groups = groupsOf(id);
    const { forwardShare, dataShare } = sharesOf(id, groups);
    const out: [string, Flow][] = [];

    // Static files: read from object storage when connected to it; a gateway or load balancer
    // otherwise passes them on; a service otherwise serves them itself (they end here).
    const storages = groups.stores.filter(isStorage);
    const forwardAssets = storages.length === 0 && config.role === "ingress";
    for (const storage of storages) out.push([storage, mix(flow, 0, 0, 1 / storages.length)]);

    for (const target of groups.forward) {
      const share = forwardShare / groups.forward.length;
      out.push([target, mix(flow, share, share, forwardAssets ? 1 / groups.forward.length : 0)]);
    }
    // A support service sees the share of requests that call it (authentication with JWTs:
    // only sign-ins and token refreshes).
    for (const target of groups.sidecars) {
      const rate = (configs.get(target) as NodeSimulationConfig).checkRate;
      out.push([target, mix(flow, rate, rate, 0)]);
    }
    if (dataShare === 0) return out;

    const { caches, queues, stores } = groups;
    const through = caches.filter(isThroughCache);

    // Reads go to the caches if there are any, otherwise to the stores. A cache-aside cache
    // sends only its misses on to the stores.
    for (const cache of caches) out.push([cache, mix(flow, dataShare / caches.length, 0, 0)]);
    const storeReadShare =
      caches.length > 0
        ? caches.reduce(
            (sum, cache) =>
              sum +
              (isThroughCache(cache)
                ? 0
                : (1 - (configs.get(cache) as NodeSimulationConfig).hitRate) / caches.length),
            0,
          ) * dataShare
        : dataShare;

    // Writes go to the queues if there are any, otherwise to the stores, otherwise through a cache.
    let storeWriteShare = 0;
    if (queues.length > 0) {
      for (const queue of queues) out.push([queue, mix(flow, 0, dataShare / queues.length, 0)]);
    } else if (stores.length > 0) {
      storeWriteShare = dataShare;
    } else {
      for (const cache of through) out.push([cache, mix(flow, 0, dataShare / through.length, 0)]);
    }

    for (const store of stores) {
      out.push([store, mix(flow, storeReadShare / stores.length, storeWriteShare / stores.length, 0)]);
    }
    return out;
  };

  const inflow = new Map<string, Flow>();
  const edgeFlow = new Map<string, Flow>();
  const edgeKey = (from: string, to: string) => `${from}\u0000${to}`;
  for (const entry of entryIds) {
    const share = 1 / entryIds.length;
    const api = (1 - staticShare) * share;
    inflow.set(entry, {
      read: readShare * api,
      write: writeShare * api,
      asset: staticShare * share,
      syncRead: readShare * api,
      syncWrite: writeShare * api,
      syncAsset: staticShare * share,
    });
  }
  for (const id of order) {
    const flow = inflow.get(id) ?? ZERO;
    if (totalOf(flow) < EPSILON) continue;
    for (const [target, sent] of route(id, flow)) {
      inflow.set(target, addFlow(inflow.get(target) ?? ZERO, sent));
      edgeFlow.set(edgeKey(id, target), addFlow(edgeFlow.get(edgeKey(id, target)) ?? ZERO, sent));
    }
  }

  // ---- Per component: demand, capacity, utilization ----
  type Measured = {
    id: string;
    reachable: boolean;
    sync: boolean;
    flow: Flow;
    demandRps: number;
    capacityRps: number | null;
    limitRps: number;
    utilization: number;
  };
  const measured = new Map<string, Measured>();
  for (const [id, config] of configs) {
    const flow = inflow.get(id) ?? ZERO;
    const total = totalOf(flow);
    const reachable = total > EPSILON;

    let capacityUnits = Infinity;
    let unitsPerRequested = 0;
    if (config.capacityPerInstance !== null) {
      if (config.role === "database") {
        const datasetFactor = 1 / (1 + traffic.datasetGb / ASSUMPTIONS.databaseDatasetHalvingGb);
        capacityUnits = config.capacityPerInstance * datasetFactor;
        // The primary takes every write and its share of the reads; replicas take the rest.
        unitsPerRequested =
          ASSUMPTIONS.databaseWriteCost * flow.write + (flow.read + flow.asset) / config.instances;
      } else {
        capacityUnits = config.capacityPerInstance * config.instances;
        unitsPerRequested = total;
      }
    }
    const rpsLimit = unitsPerRequested > EPSILON ? capacityUnits / unitsPerRequested : Infinity;
    const rpsUtilization = requestedRps > 0 && Number.isFinite(rpsLimit) ? requestedRps / rpsLimit : 0;

    // Connection-bound tiers also have to hold every connected user.
    let connectionUtilization = 0;
    if (config.connectionsPerInstance !== null && syncOf(flow) > EPSILON) {
      connectionUtilization =
        (traffic.concurrentUsers * syncOf(flow)) / (config.connectionsPerInstance * config.instances);
    }
    const connectionLimit =
      connectionUtilization > 0 && requestedRps > 0 ? requestedRps / connectionUtilization : Infinity;

    const limitRps = Math.min(rpsLimit, connectionLimit);
    measured.set(id, {
      id,
      reachable,
      sync: syncOf(flow) > EPSILON,
      flow,
      demandRps: requestedRps * total,
      capacityRps:
        config.capacityPerInstance === null
          ? null
          : Number.isFinite(limitRps)
            ? limitRps * total
            : capacityUnits,
      limitRps,
      utilization: Math.max(rpsUtilization, connectionUtilization),
    });
  }

  // ---- Capacity of the whole design ----
  let systemLimit = Infinity;
  let limitingNodeId: string | null = null;
  for (const [id, m] of measured) {
    if (m.sync && m.limitRps < systemLimit) {
      systemLimit = m.limitRps;
      limitingNodeId = id;
    }
  }
  const ready = entryIds.length > 0 && [...measured.values()].some(
    (m) => m.reachable && roleOf(m.id) !== "entry",
  );
  const effectiveRps = ready ? Math.min(requestedRps, systemLimit) : 0;

  // ---- Latency ----
  const loadedLatency = (id: string) => {
    const config = configs.get(id) as NodeSimulationConfig;
    const percent = (measured.get(id)?.utilization ?? 0) * 100;
    const multiplier = Math.min(
      ASSUMPTIONS.latencyMaxMultiplier,
      1 +
        Math.max(0, percent - ASSUMPTIONS.latencyKneePercent) / ASSUMPTIONS.latencyPressureDivisor +
        Math.max(0, percent - 100) / ASSUMPTIONS.latencyOverloadDivisor,
    );
    return config.latencyMs * multiplier;
  };

  // Slowest path that carries a meaningful share of requests. Branches below the cutoff
  // (rare misses, say) are left out, which is what makes it a p95 and not a worst case.
  const slowest = new Map<string, { ms: number; next: string | null }>();
  for (const id of [...order].reverse()) {
    const own = loadedLatency(id);
    const here = measured.get(id) as Measured;
    let best: { ms: number; target: string } | null = null;
    // When every branch is below the cutoff (a client fanning out to many targets), the
    // busiest one still stands for the path.
    let busiest: { ms: number; target: string; share: number } | null = null;
    // Work behind a queue is not waited on, so a queue ends the path.
    if (roleOf(id) !== "queue") {
      for (const target of succ.get(id) ?? []) {
        const sent = edgeFlow.get(edgeKey(id, target));
        if (!sent || syncOf(sent) < EPSILON || syncOf(here.flow) < EPSILON) continue;
        const share = syncOf(sent) / syncOf(here.flow);
        const ms = (slowest.get(target)?.ms ?? 0) + ASSUMPTIONS.hopLatencyMs;
        if (!busiest || share > busiest.share) busiest = { ms, target, share };
        if (share >= ASSUMPTIONS.p95BranchCutoff && (!best || ms > best.ms)) {
          best = { ms, target };
        }
      }
      best ??= busiest;
    }
    slowest.set(id, { ms: own + (best?.ms ?? 0), next: best?.target ?? null });
  }
  let start: string | null = null;
  for (const entry of entryIds) {
    if (start === null || (slowest.get(entry)?.ms ?? 0) > (slowest.get(start)?.ms ?? 0)) start = entry;
  }
  const criticalPath: string[] = [];
  for (let id: string | null = start; id !== null; id = slowest.get(id)?.next ?? null) {
    criticalPath.push(id);
  }
  const p95LatencyMs = ready
    ? traffic.networkLatencyMs * ASSUMPTIONS.clientNetworkFactor + (slowest.get(start as string)?.ms ?? 0)
    : 0;

  // ---- Availability ----
  // Series for what a request needs, parallel for alternatives, weighted by how many
  // requests are reads or writes. Caches are optional for reads (a miss just goes on).
  const alternatives = (ids: string[], values: Map<string, number>) =>
    ids.length === 0 ? 1 : 1 - ids.reduce((product, id) => product * (1 - (values.get(id) ?? 0)), 1);
  const pathAvailability = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const config = configs.get(id) as NodeSimulationConfig;
    const targets = succ.get(id) ?? [];
    let downstream = 1;

    if (config.role === "entry") {
      downstream = alternatives(targets, pathAvailability);
    } else if (config.role === "cache") {
      const onward = alternatives(targets, pathAvailability);
      downstream = readShare * (config.hitRate + (1 - config.hitRate) * onward) + writeShare * onward;
    } else if (config.role === "edge") {
      // Static files it holds keep working when the origin is down; API requests do not.
      const onward = alternatives(targets, pathAvailability);
      downstream = staticShare * (config.hitRate + (1 - config.hitRate) * onward) + (1 - staticShare) * onward;
    } else if (config.role === "compute" || config.role === "ingress" || config.role === "support") {
      const groups = groupsOf(id);
      const { forwardShare, dataShare } = sharesOf(id, groups);
      // A request fails when a support service it calls is down; requests that do not call it
      // (JWTs already issued) are unaffected.
      const required = groups.sidecars.reduce((p, s) => {
        const rate = (configs.get(s) as NodeSimulationConfig).checkRate;
        return p * (1 - rate * (1 - (pathAvailability.get(s) ?? 0)));
      }, 1);

      const through = groups.caches.filter(isThroughCache);
      const readSide =
        through.length > 0
          ? alternatives(through, pathAvailability)
          : alternatives(groups.stores, pathAvailability);
      const writeSide =
        groups.queues.length > 0
          ? alternatives(groups.queues, pathAvailability)
          : groups.stores.length > 0
            ? alternatives(groups.stores, pathAvailability)
            : alternatives(through, pathAvailability);
      const data = readShare * readSide + writeShare * writeSide;
      const forward = alternatives(groups.forward, pathAvailability);
      const api = required * (forwardShare * forward + dataShare * data + (1 - forwardShare - dataShare));
      // Static files need object storage when they are read from it, the next hop when a
      // gateway passes them on, and nothing more when a service serves them itself.
      const storages = groups.stores.filter(isStorage);
      const assets =
        storages.length > 0
          ? alternatives(storages, pathAvailability)
          : config.role === "ingress" && groups.forward.length > 0
            ? forward
            : 1;
      downstream = (1 - staticShare) * api + staticShare * assets;
    }
    pathAvailability.set(id, config.availability * downstream);
  }
  const uptimeAvailability =
    ready && entryIds.length > 0
      ? entryIds.reduce((sum, id) => sum + (pathAvailability.get(id) ?? 0), 0) / entryIds.length
      : 0;

  // ---- Cost ----
  let monthlyCost = 0;
  const nodeCost = new Map<string, number>();
  for (const [id, config] of configs) {
    let cost = config.monthlyCost;
    if (config.role === "database") cost += traffic.datasetGb * ASSUMPTIONS.databaseCostPerGb;
    if (config.role === "storage") cost += traffic.datasetGb * ASSUMPTIONS.storageCostPerGb;
    nodeCost.set(id, cost);
    monthlyCost += cost;
  }

  const nodes: NodeSimulation[] = [...configs].map(([id, config]) => {
    const m = measured.get(id) as Measured;
    return {
      id,
      config: { ...config, monthlyCost: nodeCost.get(id) ?? 0 },
      reachable: m.reachable,
      sync: m.sync,
      demandRps: m.demandRps,
      staticRps: requestedRps * m.flow.asset,
      capacityRps: m.capacityRps,
      limitRps: m.limitRps,
      utilization: m.utilization,
      latencyMs: loadedLatency(id),
      pathAvailability: pathAvailability.get(id) ?? 0,
    };
  });

  return {
    ready,
    entryIds,
    nodes,
    requestedRps,
    effectiveRps,
    capacityRps: ready && Number.isFinite(systemLimit) ? systemLimit : null,
    limitingNodeId: ready ? limitingNodeId : null,
    p95LatencyMs,
    criticalPath: ready ? criticalPath : [],
    uptimeAvailability,
    monthlyCost,
    staticShare,
    readShare,
    writeShare,
    cycles,
  };
}
