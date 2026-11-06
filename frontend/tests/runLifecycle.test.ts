import assert from "node:assert/strict";
import test from "node:test";

import { compareEvaluations } from "../src/lib/architecture/evaluation/comparison.ts";
import type { ArchitectureEvaluation } from "../src/lib/architecture/evaluation/contract.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import {
  evaluateDesign,
  type EvaluateDesign,
} from "../src/lib/architecture/evaluation/evaluationService.ts";
import {
  canonicalEvaluationInput,
  fingerprintEvaluationInput,
} from "../src/lib/architecture/evaluation/fingerprint.ts";
import {
  MAX_TOP_FINDINGS,
  buildResultsView,
} from "../src/lib/architecture/evaluation/resultsView.ts";
import {
  INITIAL_RUN_STATE,
  createRunSession,
  reduceRun,
} from "../src/lib/architecture/evaluation/runSession.ts";
import { DEFAULT_TRAFFIC, sanitizeTraffic } from "../src/lib/architecture/evaluation/traffic.ts";
import {
  applySnapshot,
  createGraphHistory,
  toSnapshot,
} from "../src/lib/architecture/graphHistory.ts";
import {
  addNode,
  moveNode,
  removeFromGraph,
  type EdgeLike,
  type NodeLike,
} from "../src/lib/architecture/nodeOperations.ts";
import { selectNode } from "../src/lib/architecture/selection.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";
import { createProjectAutosave } from "../src/components/projects/projectAutosave.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";

// ---- Helpers ----

type TNode = NodeLike & { dragging?: boolean; measured?: { width: number; height: number } };
type Graph = { nodes: TNode[]; edges: EdgeLike[] };

const node = (
  id: string,
  type: ArchitectureNodeType = "server",
  properties?: Record<string, string | number | boolean>,
  x = 0,
): TNode => ({
  id,
  type: "architecture",
  position: { x, y: 0 },
  data: { type, label: id, ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string): EdgeLike => ({ id: `${source}->${target}`, source, target });

const design = (): Graph => ({
  nodes: [node("client-1", "client"), node("server-1"), node("database-1", "database")],
  edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
});

const fp = (graph: Graph, traffic: unknown = DEFAULT_TRAFFIC) =>
  fingerprintEvaluationInput({ graph, traffic });

const input = (graph: Graph, traffic: unknown = DEFAULT_TRAFFIC, projectId: string | null = "p1") => ({
  projectId,
  nodes: graph.nodes,
  edges: graph.edges,
  traffic,
});

const viewOf = (session: ReturnType<typeof createRunSession>, graph: Graph, traffic: unknown = DEFAULT_TRAFFIC) =>
  buildResultsView(session.getState(), fp(graph, traffic));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const evaluation = (graph: Graph = design(), traffic: Record<string, unknown> = {}) =>
  evaluateArchitecture({ graph: graph as never, traffic: { ...DEFAULT_TRAFFIC, ...traffic } });

const failing: EvaluateDesign = async () => {
  throw new Error("server unavailable");
};

// ---- Initial and running ----

test("a new session is idle with nothing to show", () => {
  const session = createRunSession(evaluateDesign);
  const state = session.getState();
  assert.equal(state.status, "idle");
  assert.equal(state.current, null);
  assert.equal(state.previous, null);
  assert.equal(state.pending, null);
  assert.equal(state.error, null);

  const view = viewOf(session, design());
  assert.equal(view.runButtonState, "idle");
  assert.equal(view.canRun, true);
  assert.equal(view.hasResult, false);
  assert.equal(view.isStale, false);
  assert.equal(view.isRunning, false);
  assert.equal(view.result, null);
  assert.equal(view.comparison, null);
  assert.equal(view.error, null);
});

test("idle goes to analyzing and then to results", async () => {
  const session = createRunSession(evaluateDesign);
  const seen: string[] = [];
  session.subscribe(() => seen.push(session.getState().status));

  const running = session.run(input(design()));
  assert.ok(running);
  assert.equal(session.getState().status, "analyzing");
  assert.equal(viewOf(session, design()).runButtonState, "analyzing");
  assert.equal(viewOf(session, design()).canRun, false);

  await running;
  assert.deepEqual(seen, ["analyzing", "results"]);
  const state = session.getState();
  assert.equal(state.status, "results");
  assert.equal(state.pending, null);
  assert.equal(state.current?.evaluation.ready, true);
  assert.equal(viewOf(session, design()).runButtonState, "ready");
});

test("the result remembers the fingerprint and the traffic it was produced for", async () => {
  const session = createRunSession(evaluateDesign);
  const traffic = { requestsPerSecond: 1500, readRatio: 70 };
  await session.run(input(design(), traffic));
  const current = session.getState().current;
  assert.equal(current?.fingerprint, fp(design(), traffic));
  assert.deepEqual(current?.traffic, sanitizeTraffic(traffic).traffic);
  assert.equal(current?.evaluation.traffic.requestsPerSecond, 1500);
});

test("the evaluation service gives the engine's answer and honours cancellation", async () => {
  const request = { projectId: null, graph: design() as never, traffic: DEFAULT_TRAFFIC };
  assert.deepEqual(
    await evaluateDesign(request),
    evaluateArchitecture({ graph: request.graph, traffic: DEFAULT_TRAFFIC }),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(evaluateDesign(request, { signal: controller.signal }), { name: "AbortError" });
});

// ---- Staleness ----

async function evaluated(graph: Graph = design(), traffic: unknown = DEFAULT_TRAFFIC) {
  const session = createRunSession(evaluateDesign);
  await session.run(input(graph, traffic));
  return session;
}

test("a result is current right after it is produced", async () => {
  const session = await evaluated();
  assert.equal(viewOf(session, design()).isStale, false);
});

test("selecting and deselecting does not make a result stale", async () => {
  const session = await evaluated();
  const selected = selectNode(design(), "server-1");
  assert.equal(viewOf(session, selected as Graph).isStale, false);
  assert.equal(fp(selected as Graph), fp(design()));
});

test("moving a node, measuring it or dragging it does not make a result stale", async () => {
  const session = await evaluated();
  const moved = { ...design(), nodes: moveNode(design().nodes, "server-1", { x: 500, y: 300 }) };
  assert.equal(viewOf(session, moved).isStale, false);
  const noisy = {
    ...design(),
    nodes: design().nodes.map((n) => ({ ...n, dragging: true, measured: { width: 80, height: 30 }, selected: true })),
  };
  assert.equal(viewOf(session, noisy).isStale, false);
});

test("renaming a node does not make a result stale", async () => {
  const session = await evaluated();
  const renamed = {
    ...design(),
    nodes: design().nodes.map((n) => ({ ...n, data: { ...n.data, label: "Something else" } })),
  };
  assert.equal(viewOf(session, renamed).isStale, false);
});

test("adding a node makes a result stale", async () => {
  const session = await evaluated();
  const added = { ...design(), nodes: addNode(design().nodes, "cache", (id) => node(id, "cache")).nodes };
  const view = viewOf(session, added);
  assert.equal(view.isStale, true);
  assert.equal(view.runButtonState, "stale");
  assert.equal(view.canRun, true);
});

test("deleting a node makes a result stale", async () => {
  const session = await evaluated();
  assert.equal(viewOf(session, removeFromGraph(design(), { nodeIds: ["database-1"] })).isStale, true);
});

test("adding or removing an edge makes a result stale", async () => {
  const session = await evaluated();
  const extra = { ...design(), edges: [...design().edges, edge("client-1", "database-1")] };
  assert.equal(viewOf(session, extra).isStale, true);
  const fewer = { ...design(), edges: design().edges.slice(0, 1) };
  assert.equal(viewOf(session, fewer).isStale, true);
});

test("changing a property the engine uses makes a result stale", async () => {
  const session = await evaluated();
  for (const properties of [{ replicas: 3 }, { capacity: 4000 }] as Record<string, number>[]) {
    const changed = { ...design(), nodes: design().nodes.map((n) => (n.id === "server-1" ? node("server-1", "server", properties) : n)) };
    assert.equal(viewOf(session, changed).isStale, true, JSON.stringify(properties));
  }
  const cached = { nodes: [...design().nodes, node("cache-1", "cache")], edges: design().edges };
  const base = await evaluated(cached);
  const tuned = { ...cached, nodes: cached.nodes.map((n) => (n.id === "cache-1" ? node("cache-1", "cache", { cacheHitRate: 0.9 }) : n)) };
  assert.equal(viewOf(base, tuned).isStale, true);
});

test("changing a property the engine ignores does not make a result stale", async () => {
  const session = await evaluated();
  const changed = {
    ...design(),
    nodes: design().nodes.map((n) => (n.id === "server-1" ? node("server-1", "server", { notes: "hello", region: "eu" }) : n)),
  };
  assert.equal(viewOf(session, changed).isStale, false);
});

test("a malformed property is the same as no property", async () => {
  const session = await evaluated();
  const malformed = { ...design(), nodes: design().nodes.map((n) => (n.id === "server-1" ? node("server-1", "server", { replicas: "lots" }) : n)) };
  assert.equal(viewOf(session, malformed).isStale, false);
});

test("changing the traffic makes a result stale, and an unusable value that sanitizes to the same traffic does not", async () => {
  const session = await evaluated();
  assert.equal(viewOf(session, design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: 2000 }).isStale, true);
  assert.equal(viewOf(session, design(), { ...DEFAULT_TRAFFIC, readRatio: 10 }).isStale, true);
  assert.equal(viewOf(session, design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: Number.NaN, concurrentUsers: Number.NaN }).isStale, false);
});

test("a stale result is kept, not deleted", async () => {
  const session = await evaluated();
  const changed = removeFromGraph(design(), { nodeIds: ["database-1"] });
  const view = viewOf(session, changed);
  assert.equal(view.isStale, true);
  assert.equal(view.hasResult, true);
  assert.equal(view.result?.overallScore, session.getState().current?.evaluation.overallScore);
});

// ---- Undo and redo against a result ----

function historyEditor(initial: Graph) {
  let state = initial;
  const history = createGraphHistory(toSnapshot(state.nodes, state.edges));
  const observe = () => history.observe(toSnapshot(state.nodes, state.edges));
  return {
    history,
    get state() {
      return state;
    },
    set(next: Graph) {
      state = next;
      observe();
    },
    undo() {
      const snapshot = history.undo();
      if (snapshot) state = applySnapshot(state, snapshot) as Graph;
      observe();
    },
    redo() {
      const snapshot = history.redo();
      if (snapshot) state = applySnapshot(state, snapshot) as Graph;
      observe();
    },
  };
}

test("undoing back to the evaluated design clears stale, and redo makes it stale again", async () => {
  const ed = historyEditor(design());
  const session = await evaluated(ed.state);
  assert.equal(viewOf(session, ed.state).isStale, false);

  ed.set(removeFromGraph(ed.state, { nodeIds: ["server-1"] }));
  assert.equal(viewOf(session, ed.state).isStale, true);

  ed.undo();
  assert.equal(viewOf(session, ed.state).isStale, false);
  assert.equal(viewOf(session, ed.state).runButtonState, "ready");

  ed.redo();
  assert.equal(viewOf(session, ed.state).isStale, true);
  assert.equal(viewOf(session, ed.state).runButtonState, "stale");
});

test("a pasted-then-undone group is not stale, and a fingerprint survives undo of several edits", async () => {
  const ed = historyEditor(design());
  const session = await evaluated(ed.state);
  ed.set({ ...ed.state, nodes: [...ed.state.nodes, node("cache-1", "cache")] });
  ed.set({ ...ed.state, edges: [...ed.state.edges, edge("server-1", "cache-1")] });
  assert.equal(viewOf(session, ed.state).isStale, true);
  ed.undo();
  assert.equal(viewOf(session, ed.state).isStale, true);
  ed.undo();
  assert.equal(viewOf(session, ed.state).isStale, false);
});

// ---- Run again ----

test("running again keeps the earlier successful result as the previous one", async () => {
  const session = createRunSession(evaluateDesign);
  await session.run(input(design()));
  const first = session.getState().current;

  const better = {
    nodes: [...design().nodes, node("cache-1", "cache")],
    edges: [...design().edges, edge("server-1", "cache-1")],
  };
  await session.run(input(better, { ...DEFAULT_TRAFFIC, requestsPerSecond: 3000 }));
  const state = session.getState();
  assert.equal(state.previous, first);
  assert.notEqual(state.current, first);
  assert.equal(state.current?.fingerprint, fp(better, { ...DEFAULT_TRAFFIC, requestsPerSecond: 3000 }));

  const view = buildResultsView(state, fp(better, { ...DEFAULT_TRAFFIC, requestsPerSecond: 3000 }));
  assert.equal(view.isStale, false);
  assert.ok(view.comparison);
});

test("only the latest and the previous successful runs are kept", async () => {
  const session = createRunSession(evaluateDesign);
  for (const requestsPerSecond of [100, 200, 300, 400]) {
    await session.run(input(design(), { ...DEFAULT_TRAFFIC, requestsPerSecond }));
  }
  const state = session.getState();
  assert.equal(state.current?.traffic.requestsPerSecond, 400);
  assert.equal(state.previous?.traffic.requestsPerSecond, 300);
});

test("while running again, the old result stays available", async () => {
  const gate = deferred<ArchitectureEvaluation>();
  let calls = 0;
  const session = createRunSession(async (request) => {
    calls += 1;
    return calls === 1 ? evaluateDesign(request) : gate.promise;
  });
  await session.run(input(design()));
  const running = session.run(input(design()));
  const view = viewOf(session, design());
  assert.equal(view.isRunning, true);
  assert.equal(view.hasResult, true);
  assert.equal(view.runButtonState, "analyzing");
  assert.ok(view.result);
  gate.resolve(evaluation());
  await running;
  assert.equal(viewOf(session, design()).isRunning, false);
});

// ---- Comparison ----

const withMetrics = (base: ArchitectureEvaluation, change: Partial<ArchitectureEvaluation["metrics"]>): ArchitectureEvaluation => ({
  ...base,
  metrics: { ...base.metrics, ...change },
});

test("comparing identical evaluations reports no change", () => {
  const base = evaluation();
  const result = compareEvaluations(base, base);
  assert.equal(result.overallScore.direction, "unchanged");
  assert.equal(result.overallScore.delta, 0);
  for (const delta of [...Object.values(result.scores), ...Object.values(result.metrics)]) {
    assert.equal(delta.direction, "unchanged");
  }
  assert.equal(result.health.direction, "unchanged");
  assert.deepEqual(result.findings, { resolved: [], introduced: [] });
});

test("a stronger design improves the overall score and the categories", () => {
  const weak = evaluation(design(), { requestsPerSecond: 6000 });
  const strong = evaluation(
    {
      nodes: [node("client-1", "client"), node("lb-1", "load-balancer", { replicas: 2 }), node("server-1", "server", { replicas: 4 }), node("database-1", "database", { replicas: 2 })],
      edges: [edge("client-1", "lb-1"), edge("lb-1", "server-1"), edge("server-1", "database-1")],
    },
    { requestsPerSecond: 6000 },
  );
  const result = compareEvaluations(weak, strong);
  assert.equal(result.overallScore.direction, "improved");
  assert.equal(result.overallScore.delta, strong.overallScore - weak.overallScore);
  assert.equal(result.scores.scalability.direction, "improved");
  assert.equal(result.scores.reliability.direction, "improved");
  assert.equal(result.scores.performance.direction, "improved");
  assert.equal(result.metrics.capacityRps.direction, "improved");
  assert.equal(result.metrics.availability.direction, "improved");
  assert.equal(result.health.direction, "improved");
  assert.ok(result.findings.resolved.some((id) => id.startsWith("saturated-")));
  assert.ok(compareEvaluations(strong, weak).overallScore.delta! < 0);
  assert.equal(compareEvaluations(strong, weak).overallScore.direction, "regressed");
});

test("each category score is compared on its own", () => {
  const base = evaluation();
  const changed = { ...base, scores: { ...base.scores, scalability: base.scores.scalability + 5, performance: base.scores.performance - 5 } };
  const result = compareEvaluations(base, changed);
  assert.equal(result.scores.scalability.direction, "improved");
  assert.equal(result.scores.scalability.delta, 5);
  assert.equal(result.scores.performance.direction, "regressed");
  assert.equal(result.scores.reliability.direction, "unchanged");
  assert.equal(result.scores.costEfficiency.direction, "unchanged");
});

test("higher capacity is an improvement and lower is a regression", () => {
  const base = withMetrics(evaluation(), { capacityRps: 2500 });
  assert.equal(compareEvaluations(base, withMetrics(base, { capacityRps: 5000 })).metrics.capacityRps.direction, "improved");
  assert.equal(compareEvaluations(base, withMetrics(base, { capacityRps: 1000 })).metrics.capacityRps.direction, "regressed");
  assert.equal(compareEvaluations(base, withMetrics(base, { capacityRps: 5000 })).metrics.capacityRps.delta, 2500);
});

test("unlimited capacity beats any number", () => {
  const base = withMetrics(evaluation(), { capacityRps: 2500 });
  const unlimited = withMetrics(base, { capacityRps: null });
  const up = compareEvaluations(base, unlimited).metrics.capacityRps;
  assert.equal(up.direction, "improved");
  assert.equal(up.delta, null);
  assert.equal(compareEvaluations(unlimited, base).metrics.capacityRps.direction, "regressed");
  assert.equal(compareEvaluations(unlimited, unlimited).metrics.capacityRps.direction, "unchanged");
});

test("lower latency is an improvement and higher is a regression", () => {
  const base = withMetrics(evaluation(), { p95LatencyMs: 200 });
  const faster = compareEvaluations(base, withMetrics(base, { p95LatencyMs: 120 })).metrics.p95LatencyMs;
  const slower = compareEvaluations(base, withMetrics(base, { p95LatencyMs: 350 })).metrics.p95LatencyMs;
  assert.equal(faster.direction, "improved");
  assert.equal(faster.delta, -80);
  assert.equal(faster.higherIsBetter, false);
  assert.equal(slower.direction, "regressed");
  assert.equal(slower.delta, 150);
});

test("lower cost is an improvement and higher is a regression", () => {
  const base = withMetrics(evaluation(), { estimatedMonthlyCost: 400 });
  assert.equal(compareEvaluations(base, withMetrics(base, { estimatedMonthlyCost: 300 })).metrics.estimatedMonthlyCost.direction, "improved");
  assert.equal(compareEvaluations(base, withMetrics(base, { estimatedMonthlyCost: 500 })).metrics.estimatedMonthlyCost.direction, "regressed");
});

test("higher availability is an improvement and lower is a regression", () => {
  const base = withMetrics(evaluation(), { availability: 99.9 });
  assert.equal(compareEvaluations(base, withMetrics(base, { availability: 99.99 })).metrics.availability.direction, "improved");
  assert.equal(compareEvaluations(base, withMetrics(base, { availability: 99 })).metrics.availability.direction, "regressed");
});

test("the comparison carries no presentation", () => {
  const text = JSON.stringify(compareEvaluations(evaluation(), evaluation(design(), { requestsPerSecond: 5000 })));
  assert.equal(/color|icon|green|red|arrow/i.test(text), false);
});

// ---- Errors ----

test("a failed first run is an error with nothing to show", async () => {
  const session = createRunSession(failing);
  await session.run(input(design()));
  const state = session.getState();
  assert.equal(state.status, "error");
  assert.equal(state.error?.message, "server unavailable");
  assert.equal(state.current, null);
  assert.equal(state.pending, null);
  const view = viewOf(session, design());
  assert.equal(view.runButtonState, "error");
  assert.equal(view.error, "server unavailable");
  assert.equal(view.canRun, true);
  assert.equal(view.result, null);
});

test("an evaluator that throws immediately is also a failed run", async () => {
  const session = createRunSession(() => {
    throw new Error("boom");
  });
  await session.run(input(design()));
  assert.equal(session.getState().status, "error");
  assert.equal(session.getState().error?.message, "boom");
});

test("a failure with no message still gives a usable error", async () => {
  const session = createRunSession(() => Promise.reject("nope"));
  await session.run(input(design()));
  assert.equal(session.getState().error?.message, "The evaluation failed.");
});

test("a failed rerun keeps the previous successful result", async () => {
  let failNext = false;
  const session = createRunSession((request, options) => (failNext ? failing(request, options) : evaluateDesign(request, options)));
  await session.run(input(design()));
  const good = session.getState().current;

  failNext = true;
  await session.run(input(design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: 9000 }));
  const state = session.getState();
  assert.equal(state.status, "error");
  assert.equal(state.current, good);
  assert.equal(state.previous, null);
  const view = viewOf(session, design());
  assert.equal(view.hasResult, true);
  assert.ok(view.result);
  assert.equal(view.error, "server unavailable");
  assert.equal(view.runButtonState, "error");
});

test("retrying after a failure works and clears the error", async () => {
  let failNext = true;
  const session = createRunSession((request, options) => (failNext ? failing(request, options) : evaluateDesign(request, options)));
  await session.run(input(design()));
  assert.equal(session.getState().status, "error");

  failNext = false;
  const retry = session.run(input(design()));
  assert.ok(retry);
  assert.equal(session.getState().error, null);
  assert.equal(session.getState().status, "analyzing");
  await retry;
  assert.equal(session.getState().status, "results");
  assert.equal(viewOf(session, design()).error, null);
});

test("retry after a failed rerun makes the old result the previous one", async () => {
  let failNext = false;
  const session = createRunSession((request, options) => (failNext ? failing(request, options) : evaluateDesign(request, options)));
  await session.run(input(design()));
  const first = session.getState().current;
  failNext = true;
  await session.run(input(design()));
  failNext = false;
  await session.run(input(design()));
  assert.equal(session.getState().previous, first);
  assert.equal(session.getState().status, "results");
});

// ---- Races ----

test("a second run is blocked while one is in progress", async () => {
  let calls = 0;
  const gate = deferred<ArchitectureEvaluation>();
  const session = createRunSession(() => {
    calls += 1;
    return gate.promise;
  });
  const first = session.run(input(design()));
  const second = session.run(input(design()));
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(calls, 1);
  assert.equal(session.getState().pending?.requestId, 1);
  gate.resolve(evaluation());
  await first;
  assert.equal(session.getState().status, "results");
  assert.ok(session.run(input(design())));
});

test("an older answer cannot overwrite a newer run", async () => {
  const gates = [deferred<ArchitectureEvaluation>(), deferred<ArchitectureEvaluation>()];
  let call = 0;
  const session = createRunSession(() => gates[call++].promise);

  const older = session.run(input(design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: 111 }));
  session.reset();
  const newer = session.run(input(design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: 222 }));
  assert.ok(older && newer);

  gates[1].resolve(evaluation(design(), { requestsPerSecond: 222 }));
  await newer;
  assert.equal(session.getState().current?.traffic.requestsPerSecond, 222);

  gates[0].resolve(evaluation(design(), { requestsPerSecond: 111 }));
  await older;
  assert.equal(session.getState().current?.traffic.requestsPerSecond, 222);
  assert.equal(session.getState().status, "results");
});

test("an older failure cannot replace a newer result", async () => {
  const gates = [deferred<ArchitectureEvaluation>(), deferred<ArchitectureEvaluation>()];
  let call = 0;
  const session = createRunSession(() => gates[call++].promise);
  const older = session.run(input(design()));
  session.reset();
  const newer = session.run(input(design()));
  gates[1].resolve(evaluation());
  await newer;
  gates[0].reject(new Error("late failure"));
  await older;
  assert.equal(session.getState().status, "results");
  assert.equal(session.getState().error, null);
});

test("a reset cancels the run in progress and ignores its answer", async () => {
  const signals: AbortSignal[] = [];
  const gate = deferred<ArchitectureEvaluation>();
  const session = createRunSession((_request, options) => {
    if (options?.signal) signals.push(options.signal);
    return gate.promise;
  });
  const running = session.run(input(design()));
  session.reset();
  assert.equal(signals[0].aborted, true);
  assert.equal(session.getState().status, "idle");
  gate.resolve(evaluation());
  await running;
  assert.equal(session.getState().status, "idle");
  assert.equal(session.getState().current, null);
});

test("request ids are never reused, even after a reset", () => {
  let state = reduceRun(INITIAL_RUN_STATE, { type: "start", fingerprint: "a", traffic: DEFAULT_TRAFFIC });
  assert.equal(state.pending?.requestId, 1);
  state = reduceRun(state, { type: "reset" });
  state = reduceRun(state, { type: "start", fingerprint: "b", traffic: DEFAULT_TRAFFIC });
  assert.equal(state.pending?.requestId, 2);
  const stale = reduceRun(state, { type: "succeed", requestId: 1, evaluation: evaluation() });
  assert.equal(stale, state);
});

test("the reducer ignores answers when nothing is pending, and starts while running do nothing", () => {
  assert.equal(reduceRun(INITIAL_RUN_STATE, { type: "succeed", requestId: 1, evaluation: evaluation() }), INITIAL_RUN_STATE);
  assert.equal(reduceRun(INITIAL_RUN_STATE, { type: "fail", requestId: 1, message: "x" }), INITIAL_RUN_STATE);
  const running = reduceRun(INITIAL_RUN_STATE, { type: "start", fingerprint: "a", traffic: DEFAULT_TRAFFIC });
  assert.equal(reduceRun(running, { type: "start", fingerprint: "b", traffic: DEFAULT_TRAFFIC }), running);
});

// ---- Running changes nothing else ----

test("running an evaluation does not modify the graph", async () => {
  const graph = deepFreeze(design());
  const before = JSON.stringify(graph);
  const session = createRunSession(evaluateDesign);
  const running = session.run(input(graph, deepFreeze({ ...DEFAULT_TRAFFIC })));
  assert.ok(running);
  await running;
  assert.equal(JSON.stringify(graph), before);
  assert.equal(session.getState().status, "results");
});

test("the design is copied when the run starts, so later edits do not change what is evaluated", async () => {
  const graph = design();
  const gate = deferred<ArchitectureEvaluation>();
  let seen: unknown;
  const session = createRunSession((request) => {
    seen = request.graph;
    return gate.promise;
  });
  const running = session.run(input(graph));
  const before = JSON.stringify(seen);
  graph.nodes[1].data.properties = { replicas: 9 };
  graph.nodes.pop();
  graph.edges.pop();
  assert.equal(JSON.stringify(seen), before);
  gate.resolve(evaluation());
  await running;
  assert.equal(session.getState().current?.fingerprint, fp(design()));
});

test("running an evaluation adds nothing to the undo history", async () => {
  const ed = historyEditor(design());
  ed.set({ ...ed.state, nodes: moveNode(ed.state.nodes, "server-1", { x: 40, y: 0 }) });
  const depth = ed.history.undoDepth();

  const session = createRunSession(evaluateDesign);
  await session.run(input(ed.state));
  ed.set({ ...ed.state });
  assert.equal(ed.history.undoDepth(), depth);
  assert.equal(ed.history.canRedo(), false);
});

test("running an evaluation does not save or dirty the project", async () => {
  const data = new Map<string, string>();
  let writes = 0;
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      data.set(key, value);
    },
  };
  let tick = 0;
  const store = createProjectStore({ getStorage: () => storage, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(), newId: () => "p1" });
  const project = store.createProject();
  const pending: (() => void)[] = [];
  const autosave = createProjectAutosave(project.id, store, {
    set: (callback) => pending.push(callback),
    clear: () => {},
  });
  const content = { title: project.title, nodes: project.nodes, edges: project.edges };
  autosave.update(content);
  const writesBefore = writes;

  const session = createRunSession(evaluateDesign);
  await session.run({ projectId: project.id, nodes: project.nodes as never, edges: project.edges, traffic: DEFAULT_TRAFFIC });
  autosave.update(content);

  assert.equal(autosave.getStatus(), "saved");
  assert.equal(pending.length, 0);
  assert.equal(writes, writesBefore);
  assert.equal(store.getProject(project.id)?.updatedAt, project.updatedAt);
  assert.equal(data.has(STORAGE_KEY), true);
});

test("editing after a run still autosaves, and makes the result stale", async () => {
  const store = createProjectStore({ getStorage: () => ({ getItem: () => null, setItem: () => {} }), now: () => "2026-01-01T00:00:00.000Z", newId: () => "p1" });
  const project = store.createProject();
  const session = await evaluated({ nodes: project.nodes as never, edges: project.edges });
  const edited = removeFromGraph({ nodes: project.nodes as never as TNode[], edges: project.edges }, { nodeIds: ["server-1"] });
  assert.equal(viewOf(session, edited).isStale, true);
});

// ---- Project isolation ----

test("each project's session has its own results", async () => {
  const a = createRunSession(evaluateDesign);
  const b = createRunSession(evaluateDesign);
  await a.run(input(design(), DEFAULT_TRAFFIC, "A"));
  assert.equal(a.getState().status, "results");
  assert.equal(b.getState().status, "idle");
  assert.equal(b.getState().current, null);
  assert.equal(viewOf(b, design()).hasResult, false);

  const other = { nodes: [node("c", "client"), node("lb", "load-balancer"), node("s", "server")], edges: [edge("c", "lb"), edge("lb", "s")] };
  await b.run(input(other, DEFAULT_TRAFFIC, "B"));
  assert.notEqual(a.getState().current?.fingerprint, b.getState().current?.fingerprint);
  assert.equal(viewOf(a, other).isStale, true);
});

test("the project id is passed to the evaluation request", async () => {
  const seen: (string | null)[] = [];
  const session = createRunSession((request) => {
    seen.push(request.projectId);
    return evaluateDesign(request);
  });
  await session.run(input(design(), DEFAULT_TRAFFIC, "project-7"));
  await session.run(input(design(), DEFAULT_TRAFFIC, null));
  assert.deepEqual(seen, ["project-7", null]);
});

test("resetting a session clears its results but a late answer cannot revive them", async () => {
  const session = await evaluated();
  session.reset();
  assert.equal(session.getState().status, "idle");
  assert.equal(session.getState().current, null);
  assert.equal(viewOf(session, design()).hasResult, false);
});

// ---- Fingerprint ----

test("the fingerprint is the same whatever order nodes and edges are listed in", () => {
  const graph = design();
  const shuffled = { nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() };
  assert.equal(fp(shuffled), fp(graph));
  assert.equal(canonicalEvaluationInput({ graph: shuffled, traffic: DEFAULT_TRAFFIC }), canonicalEvaluationInput({ graph, traffic: DEFAULT_TRAFFIC }));
});

test("the fingerprint ignores node positions", () => {
  const moved = { ...design(), nodes: design().nodes.map((n, i) => ({ ...n, position: { x: i * 1000, y: -i * 77 } })) };
  assert.equal(fp(moved), fp(design()));
});

test("the fingerprint ignores selection, measured size and dragging", () => {
  const noisy = {
    ...design(),
    nodes: design().nodes.map((n) => ({ ...n, selected: true, dragging: true, measured: { width: 1, height: 2 } })),
    edges: design().edges.map((e) => ({ ...e, selected: true })),
  };
  assert.equal(fp(noisy), fp(design()));
});

test("the fingerprint changes for properties the engine uses", () => {
  const withProps = (properties: Record<string, string | number | boolean>) => ({
    ...design(),
    nodes: design().nodes.map((n) => (n.id === "database-1" ? node("database-1", "database", properties) : n)),
  });
  const seen = new Set([fp(design()), fp(withProps({ replicas: 1 })), fp(withProps({ replicas: 2 })), fp(withProps({ capacity: 8000 }))]);
  assert.equal(seen.size, 4);
  assert.equal(fp(withProps({ replicas: 0 })), fp(design()));
  assert.equal(fp(withProps({ replicas: "many" })), fp(design()));
  assert.equal(fp(withProps({ colour: "blue" })), fp(design()));
});

test("the fingerprint changes for each traffic input", () => {
  const base = fp(design(), DEFAULT_TRAFFIC);
  for (const patch of [
    { requestsPerSecond: 1001 },
    { concurrentUsers: 5001 },
    { datasetGb: 101 },
    { readRatio: 79 },
    { networkLatencyMs: 41 },
  ]) {
    assert.notEqual(fp(design(), { ...DEFAULT_TRAFFIC, ...patch }), base, JSON.stringify(patch));
  }
  assert.equal(fp(design(), undefined), fp(design(), DEFAULT_TRAFFIC));
});

test("the fingerprint changes for nodes, types and connections", () => {
  const base = fp(design());
  assert.notEqual(fp({ ...design(), nodes: [...design().nodes, node("x", "cache")] }), base);
  assert.notEqual(fp({ ...design(), nodes: design().nodes.map((n) => (n.id === "server-1" ? node("server-1", "worker") : n)) }), base);
  assert.notEqual(fp({ ...design(), nodes: design().nodes.map((n) => (n.id === "server-1" ? node("renamed-id") : n)) }), base);
  assert.notEqual(fp({ ...design(), edges: design().edges.slice(1) }), base);
  assert.notEqual(fp({ ...design(), edges: design().edges.map((e) => ({ ...e, source: e.target, target: e.source })) }), base);
});

test("the fingerprint ignores connections the engine would ignore", () => {
  const base = fp(design());
  const extra = {
    ...design(),
    edges: [...design().edges, edge("server-1", "server-1"), edge("server-1", "ghost"), edge("client-1", "server-1")],
  };
  assert.equal(fp(extra), base);
});

test("the fingerprint is a compact, deterministic string", () => {
  const value = fp(design());
  assert.equal(typeof value, "string");
  assert.match(value, /^[0-9a-z]+-[0-9a-z]+$/);
  assert.equal(fp(design()), value);
  assert.ok(value.length < 40);
});

test("the fingerprint copes with garbage", () => {
  for (const graph of [null, undefined, {}, { nodes: "x" }, { nodes: [null, 1], edges: [{}] }]) {
    assert.doesNotThrow(() => fingerprintEvaluationInput({ graph, traffic: "nonsense" }));
  }
});

// ---- View model ----

test("the view model exposes the pieces a screen needs", async () => {
  const graph = {
    nodes: [node("client-1", "client"), node("server-1"), node("database-1", "database")],
    edges: [edge("client-1", "server-1"), edge("server-1", "database-1")],
  };
  const session = await evaluated(graph, { ...DEFAULT_TRAFFIC, requestsPerSecond: 9000 });
  const view = viewOf(session, graph, { ...DEFAULT_TRAFFIC, requestsPerSecond: 9000 });
  const raw = session.getState().current!.evaluation;

  assert.ok(view.result);
  assert.equal(view.result.overallScore, raw.overallScore);
  assert.deepEqual(view.result.scores, raw.scores);
  assert.equal(view.result.health.status, raw.health.status);
  assert.deepEqual(view.result.metrics, raw.metrics);
  assert.equal(view.result.topBottleneck?.nodeId, raw.bottlenecks[0].nodeId);
  assert.ok(view.result.topFindings.length <= MAX_TOP_FINDINGS);
  assert.deepEqual(view.result.topFindings, raw.findings.slice(0, MAX_TOP_FINDINGS));
  assert.deepEqual(view.result.recommendations.map((r) => r.findingId), view.result.topFindings.map((f) => f.id));
  assert.equal(view.comparison, null);
  assert.equal(view.isStale, false);
});

test("the view has no bottleneck when nothing is near capacity", async () => {
  const session = await evaluated(design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: 100 });
  assert.equal(viewOf(session, design(), { ...DEFAULT_TRAFFIC, requestsPerSecond: 100 }).result?.topBottleneck, null);
});

test("the run button state follows the lifecycle", async () => {
  let fail = false;
  const session = createRunSession((request, options) => (fail ? failing(request, options) : evaluateDesign(request, options)));
  const state = () => viewOf(session, design()).runButtonState;
  assert.equal(state(), "idle");
  const running = session.run(input(design()));
  assert.equal(state(), "analyzing");
  await running;
  assert.equal(state(), "ready");
  assert.equal(buildResultsView(session.getState(), "different").runButtonState, "stale");
  fail = true;
  await session.run(input(design()));
  assert.equal(state(), "error");
  fail = false;
  await session.run(input(design()));
  assert.equal(state(), "ready");
});

test("an unusable design still produces a result that says so", async () => {
  const empty: Graph = { nodes: [], edges: [] };
  const session = await evaluated(empty);
  const view = viewOf(session, empty);
  assert.equal(view.result?.ready, false);
  assert.equal(view.result?.health.status, "incomplete");
  assert.equal(view.runButtonState, "ready");
});
