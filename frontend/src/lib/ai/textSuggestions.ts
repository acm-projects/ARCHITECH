import type { Change, Suggestion } from "./changes.ts";

// Archie's answer often names the fix in words ("put a load balancer in front of two servers")
// without the model also calling propose_changes. Then there is nothing to apply. This turns the
// fixes an answer names into the same structured changes the tool would have sent, built from
// the actual design, so each can be applied with one click. The server checks and previews them
// exactly like a tool suggestion (prepareSuggestion).

type Node = { id: string; data: { type: string; label?: string; implementation?: string } };
type Edge = { source: string; target: string };
type Graph = { nodes: readonly Node[]; edges: readonly Edge[] };

type Plan = { at: number; suggestion: Suggestion };

const LOAD_BALANCER = /load[\s-]?balanc/;
const MORE_SERVERS = /\b(second|another|more|additional|extra|two|2|multiple)\s+(api\s+)?(server|instance)s?\b|scale (it |the api server )?(out|horizontally)/;
const REPLICA = /\b(read\s+)?replica|replicat(e|ion)|standby database|failover database/;
const CACHE = /\bcach(e|ing)\b|\bredis\b|\bmemcached\b/;

const nameOf = (node: Node) => node.data.label?.trim() || node.data.type;
const ofType = (graph: Graph, type: string) => graph.nodes.filter((node) => node.data.type === type);
const upstreamOf = (graph: Graph, id: string) => [...new Set(graph.edges.filter((edge) => edge.target === id).map((edge) => edge.source))];
const downstreamOf = (graph: Graph, id: string) => [...new Set(graph.edges.filter((edge) => edge.source === id).map((edge) => edge.target))];
const copyOf = (node: Node, ref: string, label: string): Change => ({
  op: "add_component",
  ref,
  type: node.data.type as never,
  label,
  ...(node.data.implementation ? { implementation: node.data.implementation } : {}),
});

// A second server beside an existing one, doing the same work: same technology, same downstream.
function secondServer(graph: Graph, server: Node, from: string[]): Change[] {
  return [
    copyOf(server, "new-server", `${nameOf(server)} 2`),
    ...from.map((source): Change => ({ op: "connect", from: source, to: "new-server" })),
    ...downstreamOf(graph, server.id).map((target): Change => ({ op: "connect", from: "new-server", to: target })),
  ];
}

// A load balancer in front of the server requests reach, and a second server behind it. With a
// load balancer already there, only the second server is added behind it.
function scaleOutServers(graph: Graph): Suggestion | null {
  const servers = ofType(graph, "server");
  const balancer = ofType(graph, "load-balancer")[0];
  if (balancer) {
    const behind = servers.filter((server) => downstreamOf(graph, balancer.id).includes(server.id));
    if (behind.length === 0 || behind.length >= 2) return null;
    return {
      title: `Add a second ${nameOf(behind[0])}`,
      reason: `${nameOf(balancer)} can then share traffic between two servers, and either can fail without taking requests down. Costs a second server.`,
      changes: secondServer(graph, behind[0], [balancer.id]),
    };
  }
  const server = servers.find((candidate) => upstreamOf(graph, candidate.id).length > 0) ?? servers[0];
  if (!server) return null;
  const upstream = upstreamOf(graph, server.id);
  const isClient = (id: string) => graph.nodes.find((node) => node.id === id)?.data.type === "client";
  // A load balancer is never wired to a client. It goes behind whatever else sits in front of
  // the server (a web app, gateway, CDN or DNS); a client keeps its own link.
  const fronts = upstream.filter((id) => !isClient(id));
  if (fronts.length === 0) {
    // Only clients in front: they connect to both servers and spread requests between them.
    return {
      title: `Add a second ${nameOf(server)}`,
      reason: "Requests are then shared between two servers, and either can fail or fill up without taking the app down. Costs a second server.",
      changes: secondServer(graph, server, upstream),
    };
  }
  return {
    title: `Load-balance ${nameOf(server)} across two servers`,
    reason: "A load balancer shares requests between two servers, so either can fail or fill up without taking the app down. Costs the balancer and a second server.",
    changes: [
      { op: "add_component", ref: "new-load-balancer", type: "load-balancer" as never },
      ...fronts.flatMap((source): Change[] => [
        { op: "disconnect", from: source, to: server.id },
        { op: "connect", from: source, to: "new-load-balancer" },
      ]),
      { op: "connect", from: "new-load-balancer", to: server.id },
      ...secondServer(graph, server, ["new-load-balancer"]),
    ],
  };
}

// A read replica of the database requests use, reached by everything that reaches the primary.
function readReplica(graph: Graph): Suggestion | null {
  const databases = ofType(graph, "database");
  if (databases.length !== 1) return null;
  const primary = databases[0];
  const upstream = upstreamOf(graph, primary.id);
  if (upstream.length === 0) return null;
  return {
    title: `Add a read replica of ${nameOf(primary)}`,
    reason: `Reads are shared with the replica, and it takes over if ${nameOf(primary)} goes down. Costs a second database.`,
    changes: [
      copyOf(primary, "new-replica", `${nameOf(primary)} replica`),
      ...upstream.map((source): Change => ({ op: "connect", from: source, to: "new-replica" })),
    ],
  };
}

// A cache beside each server that reads the database: reads it holds never reach the database.
function cacheInFront(graph: Graph): Suggestion | null {
  if (ofType(graph, "cache").length > 0) return null;
  const databases = new Set(ofType(graph, "database").map((node) => node.id));
  const readers = ofType(graph, "server").filter((server) => downstreamOf(graph, server.id).some((id) => databases.has(id)));
  if (readers.length === 0) return null;
  const database = graph.nodes.find((node) => databases.has(node.id) && upstreamOf(graph, node.id).includes(readers[0].id));
  return {
    title: `Put a cache in front of ${database ? nameOf(database) : "the database"}`,
    reason: "Repeated reads are answered from memory: faster responses and less load on the database. Costs a cache.",
    changes: [
      { op: "add_component", ref: "new-cache", type: "cache" as never },
      ...readers.map((server): Change => ({ op: "connect", from: server.id, to: "new-cache" })),
    ],
  };
}

// The fixes an answer names, in the order it names them, each built against the design.
export function suggestionsFromText(text: string, graph: Graph): Suggestion[] {
  const lower = text.toLowerCase();
  const plans: Plan[] = [];
  const scaleAt = [lower.search(LOAD_BALANCER), lower.search(MORE_SERVERS)].filter((at) => at >= 0);
  if (scaleAt.length > 0) {
    const suggestion = scaleOutServers(graph);
    if (suggestion) plans.push({ at: Math.min(...scaleAt), suggestion });
  }
  const replicaAt = lower.search(REPLICA);
  if (replicaAt >= 0) {
    const suggestion = readReplica(graph);
    if (suggestion) plans.push({ at: replicaAt, suggestion });
  }
  const cacheAt = lower.search(CACHE);
  if (cacheAt >= 0) {
    const suggestion = cacheInFront(graph);
    if (suggestion) plans.push({ at: cacheAt, suggestion });
  }
  return plans.sort((a, b) => a.at - b.at).map((plan) => plan.suggestion);
}

// "How do I fix it?" and the like: a question that asks for a change.
const ASKS_FOR_FIX = /\b(fix|fixes|fixing|improve|resolve|solve|repair|better|reliab\w*|scale|scaling|bottleneck|single point|fail\w*|faster|harden|upgrade)\b|\bhow (do|can|should|would) (i|we)\b|\bwhat should (i|we)\b/;
export const asksForFix = (question: string) => ASKS_FOR_FIX.test(question.toLowerCase());

// The design's most useful structural fix when the answer named none: what fills up first is
// scaled out, then a lone database gets a replica, then reads get a cache. One suggestion.
export function bestFix(graph: Graph, limitingType: string | null): Suggestion | null {
  const order = limitingType === "database" || limitingType === "cache"
    ? [readReplica, cacheInFront, scaleOutServers]
    : [scaleOutServers, readReplica, cacheInFront];
  for (const plan of order) {
    const suggestion = plan(graph);
    if (suggestion) return suggestion;
  }
  return null;
}
