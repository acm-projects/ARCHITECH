import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemExplanation } from "../src/lib/architecture/archie/explain.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { fingerprintEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import { compareTechnologiesForNode } from "../src/lib/architecture/implementationStats.ts";
import { MAX_EDGES, MAX_NODES, projectToPayload, validateGraph } from "../src/lib/projects/projectPayload.ts";
import { parseProject } from "../src/components/projects/projectStore.ts";
import { fingerprint } from "../src/lib/projects/syncPlan.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";

// Performance budgets on the largest designs the app accepts (MAX_NODES components and
// MAX_EDGES connections, the same limits the server enforces). Measured on a laptop, these
// run in roughly 1-35 ms; each budget leaves 10-20x headroom so slower machines pass, while a
// real regression (an accidental loop over every node per node, say) still fails.
// The API's save/load timings are in tests/integration/api.test.ts.

const BUDGET_MS = {
  evaluate: 250,
  validate: 100,
  fingerprint: 100,
  explain: 100,
  technologyPicker: 500,
  saveLoad: 200,
};

const TYPES: ArchitectureNodeType[] = ["load-balancer", "server", "server", "cache", "database", "queue", "worker", "auth", "search", "object-storage", "api", "cdn"];

// A deterministic design of the maximum size: a few clients, every kind of component, and
// MAX_EDGES connections (a tree so everything is reachable, plus random cross-links).
function largestDesign() {
  let seed = 7;
  const rand = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  const nodes = Array.from({ length: MAX_NODES }, (_, i) => ({
    id: `n${i}`,
    type: "architecture" as const,
    position: { x: (i % 25) * 240, y: Math.floor(i / 25) * 110 },
    data: { type: i < 5 ? ("client" as const) : TYPES[i % TYPES.length], label: `n${i}`, ...(i % 3 ? { properties: { replicas: 2 } } : {}) },
  }));
  const edges: { id: string; source: string; target: string }[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    const key = `n${a}->n${b}`;
    if (a !== b && !seen.has(key)) {
      seen.add(key);
      edges.push({ id: key, source: `n${a}`, target: `n${b}` });
    }
  };
  for (let i = 5; i < MAX_NODES; i += 1) add(Math.floor(rand() * i), i);
  while (edges.length < MAX_EDGES) add(Math.floor(rand() * MAX_NODES), Math.floor(rand() * MAX_NODES));
  return { schemaVersion: 1 as const, nodes, edges };
}

// A 500-component chain: the hardest shape for the single-point-of-failure search.
function longestChain() {
  return {
    schemaVersion: 1 as const,
    nodes: Array.from({ length: MAX_NODES }, (_, i) => ({
      id: `c${i}`,
      type: "architecture" as const,
      position: { x: i * 240, y: 0 },
      data: { type: i === 0 ? ("client" as const) : ("server" as const), label: `c${i}` },
    })),
    edges: Array.from({ length: MAX_NODES - 1 }, (_, i) => ({ id: `e${i}`, source: `c${i}`, target: `c${i + 1}` })),
  };
}

// The median of a few timed runs after a warm-up, so one slow run (a GC pause) does not fail it.
function medianMs(run: () => unknown, runs = 5): number {
  run();
  const times = Array.from({ length: runs }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return times[Math.floor(runs / 2)];
}
const within = (name: string, ms: number, budget: number) =>
  assert.ok(ms <= budget, `${name} took ${ms.toFixed(1)} ms; the budget is ${budget} ms`);

const design = largestDesign();
const chain = longestChain();

test("the largest designs are within the server's limits and ready to evaluate", () => {
  assert.equal(design.nodes.length, MAX_NODES);
  assert.equal(design.edges.length, MAX_EDGES);
  assert.equal(validateGraph(design).ok, true);
  assert.equal(validateGraph(chain).ok, true);
  assert.equal(evaluateArchitecture({ graph: design as never }).ready, true);
});

test("Run Design evaluates the largest designs quickly", () => {
  within("evaluating 500 components / 2,000 connections", medianMs(() => evaluateArchitecture({ graph: design as never })), BUDGET_MS.evaluate);
  within("evaluating a 500-component chain", medianMs(() => evaluateArchitecture({ graph: chain as never })), BUDGET_MS.evaluate);
  within("evaluating at 100x load", medianMs(() => evaluateArchitecture({ graph: design as never, traffic: { requestsPerSecond: 100_000 } })), BUDGET_MS.evaluate);
});

test("validation, fingerprints and Archie's explanation stay fast", () => {
  const copy = JSON.parse(JSON.stringify(design));
  within("validating the largest design", medianMs(() => validateGraph(copy)), BUDGET_MS.validate);
  within("fingerprinting the largest design", medianMs(() => fingerprintEvaluationInput({ graph: design })), BUDGET_MS.fingerprint);
  const evaluation = evaluateArchitecture({ graph: design as never });
  within("explaining the largest design", medianMs(() => buildSystemExplanation({ evaluation })), BUDGET_MS.explain);
});

test("the technology picker sizes every option quickly, even on the largest designs", () => {
  const server = design.nodes.find((node) => node.data.type === "server")!.id;
  within("picker on a busy server", medianMs(() => compareTechnologiesForNode(design, { requestsPerSecond: 200_000 }, server), 3), BUDGET_MS.technologyPicker);
  within("picker in the middle of a chain", medianMs(() => compareTechnologiesForNode(chain, { requestsPerSecond: 200_000 }, "c250"), 3), BUDGET_MS.technologyPicker);
});

test("saving and loading the largest project in the browser stays fast", () => {
  const now = new Date().toISOString();
  const stored = { id: "p", title: "Big", mode: "learn", nodes: design.nodes, edges: design.edges, createdAt: now, updatedAt: now, lastOpenedAt: now };
  const text = JSON.stringify(stored);
  within("loading and checking it", medianMs(() => parseProject(JSON.parse(text))), BUDGET_MS.saveLoad);
  const project = parseProject(JSON.parse(text))!;
  within("preparing it for sync", medianMs(() => fingerprint(projectToPayload(project))), BUDGET_MS.saveLoad);
});
