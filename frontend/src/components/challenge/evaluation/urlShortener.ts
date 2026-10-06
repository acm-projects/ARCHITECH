import {
  getNodesOfType,
  getReachableNodes,
  hasDirectConnection,
  type EvalEdge,
  type EvalNode,
} from "./graph.ts";

export type FindingSeverity = "good" | "suggestion" | "warning";

export type Finding = {
  severity: FindingSeverity;
  title: string;
  explanation: string;
};

export type Evaluation = {
  scalability: number;
  reliability: number;
  latency: number;
  costEfficiency: number;
  // Rounded average of the four dimensions.
  overallScore: number;
  // Every finding the rules produced, most important first.
  findings: Finding[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  warning: 0,
  suggestion: 1,
  good: 2,
};

// Scores a URL-shortener design from the graph alone. Pure and deterministic: it reads
// component types (never labels) and connectivity, and changes nothing.
export function evaluateUrlShortener(
  nodes: readonly EvalNode[],
  edges: readonly EvalEdge[],
): Evaluation {
  // Ignore edges to missing nodes and self-loops.
  const ids = new Set(nodes.map((node) => node.id));
  const graph = edges.filter(
    (edge) =>
      ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target,
  );

  const reach = new Map<string, Set<string>>();
  const reachFrom = (id: string) => {
    let set = reach.get(id);
    if (!set) {
      set = getReachableNodes(graph, id);
      reach.set(id, set);
    }
    return set;
  };

  const clients = getNodesOfType(nodes, "client");
  const servers = getNodesOfType(nodes, "server");
  const databases = getNodesOfType(nodes, "database");
  const caches = getNodesOfType(nodes, "cache");
  const balancers = getNodesOfType(nodes, "load-balancer");

  // Servers a client can actually reach.
  const requestServers = servers.filter((server) =>
    clients.some((client) => reachFrom(client.id).has(server.id)),
  );
  const clientReachesServer = requestServers.length > 0;

  const databasesBehindBackend = databases.filter((db) =>
    requestServers.some((server) => reachFrom(server.id).has(db.id)),
  );
  // Client -> ... -> API Server -> ... -> Database.
  const coreIntact = databasesBehindBackend.length > 0;
  const serverReachesDatabase = servers.some((server) =>
    databases.some((db) => reachFrom(server.id).has(db.id)),
  );

  // A cache counts when it sits on or next to the request path.
  const integratedCaches = caches.filter((cache) =>
    requestServers.some(
      (server) =>
        reachFrom(server.id).has(cache.id) ||
        hasDirectConnection(graph, cache.id, server.id),
    ),
  );
  // A load balancer counts when clients reach it and it reaches servers.
  const integratedBalancers = balancers.filter(
    (lb) =>
      clients.some((client) => reachFrom(client.id).has(lb.id)) &&
      servers.some((server) => reachFrom(lb.id).has(server.id)),
  );
  const serversBehindBalancer = requestServers.filter((server) =>
    integratedBalancers.some((lb) => reachFrom(lb.id).has(server.id)),
  );
  const redundant = serversBehindBalancer.length >= 2;
  const multipleServersWithoutBalancer =
    integratedBalancers.length === 0 && servers.length >= 2;

  const cacheLoose = caches.length > integratedCaches.length;
  const balancerLoose = balancers.length > integratedBalancers.length;

  // Components that do not take part in the request path. Clients are exempt.
  const used = new Set<string>([
    ...requestServers.map((n) => n.id),
    ...databasesBehindBackend.map((n) => n.id),
    ...integratedCaches.map((n) => n.id),
    ...integratedBalancers.map((n) => n.id),
  ]);
  const connectedIds = new Set(graph.flatMap((e) => [e.source, e.target]));
  const unusedPenalty = Math.min(
    30,
    nodes
      .filter((node) => node.data.type !== "client" && !used.has(node.id))
      .reduce((sum, node) => sum + (connectedIds.has(node.id) ? 3 : 6), 0),
  );
  const unusedCount = nodes.filter(
    (node) => node.data.type !== "client" && !used.has(node.id),
  ).length;

  // ---- Scores ----

  let scalability = 5;
  if (servers.length > 0) scalability += 8;
  if (clientReachesServer) scalability += 12;
  if (coreIntact) scalability += 15;
  if (integratedCaches.length > 0) scalability += 15;
  else if (cacheLoose) scalability += 3;
  if (integratedBalancers.length > 0) scalability += 30;
  else if (balancerLoose) scalability += 4;
  if (serversBehindBalancer.length >= 3) scalability += 16;
  else if (redundant) scalability += 12;

  let reliability = 5;
  if (servers.length > 0) reliability += 8;
  if (databases.length > 0) reliability += 4;
  if (clientReachesServer) reliability += 10;
  if (coreIntact) reliability += 25;
  if (integratedBalancers.length > 0) reliability += 10;
  if (redundant) reliability += 25;
  else if (multipleServersWithoutBalancer) reliability += 3;

  let latency = 10;
  if (clientReachesServer) latency += 15;
  if (coreIntact) latency += 25;
  if (integratedCaches.length > 0) latency += 30;
  else if (cacheLoose) latency += 4;
  if (integratedBalancers.length > 0) latency += 5;
  if (redundant) latency += 5;

  let costEfficiency = coreIntact
    ? 70
    : clientReachesServer
      ? 45
      : servers.length > 0
        ? 30
        : 20;
  if (coreIntact && integratedCaches.length > 0) costEfficiency += 6;
  costEfficiency -= unusedPenalty;

  const scores = {
    scalability: clamp(scalability),
    reliability: clamp(reliability),
    latency: clamp(latency),
    costEfficiency: clamp(costEfficiency),
  };
  const overallScore = Math.round(
    (scores.scalability +
      scores.reliability +
      scores.latency +
      scores.costEfficiency) /
      4,
  );

  // ---- Findings ----

  const findings: Finding[] = [];
  const add = (severity: FindingSeverity, title: string, explanation: string) =>
    findings.push({ severity, title, explanation });

  if (clients.length === 0) {
    add("warning", "Add an entry point", "Users reach your system through a client that sends requests.");
  }
  if (servers.length === 0) {
    add("warning", "Your design needs a backend service", "An API server creates short URLs and handles redirects.");
  }
  if (databases.length === 0) {
    add("warning", "Your design needs persistent storage", "Short URLs must survive restarts, so they need to be stored in a database.");
  }
  if (clients.length > 0 && servers.length > 0 && !clientReachesServer) {
    add("warning", "Connect the client to your API server", "Requests need a path from the client to your backend.");
  }
  if (servers.length > 0 && databases.length > 0 && !serverReachesDatabase) {
    add("warning", "Your backend has no path to persistent storage", "Connect the API server to the database so it can store and look up URLs.");
  }

  if (coreIntact) {
    add("good", "Core request path established", "The client can reach the application service, and the service can access persistent storage.");
  }

  if (integratedCaches.length > 0) {
    add("good", "Cache reduces redirect lookup latency", "Popular short URLs are served from memory instead of hitting the database on every redirect.");
  } else if (cacheLoose) {
    add("suggestion", "Connect the cache to your request path", "A cache that is not connected to the API server cannot speed up redirects.");
  } else if (coreIntact) {
    add("suggestion", "Add a cache for redirect lookups", "Redirects are read far more often than URLs are created, so caching hot URLs cuts latency and database load.");
  }

  if (integratedBalancers.length > 0) {
    add("good", "Traffic can be distributed across application servers", "The load balancer spreads incoming requests instead of sending them all to one server.");
    if (!redundant) {
      add("suggestion", "Add a second API server behind the load balancer", "With a single server, the load balancer cannot add capacity or survive a server failure.");
    }
  } else if (balancerLoose) {
    add("suggestion", "Connect the load balancer between clients and servers", "A load balancer that is not in the request path does not distribute any traffic.");
  } else if (coreIntact) {
    add("suggestion", "Add a load balancer", "Traffic currently depends on one application entry point.");
  }

  if (redundant) {
    add("good", "Application servers are redundant", "If one server fails, the others behind the load balancer can keep serving requests.");
  } else if (multipleServersWithoutBalancer) {
    add("suggestion", "Put your API servers behind a load balancer", "Several servers do not add capacity or availability until traffic is shared between them.");
  }

  if (unusedCount > 0) {
    add("suggestion", "Remove or connect unused components", "Components that are not part of the request path add cost without helping the design.");
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return { ...scores, overallScore, findings };
}
