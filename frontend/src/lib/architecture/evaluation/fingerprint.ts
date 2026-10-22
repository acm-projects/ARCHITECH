import { createDirectedGraph } from "../graph.ts";
import { resolveImplementation } from "../componentLibrary.ts";
import { configureNode } from "./capabilities.ts";
import { usableGraph } from "./input.ts";
import { sanitizeTraffic } from "./traffic.ts";

// A short stable identifier for "what an evaluation was based on". Two inputs have the
// same fingerprint exactly when they would be evaluated the same way, so comparing the
// fingerprint of the live design with the one stored with a result says whether the result
// is still current.
//
// It covers: each node's id, type, chosen non-default implementation and the configuration
// the engine actually uses (instance count, capacity, cache hit rate, after the same defaults and limits the engine applies),
// the connections the engine would use, and the traffic after sanitizing. It does not
// cover names, positions, selection, measured sizes, dragging, viewport, properties the
// engine ignores, or the order nodes and edges happen to be listed in.

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The canonical text, readable for debugging and tests.
export function canonicalEvaluationInput(input: { graph: unknown; traffic?: unknown }): string {
  const graph = createDirectedGraph(usableGraph(input.graph));

  const nodes = [...graph.nodes.values()]
    .map((node) => {
      const config = configureNode(node);
      // A chosen non-default technology changes latency, cost and availability, so it is part
      // of the identity. The default adds nothing, so older fingerprints stay the same.
      const implementation = resolveImplementation(config.type, node.data.implementation);
      const chosen = implementation.isDefault ? [] : [implementation.id];
      if (config.role === "entry") return [node.id, config.type, ...chosen];
      const cached = config.role === "cache" || config.role === "edge";
      return [
        node.id,
        config.type,
        config.instances,
        config.capacityPerInstance,
        cached ? config.hitRate : null,
        ...chosen,
        // Only authentication and search have a check rate other than 1, so other nodes are unchanged.
        ...(config.type === "auth" || config.type === "search" ? [config.checkRate] : []),
      ];
    })
    .sort((a, b) => compare(String(a[0]), String(b[0])));

  const edges = graph.edges
    .map((edge) => [edge.source, edge.target])
    .sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));

  const t = sanitizeTraffic(input.traffic).traffic;
  const traffic = [
    t.requestsPerSecond,
    t.concurrentUsers,
    t.datasetGb,
    t.readRatio,
    t.staticShare,
    t.networkLatencyMs,
  ];

  return JSON.stringify({ nodes, edges, traffic });
}

// 53-bit string hash (cyrb53), plus the text length. Not secure, only a compact identity.
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${text.length.toString(36)}-${value.toString(36)}`;
}

export function fingerprintEvaluationInput(input: { graph: unknown; traffic?: unknown }): string {
  return hash(canonicalEvaluationInput(input));
}
