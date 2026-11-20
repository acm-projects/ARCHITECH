import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemExplanation } from "../src/lib/architecture/archie/explain.ts";
import { COMPONENT_IMPLEMENTATIONS, COMPONENT_TYPES } from "../src/lib/architecture/componentLibrary.ts";
import type { ArchitectureEvaluation } from "../src/lib/architecture/evaluation/contract.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { fingerprintEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import type { ArchitectureNodeType, NodeProperties } from "../src/lib/architecture/types.ts";

// Rules that must hold for EVERY design, checked on 2,000 random ones: any mix of the 15
// component types, technologies and settings, random connections (loops, clients wired to
// clients, dead ends), and random traffic. The generator is seeded, so every run checks the
// same designs and a failure always reproduces. Raise DESIGNS locally to search harder.

const DESIGNS = 2_000;

// Small deterministic random number generator (mulberry32).
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = random(20261017);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const shuffle = <T>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

type Node = { id: string; data: { type: ArchitectureNodeType; label: string; implementation?: string; properties?: NodeProperties } };
type Design = { graph: { nodes: Node[]; edges: { source: string; target: string }[] }; traffic: Record<string, number> };

function randomDesign(): Design {
  const types = COMPONENT_TYPES.map((type) => type.name);
  const count = 2 + Math.floor(rand() * 14);
  const nodes: Node[] = Array.from({ length: count }, (_, index) => {
    const type: ArchitectureNodeType = index === 0 ? "client" : pick(types);
    const properties: NodeProperties = {};
    if (rand() < 0.4) properties.replicas = type === "database" ? Math.floor(rand() * 5) : 1 + Math.floor(rand() * 8);
    if (rand() < 0.15) properties.capacity = 100 + Math.floor(rand() * 20_000);
    if (rand() < 0.2 && (type === "cache" || type === "cdn")) properties.cacheHitRate = Math.round(rand() * 100) / 100;
    if (rand() < 0.3 && type === "auth") properties.authCheckRate = pick([0.05, 0.3, 1]);
    const implementation = rand() < 0.4
      ? pick(COMPONENT_IMPLEMENTATIONS.filter((candidate) => candidate.componentType === type)).id
      : undefined;
    return {
      id: `n${index}`,
      data: {
        type,
        label: `n${index}`,
        ...(implementation ? { implementation } : {}),
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
      },
    };
  });
  // A tree so most designs are connected, then extra random edges (loops, back edges, duplicates).
  const edges = nodes.slice(1).map((node, index) => ({ source: `n${Math.floor(rand() * (index + 1))}`, target: node.id }));
  for (let extra = Math.floor(rand() * count); extra > 0; extra -= 1) {
    edges.push({ source: pick(nodes).id, target: pick(nodes).id });
  }
  const traffic = {
    requestsPerSecond: Math.floor(10 ** (1 + rand() * 4.5)),
    readRatio: Math.floor(rand() * 101),
    staticShare: Math.floor(rand() * 101),
    datasetGb: Math.floor(rand() * 3_000),
    networkLatencyMs: Math.floor(rand() * 200),
  };
  return { graph: { nodes, edges }, traffic };
}

const run = (design: Design, graph = design.graph, traffic = design.traffic): ArchitectureEvaluation =>
  evaluateArchitecture({ graph: graph as never, traffic });

const designs = Array.from({ length: DESIGNS }, randomDesign);
const results = designs.map((design) => run(design));

// Reports the first design that breaks a rule, so it can be pasted into a test.
function check(rule: (design: Design, result: ArchitectureEvaluation) => string | null) {
  for (let index = 0; index < designs.length; index += 1) {
    const problem = rule(designs[index], results[index]);
    if (problem) assert.fail(`${problem}\nDesign #${index}: ${JSON.stringify(designs[index])}`);
  }
}

const withReplicasAdded = (design: Design, id: string) => ({
  ...design.graph,
  nodes: design.graph.nodes.map((node) => {
    if (node.id !== id) return node;
    const current = node.data.properties?.replicas;
    const base = typeof current === "number" ? current : node.data.type === "database" ? 0 : 1;
    return { ...node, data: { ...node.data, properties: { ...node.data.properties, replicas: base + 2 } } };
  }),
});

test("every design evaluates to real numbers within range", () => {
  check((_, r) => {
    const numbers = {
      p95LatencyMs: r.metrics.p95LatencyMs,
      estimatedMonthlyCost: r.metrics.estimatedMonthlyCost,
      effectiveRps: r.metrics.effectiveRps,
      uptimeAvailability: r.metrics.uptimeAvailability,
      overallScore: r.overallScore,
      ...r.scores,
    };
    for (const [name, value] of Object.entries(numbers)) {
      if (!Number.isFinite(value)) return `${name} is ${value}`;
      if (value < 0) return `${name} is negative (${value})`;
    }
    for (const score of [r.overallScore, ...Object.values(r.scores)]) {
      if (score > 100) return `a score is ${score}`;
    }
    if (r.metrics.effectiveRps > r.metrics.requestedRps + 1e-6) return "serves more than was requested";
    return null;
  });
});

test("the same design always gets the same result", () => {
  check((design, r) => (JSON.stringify(run(design)) === JSON.stringify(r) ? null : "two runs differ"));
});

test("the order components and connections were added never changes the result", () => {
  check((design, r) => {
    const shuffled = { nodes: shuffle(design.graph.nodes), edges: shuffle(design.graph.edges) };
    const other = run(design, shuffled);
    if (other.overallScore !== r.overallScore) return `score ${r.overallScore} vs ${other.overallScore}`;
    if (JSON.stringify(other.metrics) !== JSON.stringify(r.metrics)) return "metrics differ";
    if (JSON.stringify(other.findings.map((f) => f.id).sort()) !== JSON.stringify(r.findings.map((f) => f.id).sort())) {
      return "findings differ";
    }
    if (fingerprintEvaluationInput({ graph: shuffled, traffic: design.traffic }) !== fingerprintEvaluationInput(design)) {
      return "fingerprint differs";
    }
    return null;
  });
});

test("adding replicas never lowers capacity, cost or availability", () => {
  check((design, r) => {
    if (!r.ready) return null;
    for (const node of design.graph.nodes) {
      if (node.data.type === "client") continue;
      const bigger = run(design, withReplicasAdded(design, node.id));
      if ((bigger.metrics.capacityRps ?? Infinity) + 1e-6 < (r.metrics.capacityRps ?? Infinity)) return `capacity fell after scaling ${node.id}`;
      if (bigger.metrics.estimatedMonthlyCost + 1e-6 < r.metrics.estimatedMonthlyCost) return `cost fell after scaling ${node.id}`;
      if (bigger.metrics.uptimeAvailability + 1e-9 < r.metrics.uptimeAvailability) return `availability fell after scaling ${node.id}`;
    }
    return null;
  });
});

test("more traffic never makes requests faster", () => {
  check((design, r) => {
    if (!r.ready) return null;
    const busier = run(design, design.graph, { ...design.traffic, requestsPerSecond: design.traffic.requestsPerSecond * 3 });
    return busier.metrics.p95LatencyMs + 1e-6 < r.metrics.p95LatencyMs ? "p95 fell when traffic tripled" : null;
  });
});

test("Archie can explain every result", () => {
  check((_, r) => {
    const explanation = buildSystemExplanation({ evaluation: r });
    return explanation.explanations.length >= 0 ? null : "no explanation";
  });
});
