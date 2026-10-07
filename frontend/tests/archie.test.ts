import assert from "node:assert/strict";
import test from "node:test";

import { COMPONENT_ROLES, COMPONENT_NOUNS } from "../src/lib/architecture/archie/components.ts";
import { explainComparison } from "../src/lib/architecture/archie/comparison.ts";
import {
  ARCHIE_CONTEXT_VERSION,
  MAX_CONTEXT_EXPLANATIONS,
  buildArchieContext,
} from "../src/lib/architecture/archie/context.ts";
import {
  MAX_NEXT_STEPS,
  buildSystemExplanation,
  explainFindings,
  kindOfFinding,
} from "../src/lib/architecture/archie/explain.ts";
import { NO_RESULT_MESSAGE, explainNode } from "../src/lib/architecture/archie/node.ts";
import {
  STALE_NOTICE,
  buildArchieView,
  explainNodeInView,
} from "../src/lib/architecture/archie/view.ts";
import type { ArchitectureEvaluation } from "../src/lib/architecture/evaluation/contract.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { INITIAL_RUN_STATE, type RunState } from "../src/lib/architecture/evaluation/runSession.ts";
import { DEFAULT_TRAFFIC } from "../src/lib/architecture/evaluation/traffic.ts";
import { COMPONENT_CATALOG } from "../src/components/workspace/componentCatalog.ts";

// ---- Helpers ----

type N = { id: string; data: { type: string; label: string; properties?: Record<string, unknown> } };
const n = (id: string, type: string, properties?: Record<string, unknown>, label = id): N => ({
  id,
  data: { type, label, ...(properties ? { properties } : {}) },
});
const e = (source: string, target: string) => ({ source, target });
const graphOf = (nodes: N[], edges: { source: string; target: string }[]) => ({ nodes, edges });

const evaluate = (graph: unknown, traffic: Record<string, unknown> = {}): ArchitectureEvaluation =>
  evaluateArchitecture({ graph: graph as never, traffic: { ...DEFAULT_TRAFFIC, ...traffic } });

const simple = () =>
  graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s"), e("s", "d")]);
const dbBound = () =>
  graphOf(
    [n("c", "client"), n("s", "server", { replicas: 6 }), n("d", "database")],
    [e("c", "s"), e("s", "d")],
  );
const withCache = () => graphOf([...dbBound().nodes, n("k", "cache")], [...dbBound().edges, e("s", "k")]);
const redundant = () =>
  graphOf(
    [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 3 }), n("d", "database", { replicas: 1 })],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );
const strong = () =>
  graphOf(
    [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 4 }), n("d", "database", { replicas: 2 })],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );

const explain = (evaluation: ArchitectureEvaluation, labels?: Record<string, string>) =>
  buildSystemExplanation({ evaluation, labels });
const find = (evaluation: ArchitectureEvaluation, kind: string, labels?: Record<string, string>) =>
  explainFindings({ evaluation, labels }).find((x) => x.kind === kind);

const stateOf = (current: ArchitectureEvaluation | null, previous: ArchitectureEvaluation | null = null, fingerprint = "fp"): RunState => ({
  ...INITIAL_RUN_STATE,
  status: current ? "results" : "idle",
  current: current ? { evaluation: current, fingerprint, traffic: current.traffic } : null,
  previous: previous ? { evaluation: previous, fingerprint: "old", traffic: previous.traffic } : null,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const FIELDS = ["what", "why", "impact", "suggestion"] as const;

// ---- Vocabulary ----

test("every component type has a noun and a role sentence", () => {
  for (const type of Object.keys(COMPONENT_CATALOG)) {
    assert.ok(COMPONENT_NOUNS[type as keyof typeof COMPONENT_NOUNS], type);
    assert.ok(COMPONENT_ROLES[type as keyof typeof COMPONENT_ROLES], type);
  }
  assert.deepEqual(Object.keys(COMPONENT_NOUNS).sort(), Object.keys(COMPONENT_CATALOG).sort());
});

test("finding ids map to explanation kinds", () => {
  assert.equal(kindOfFinding("saturated-db-1"), "overloaded");
  assert.equal(kindOfFinding("backlog-w"), "queue-backlog");
  assert.equal(kindOfFinding("cache-opportunity"), "missing-cache");
  assert.equal(kindOfFinding("long-request-path"), "long-path");
  assert.equal(kindOfFinding("connection-a->b"), "questionable-connection");
  assert.equal(kindOfFinding("something-new"), "other");
});

// ---- Incomplete, healthy, warning, critical ----

test("an empty or unusable design is explained as incomplete", () => {
  const empty = explain(evaluate(graphOf([], [])));
  assert.equal(empty.healthExplanation.status, "incomplete");
  assert.match(empty.healthExplanation.headline, /no request reaches a component/i);
  assert.match(empty.summary, /cannot score/i);
  assert.equal(empty.primaryIssue?.kind, "no-entry-point");
  assert.match(empty.primaryIssue?.what ?? "", /empty/i);
  assert.equal(empty.nextSteps.length, 1);
  assert.match(empty.nextSteps[0].text, /client/i);
  for (const s of empty.scoreExplanations) assert.match(s.summary, /not scored/i);

  const lone = explain(evaluate(graphOf([n("a", "server")], [])));
  assert.match(lone.primaryIssue?.what ?? "", /No request reaches/);
});

test("a healthy design is explained without inventing a problem", () => {
  const result = explain(evaluate(redundant(), { requestsPerSecond: 3000, readRatio: 70 }));
  assert.equal(result.healthExplanation.status, "healthy");
  assert.match(result.healthExplanation.headline, /healthy/i);
  assert.deepEqual(result.healthExplanation.because, []);
  assert.match(result.healthExplanation.caveat ?? "", /traffic you ran/i);
  assert.match(result.summary, /healthy/);
  assert.match(result.summary, /serve all/);
  assert.ok(result.explanations.every((x) => x.severity !== "high"));
});

test("a warning is explained with its measurable reason", () => {
  const result = explain(evaluate(simple(), { requestsPerSecond: 1000 }));
  assert.equal(result.healthExplanation.status, "warning");
  assert.match(result.healthExplanation.headline, /warning because/i);
  assert.match(result.healthExplanation.headline, /up about 99\.80%/);
  assert.ok(result.healthExplanation.because.length > 0);
});

test("a critical design says what made it critical, in the component's current name", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 20_000 });
  const result = explain(evaluation, { c: "Web client", s: "Checkout API", d: "Orders DB" });
  assert.equal(result.healthExplanation.status, "critical");
  assert.match(result.healthExplanation.headline, /^Architech marked this design critical because /);
  assert.match(result.healthExplanation.headline, /of its estimated capacity/);
  assert.match(result.healthExplanation.headline, /Checkout API \(server\) is using about \d+% of its estimated capacity/);
  assert.equal(/\b(s|d) is using/.test(result.healthExplanation.headline), false);
  assert.equal(/\.\s*,/.test(result.healthExplanation.headline), false);
  assert.ok(result.healthExplanation.headline.endsWith("."));
  // The overload is said once, not again as a finding.
  assert.equal(/is overloaded/.test(result.healthExplanation.headline), false);
  assert.equal(result.healthExplanation.because.some((line) => /is overloaded/.test(line)), false);
  assert.ok(result.healthExplanation.because.length >= 3);
  assert.ok(result.healthExplanation.because.every((line) => line.endsWith(".") && /^[A-Z]/.test(line)));
  assert.match(result.healthExplanation.caveat ?? "", /fail or degrade/i);
});

test("the evaluation's health signals line up with its reasons", () => {
  for (const traffic of [{ requestsPerSecond: 20_000 }, { requestsPerSecond: 1000 }, { requestsPerSecond: 100 }]) {
    const { health } = evaluate(simple(), traffic);
    assert.deepEqual(health.signals.map((s) => s.message), health.reasons);
  }
  assert.deepEqual(evaluate(graphOf([], [])).health.signals.map((s) => s.kind), ["incomplete"]);
  const critical = evaluate(simple(), { requestsPerSecond: 20_000 }).health.signals.find((s) => s.kind === "capacity");
  assert.equal(critical?.severity, "critical");
  assert.ok(["s", "d"].includes(critical?.nodeId ?? ""));
});

// ---- Finding explanations ----

test("a saturated component is explained step by step", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000, readRatio: 80 });
  const x = find(evaluation, "overloaded");
  assert.ok(x);
  assert.equal(x.severity, "high");
  assert.deepEqual(x.nodeIds, ["d"]);
  assert.match(x.what, /Your database is overloaded/);
  assert.match(x.what, /8,000 requests per second/);
  assert.match(x.why, /80% of your requests are reads/);
  assert.match(x.impact, /serve about 3,986 requests per second of the 8,000/);
  assert.match(x.suggestion, /read replicas/);
  assert.match(x.tradeoff ?? "", /replication|lag/i);
  for (const field of FIELDS) assert.ok(x[field].length > 10, field);
});

test("a database overload on a write-heavy load is not told to add read replicas", () => {
  const x = find(evaluate(dbBound(), { requestsPerSecond: 8000, readRatio: 10 }), "overloaded");
  assert.match(x?.why ?? "", /writes/);
  assert.match(x?.suggestion ?? "", /queue|split/);
  assert.equal(/read replicas to/.test(x?.suggestion ?? ""), false);
  assert.match(x?.tradeoff ?? "", /queue/);
});

test("an overloaded server is told to add instances, with the cost", () => {
  const x = explainFindings({ evaluation: evaluate(simple(), { requestsPerSecond: 9000 }) }).find(
    (item) => item.findingId === "saturated-s",
  );
  assert.match(x?.why ?? "", /1 running/);
  assert.match(x?.suggestion ?? "", /Add more instances of your server/);
  assert.match(x?.tradeoff ?? "", /cost more/);
  assert.match(x?.tradeoff ?? "", /load balancer/);
});

test("a component close to capacity is explained as near-capacity, not overloaded", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 3400, readRatio: 80 });
  const x = find(evaluation, "near-capacity");
  assert.ok(x);
  assert.equal(x.severity, "medium");
  assert.match(x.what, /using about \d+% of its capacity/);
  assert.match(x.impact, /modest increase/);
  assert.equal(find(evaluation, "overloaded"), undefined);
});

test("a single point of failure names what depends on it", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 500 });
  const x = find(evaluation, "single-point-of-failure", { c: "Client", s: "Checkout API", d: "Orders DB" });
  assert.ok(x);
  assert.match(x.what, /Checkout API \(server\) is a single point of failure/);
  assert.match(x.why, /Orders DB/);
  assert.match(x.impact, /cannot be reached/);
  assert.match(x.suggestion, /two or more instances/);
  assert.match(x.tradeoff ?? "", /cost more/);
});

test("missing database redundancy is explained, with the replication tradeoff", () => {
  const x = find(evaluate(simple(), { requestsPerSecond: 500 }), "database-redundancy");
  assert.ok(x);
  assert.match(x.what, /no standby copy/);
  assert.match(x.why, /only database/);
  assert.match(x.suggestion, /read replica or standby/);
  assert.match(x.tradeoff ?? "", /lag/);
});

test("a read-heavy design with no cache gets the cache explanation and its tradeoff", () => {
  const x = find(evaluate(simple(), { requestsPerSecond: 500, readRatio: 90 }), "missing-cache");
  assert.ok(x);
  assert.match(x.why, /90% of your requests are reads/);
  assert.match(x.suggestion, /Add a cache/);
  assert.match(x.tradeoff ?? "", /outdated data/);
  assert.match(x.tradeoff ?? "", /costs more/);
});

test("a cache that does not suit the workload is explained", () => {
  const x = find(evaluate(withCache(), { requestsPerSecond: 8000, readRatio: 10 }), "low-benefit-cache");
  assert.ok(x);
  assert.match(x.why, /only 10% of your requests are reads/);
  assert.match(x.suggestion, /Remove your cache|queue/);
});

test("slow requests are explained with the path and the cause", () => {
  const overloaded = find(evaluate(simple(), { requestsPerSecond: 5000, networkLatencyMs: 300 }), "slow-requests", {
    c: "Client", s: "API", d: "DB",
  });
  assert.ok(overloaded);
  assert.match(overloaded.what, /95 out of 100/);
  assert.match(overloaded.why, /Client → API → DB/);
  assert.equal(overloaded.nodeIds.includes("c"), false);
  assert.match(overloaded.why, /capacity/);
  assert.match(overloaded.suggestion, /Fix the overloaded component first/);
  assert.match(overloaded.tradeoff ?? "", /costs more/);

  const farAway = find(evaluate(redundant(), { requestsPerSecond: 200, networkLatencyMs: 2000 }), "slow-requests");
  assert.ok(farAway);
  assert.match(farAway.why, /Each component adds time/);
  assert.match(farAway.suggestion, /Shorten the request path/);
});

test("a long request path is explained", () => {
  const nodes = [n("c", "client"), ...Array.from({ length: 8 }, (_, i) => n(`h${i}`, "server", { replicas: 3 }))];
  const edges = nodes.slice(1).map((node, i) => e(i === 0 ? "c" : `h${i - 1}`, node.id));
  const x = find(evaluate(graphOf(nodes, edges), { requestsPerSecond: 100 }), "long-path");
  assert.ok(x);
  assert.match(x.what, /8 components in a row/);
  assert.match(x.tradeoff ?? "", /Combining/);
});

test("low availability is explained in plain terms", () => {
  const x = find(evaluate(simple(), { requestsPerSecond: 500 }), "low-availability", { c: "C", s: "API", d: "DB" });
  assert.ok(x);
  assert.match(x.what, /up about 99\.8% of the time/);
  assert.match(x.why, /single copy/);
  assert.match(x.suggestion, /load balancer/);
});

const backlogGraph = () =>
  graphOf(
    [n("c", "client"), n("s", "server", { replicas: 6 }), n("d", "database", { replicas: 3 }), n("q", "queue", { replicas: 3 }), n("w", "worker")],
    [e("c", "s"), e("s", "d"), e("s", "q"), e("q", "w"), e("w", "d")],
  );

test("a growing queue backlog is explained", () => {
  const x = find(evaluate(backlogGraph(), { requestsPerSecond: 6000, readRatio: 20 }), "queue-backlog");
  assert.ok(x);
  assert.equal(x.severity, "high");
  assert.match(x.what, /cannot process queued work as fast as it arrives/);
  assert.match(x.impact, /backlog keeps growing/);
  assert.match(x.tradeoff ?? "", /bottleneck there/);
});

test("a queue with nothing reading from it is explained", () => {
  const g = graphOf([n("c", "client"), n("s", "server"), n("q", "queue")], [e("c", "s"), e("s", "q")]);
  const x = find(evaluate(g, { readRatio: 0, requestsPerSecond: 300 }), "queue-no-consumer");
  assert.ok(x);
  assert.match(x.what, /Nothing reads from your message queue/);
  assert.match(x.impact, /never reach your data store/);
});

test("a design with no backend, or no place to store data, is explained", () => {
  const noBackend = find(evaluate(graphOf([n("c", "client"), n("lb", "load-balancer")], [e("c", "lb")])), "no-backend");
  assert.ok(noBackend);
  assert.match(noBackend.what, /never reach a backend/);
  assert.match(noBackend.suggestion, /Add a server/);

  const g = graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s")]);
  const evaluation = evaluate(g, { requestsPerSecond: 500 });
  const noStore = find(evaluation, "no-data-store");
  assert.ok(noStore);
  assert.match(noStore.what, /nowhere to be stored/);
  assert.match(noStore.why, /20% of requests are writes/);
});

test("an unreachable data store is explained", () => {
  const g = graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s")]);
  const x = find(evaluate(g, { requestsPerSecond: 500 }), "unreachable-data", { c: "C", s: "S", d: "Orders DB" });
  assert.ok(x);
  assert.match(x.what, /Orders DB \(database\) receives no requests/);
  assert.match(x.impact, /still pay for it/);
});

test("idle components are explained with what they cost", () => {
  const g = graphOf([...simple().nodes, n("x", "cache"), n("y", "server")], simple().edges);
  const evaluation = evaluate(g, { requestsPerSecond: 500 });
  const x = find(evaluation, "idle-components", { c: "C", s: "S", d: "D", x: "Redis", y: "Spare API" });
  assert.ok(x);
  assert.match(x.what, /2 components serve no requests: Redis and Spare API/);
  const cost = ["x", "y"].reduce((sum, id) => sum + (evaluation.nodes.find((node) => node.nodeId === id)?.monthlyCost ?? 0), 0);
  assert.match(x.impact, new RegExp(`\\$${cost} a month`));
  assert.equal(x.tradeoff, null);
});

test("an over-provisioned component is explained", () => {
  const g = graphOf([n("c", "client"), n("s", "server", { replicas: 20 }), n("d", "database", { replicas: 3 })], simple().edges);
  const x = find(evaluate(g, { requestsPerSecond: 200 }), "over-provisioned");
  assert.ok(x);
  assert.match(x.why, /20 instances run at about \d+%/);
  assert.match(x.tradeoff ?? "", /spikes/);
});

test("a questionable connection uses the engine's reason and a sensible impact", () => {
  const g = graphOf(simple().nodes as N[], [...simple().edges, e("c", "d")]);
  const x = find(evaluate(g, { requestsPerSecond: 500 }), "questionable-connection", { c: "Web", s: "S", d: "Orders DB" });
  assert.ok(x);
  assert.match(x.what, /Web \(client\) to Orders DB \(database\)/);
  assert.match(x.why, /bypassing the service boundary/);
  assert.match(x.impact, /security checks/);
});

test("a client with no connection is explained, with no invented downside", () => {
  const g = graphOf([...simple().nodes, n("c2", "web-app")], simple().edges);
  const x = find(evaluate(g, { requestsPerSecond: 500 }), "disconnected-client", { c2: "Browser" });
  assert.ok(x);
  assert.match(x.what, /Browser \(web app\) is not connected/);
  assert.equal(x.tradeoff, null);
});

test("every finding the engine produces is explained with all the parts", () => {
  const scenarios: [unknown, Record<string, unknown>][] = [
    [simple(), { requestsPerSecond: 20_000 }],
    [simple(), { requestsPerSecond: 500, readRatio: 90 }],
    [dbBound(), { requestsPerSecond: 8000 }],
    [dbBound(), { requestsPerSecond: 3400 }],
    [withCache(), { requestsPerSecond: 8000, readRatio: 10 }],
    [backlogGraph(), { requestsPerSecond: 6000, readRatio: 20 }],
    [graphOf([n("c", "client"), n("lb", "load-balancer")], [e("c", "lb")]), {}],
    [graphOf([...simple().nodes, n("x", "cache")], simple().edges), {}],
    [graphOf(simple().nodes as N[], [e("c", "s")]), { requestsPerSecond: 500 }],
    [graphOf(simple().nodes as N[], [...simple().edges, e("c", "d")]), {}],
    [graphOf([...simple().nodes, n("c2", "client")], simple().edges), { networkLatencyMs: 2000 }],
    [graphOf([n("c", "client"), n("s", "server"), n("q", "queue")], [e("c", "s"), e("s", "q")]), { readRatio: 0 }],
    [graphOf([n("c", "client"), n("s", "server", { replicas: 20 }), n("d", "database", { replicas: 3 })], simple().edges), { requestsPerSecond: 100 }],
    [graphOf([], []), {}],
  ];
  const seen = new Set<string>();
  for (const [graph, traffic] of scenarios) {
    const evaluation = evaluate(graph, traffic);
    for (const x of explainFindings({ evaluation })) {
      seen.add(x.kind);
      assert.notEqual(x.kind, "other", x.findingId);
      assert.ok(x.title.length > 0);
      for (const field of FIELDS) assert.ok(x[field].length > 0, `${x.findingId}.${field}`);
      assert.equal(x.components.length, x.nodeIds.length);
    }
  }
  for (const kind of [
    "overloaded", "near-capacity", "queue-backlog", "queue-no-consumer", "single-point-of-failure", "database-redundancy",
    "missing-cache", "low-benefit-cache", "slow-requests", "low-availability", "no-entry-point", "disconnected-client",
    "no-backend", "no-data-store", "unreachable-data", "questionable-connection", "idle-components", "over-provisioned",
  ]) {
    assert.ok(seen.has(kind), `no scenario produced ${kind}`);
  }
});

test("an unknown finding still gets a safe, honest explanation", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 500 });
  const withUnknown: ArchitectureEvaluation = {
    ...evaluation,
    findings: [
      ...evaluation.findings,
      { id: "future-thing", category: "cost", severity: "low", title: "Something new", message: "Details.", nodeIds: [], recommendation: "Do a thing." },
    ],
  };
  const x = explainFindings({ evaluation: withUnknown }).find((item) => item.findingId === "future-thing");
  assert.equal(x?.kind, "other");
  assert.equal(x?.what, "Something new");
  assert.equal(x?.suggestion, "Do a thing.");
});

// ---- Tradeoffs ----

test("recommendations carry the tradeoff the model can support", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 20_000, readRatio: 90 });
  const all = explainFindings({ evaluation });
  const tradeoff = (kind: string) => all.find((x) => x.kind === kind)?.tradeoff ?? "";
  assert.match(tradeoff("overloaded"), /cost/i);
  assert.match(tradeoff("missing-cache"), /outdated/i);
  assert.match(tradeoff("database-redundancy"), /lag/i);
  assert.match(tradeoff("single-point-of-failure"), /load balancer/i);
  assert.match(tradeoff("low-availability"), /cost more/i);
  const queueTradeoff = find(evaluate(dbBound(), { requestsPerSecond: 8000, readRatio: 10 }), "overloaded")?.tradeoff;
  assert.match(queueTradeoff ?? "", /asynchronous|after the user's request|queue/i);
});

// ---- Priority and next steps ----

test("explanations are ordered by importance, with bottlenecks and structure first", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 20_000 });
  const result = explain(evaluation);
  const priorities = result.explanations.map((x) => x.priority);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => b - a));
  assert.equal(result.primaryIssue, result.explanations[0]);
  assert.equal(result.primaryIssue?.severity, "high");
  assert.ok(result.primaryIssue?.nodeIds.some((id) => evaluation.bottleneckNodeIds.includes(id)));
});

test("next steps are few, prioritized and distinct", () => {
  const result = explain(evaluate(simple(), { requestsPerSecond: 20_000, readRatio: 90 }));
  assert.ok(result.explanations.length > MAX_NEXT_STEPS);
  assert.ok(result.nextSteps.length >= 1 && result.nextSteps.length <= MAX_NEXT_STEPS);
  assert.equal(result.nextSteps[0].severity, "high");
  assert.equal(result.nextSteps[0].explanationId, result.primaryIssue?.id);
  assert.equal(new Set(result.nextSteps.map((s) => s.text)).size, result.nextSteps.length);
  for (const step of result.nextSteps) {
    assert.ok(step.text && step.reason);
    assert.ok(step.addresses.length >= 1);
  }
});

test("explanations that call for the same action become one step", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 20_000 });
  const result = explain(evaluation);
  const serverStep = result.nextSteps.find((step) => step.addresses.includes("saturated-s"));
  assert.ok(serverStep);
  assert.ok(serverStep.addresses.includes("spof-s"));
  assert.ok(serverStep.addresses.includes("low-availability"));
  const all = result.nextSteps.flatMap((step) => step.addresses);
  assert.equal(new Set(all).size, all.length);
});

test("low-priority findings are only suggested when nothing more important is open", () => {
  const tidy = graphOf([...redundant().nodes, n("x", "cache")], redundant().edges);
  const onlyMinor = explain(evaluate(tidy, { requestsPerSecond: 3000, readRatio: 50 }));
  assert.ok(onlyMinor.explanations.every((x) => x.severity === "low"));
  assert.ok(onlyMinor.nextSteps.length >= 1);
  assert.ok(onlyMinor.nextSteps.length <= MAX_NEXT_STEPS);

  const mixed = explain(evaluate(graphOf([...simple().nodes, n("x", "cache")], simple().edges), { requestsPerSecond: 500 }));
  assert.ok(mixed.explanations.some((x) => x.severity === "low"));
  assert.ok(mixed.nextSteps.every((step) => step.severity !== "low"));
});

test("a design with nothing to fix has no next steps", () => {
  const evaluation = { ...evaluate(redundant(), { requestsPerSecond: 3000 }), findings: [], recommendations: [] };
  const result = explain(evaluation);
  assert.deepEqual(result.explanations, []);
  assert.deepEqual(result.nextSteps, []);
  assert.equal(result.primaryIssue, null);
  assert.equal(/main issue/.test(result.summary), false);
});

// ---- Component names ----

test("components are described by their current names, and logic keeps using ids", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const named = find(evaluation, "overloaded", { c: "Browser", s: "API", d: "Orders DB" });
  assert.match(named?.what ?? "", /^Orders DB \(database\) is overloaded/);
  assert.equal(named?.title, "Orders DB is overloaded");
  assert.deepEqual(named?.nodeIds, ["d"]);
  assert.deepEqual(named?.components, [{ id: "d", type: "database", label: "Orders DB", present: true }]);
});

test("a component renamed after the run is shown by its new name", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const before = find(evaluation, "overloaded", { d: "Old name" });
  const after = find(evaluation, "overloaded", { d: "Renamed DB" });
  assert.match(before?.what ?? "", /Old name/);
  assert.match(after?.what ?? "", /Renamed DB/);
  assert.equal(/Old name/.test(after?.what ?? ""), false);
  assert.equal(before?.findingId, after?.findingId);
  assert.deepEqual(before?.nodeIds, after?.nodeIds);
  assert.equal(before?.severity, after?.severity);
});

test("a component with its default name is called by its type", () => {
  const x = find(evaluate(dbBound(), { requestsPerSecond: 8000 }), "overloaded", { d: "Database" });
  assert.match(x?.what ?? "", /^Your database is overloaded/);
  const unnamed = find(evaluate(dbBound(), { requestsPerSecond: 8000 }), "overloaded");
  assert.match(unnamed?.what ?? "", /^Your database is overloaded/);
});

test("a component deleted after the run is described generically", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const x = find(evaluation, "overloaded", { c: "Browser", s: "API" });
  assert.match(x?.what ?? "", /A database that is no longer in the design is overloaded/);
  assert.equal(x?.components[0].present, false);
  assert.deepEqual(x?.nodeIds, ["d"]);
});

// ---- Scores ----

test("score explanations use the evaluation's own scores and numbers", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const result = explain(evaluation, { c: "Web", s: "API", d: "Orders DB" });
  assert.deepEqual(
    Object.fromEntries(result.scoreExplanations.map((s) => [s.category, s.score])),
    evaluation.scores,
  );
  const by = Object.fromEntries(result.scoreExplanations.map((s) => [s.category, s]));
  assert.match(by.scalability.summary, /3,986 requests per second against the 8,000/);
  assert.match(by.scalability.summary, /Orders DB \(database\) would run out first/);
  assert.match(by.reliability.summary, new RegExp(`${evaluation.metrics.uptimeAvailability}%`));
  assert.match(by.performance.summary, new RegExp(`${Math.round(evaluation.metrics.p95LatencyMs)} ms`));
  assert.match(by.performance.summary, /Web → API → Orders DB/);
  assert.match(by.costEfficiency.summary, new RegExp(`\\$${evaluation.metrics.estimatedMonthlyCost}`));
  assert.match(by.costEfficiency.summary, /cannot serve all of that/);
  for (const s of result.scoreExplanations) {
    assert.equal(s.level, s.score >= 80 ? "strong" : s.score >= 50 ? "fair" : "weak");
  }
  assert.ok(by.scalability.factors.length > 0);
});

test("explaining never changes the evaluation or recomputes it", () => {
  const evaluation = deepFreeze(evaluate(simple(), { requestsPerSecond: 9000 }));
  const before = JSON.stringify(evaluation);
  explain(evaluation, { s: "API" });
  explainNode({ evaluation }, "s");
  buildArchieView(stateOf(evaluation), "fp");
  assert.equal(JSON.stringify(evaluation), before);
});

test("the same input always gives the same explanation", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 9000 });
  const labels = { s: "API", d: "DB" };
  assert.deepEqual(explain(evaluation, labels), explain(evaluation, labels));
  assert.equal(JSON.stringify(explain(evaluation, labels)), JSON.stringify(explain(evaluation, labels)));
});

test("an explanation is plain serializable data with no presentation", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 9000 });
  const view = buildArchieView(stateOf(evaluation, evaluate(strong(), { requestsPerSecond: 9000 })), "fp", { s: "API" });
  const text = JSON.stringify(view);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(view)));
  assert.equal(/\b(colou?r|icon|className|style|css)\b/i.test(text), false);
});

// ---- Node-scoped ----

test("asking about a component returns the explanations that involve it", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const answer = explainNode({ evaluation, labels: { d: "Orders DB" } }, "d");
  assert.equal(answer.status, "findings");
  if (answer.status === "findings") {
    assert.equal(answer.explanations[0].kind, "overloaded");
    assert.ok(answer.explanations.every((x) => x.nodeIds.includes("d")));
    assert.match(answer.summary, /Orders DB \(database\) receives about/);
    assert.equal(answer.role, COMPONENT_ROLES.database);
    assert.equal(answer.stats.utilization > 1, true);
  }
});

test("a component with no finding gets a neutral explanation, not praise", () => {
  const evaluation = { ...evaluate(dbBound(), { requestsPerSecond: 8000 }), findings: [], recommendations: [] };
  const answer = explainNode({ evaluation, labels: { c: "Browser", s: "API" } }, "s");
  assert.equal(answer.status, "no-findings");
  if (answer.status === "no-findings") {
    assert.deepEqual(answer.explanations, []);
    assert.match(answer.summary, /API \(server\) receives about 8,000 requests per second/);
    assert.match(answer.summary, /found no specific problem with it in this run/);
    assert.equal(/perfect|everything is|great|no issues|all good/i.test(answer.summary), false);
    assert.equal(answer.role, COMPONENT_ROLES.server);
  }
  const client = explainNode({ evaluation }, "c");
  assert.equal(client.status, "no-findings");
});

test("a component that receives no requests is described as such", () => {
  const evaluation = evaluate(graphOf([...simple().nodes, n("x", "cache")], simple().edges), { requestsPerSecond: 500 });
  const answer = explainNode({ evaluation, labels: { x: "Spare cache" } }, "x");
  assert.equal(answer.status, "findings");
  if (answer.status === "findings") assert.match(answer.summary, /receives no requests/);
});

test("a component that was not part of the run, or was removed, is said to be so", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 500 });
  const added = explainNode({ evaluation, labels: { s: "S", new1: "Cache" } }, "new1");
  assert.equal(added.status, "not-analyzed");
  if (added.status === "not-analyzed") assert.match(added.message, /not part of your last run/);
  const removed = explainNode({ evaluation, labels: { c: "C" } }, "s");
  assert.equal(removed.status, "findings");
  const gone = explainNode({ evaluation, labels: { c: "C" } }, "ghost");
  assert.equal(gone.status, "not-analyzed");
  if (gone.status === "not-analyzed") assert.match(gone.message, /no longer in your design/);
});

test("asking before any run says to run the design first", () => {
  assert.deepEqual(explainNode(null, "s"), { status: "unavailable", message: NO_RESULT_MESSAGE });
  const view = buildArchieView(INITIAL_RUN_STATE, "fp");
  const answer = explainNodeInView(view, "s");
  assert.equal(answer.status, "unavailable");
  assert.equal(NO_RESULT_MESSAGE, "Run your design first so Archie can analyze it.");
});

// ---- The view: current, stale, unavailable ----

test("with no run the view is unavailable and says why", () => {
  const view = buildArchieView(INITIAL_RUN_STATE, "fp");
  assert.equal(view.status, "unavailable");
  assert.equal(view.message, NO_RESULT_MESSAGE);
  assert.equal(view.explanation, null);
  assert.equal(view.comparison, null);
  assert.equal(view.staleNotice, null);
  assert.equal(view.isStale, false);
});

test("a current result is explained as the current design", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 9000 });
  const view = buildArchieView(stateOf(evaluation, null, "fp"), "fp");
  assert.equal(view.status, "current");
  assert.equal(view.isStale, false);
  assert.equal(view.staleNotice, null);
  assert.equal(view.message, null);
  assert.ok(view.explanation);
  assert.equal(view.comparison, null);
});

test("a stale result is still explained, and clearly marked as the previous run", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 9000 });
  const current = buildArchieView(stateOf(evaluation, null, "fp"), "fp");
  const stale = buildArchieView(stateOf(evaluation, null, "fp"), "changed");
  assert.equal(stale.status, "stale");
  assert.equal(stale.isStale, true);
  assert.equal(stale.staleNotice, STALE_NOTICE);
  assert.match(STALE_NOTICE, /based on your previous run/);
  assert.deepEqual(stale.explanation, current.explanation);
  assert.equal(explainNodeInView(stale, "s").stale, true);
  assert.equal(explainNodeInView(current, "s").stale, false);
});

test("the view reports a run in progress and a failure without losing the explanation", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 9000 });
  const running = buildArchieView({ ...stateOf(evaluation), status: "analyzing" }, "fp");
  assert.equal(running.isRunning, true);
  assert.ok(running.explanation);
  const failed = buildArchieView({ ...stateOf(evaluation), status: "error", error: { message: "boom", requestId: 1 } }, "fp");
  assert.equal(failed.error, "boom");
  assert.ok(failed.explanation);
  const firstFailed = buildArchieView({ ...INITIAL_RUN_STATE, status: "error", error: { message: "boom", requestId: 1 } }, "fp");
  assert.equal(firstFailed.status, "unavailable");
  assert.equal(firstFailed.error, "boom");
});

test("the view names components by the labels it is given", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const view = buildArchieView(stateOf(evaluation), "fp", { d: "Orders DB" });
  assert.match(view.explanation?.primaryIssue?.what ?? "", /Orders DB/);
  const answer = explainNodeInView(view, "d");
  assert.equal(answer.status, "findings");
});

// ---- Comparison ----

test("an improvement is summarised with before and after values", () => {
  const before = evaluate(simple(), { requestsPerSecond: 6000 });
  const after = evaluate(strong(), { requestsPerSecond: 6000 });
  const result = explainComparison(before, after);
  assert.match(result.headline, /^Your changes improved scalability from \d+ to \d+/);
  assert.match(result.headline, new RegExp(`from ${before.scores.scalability} to ${after.scores.scalability}`));
  assert.match(result.headline, /The overall score went from \d+ to \d+\./);
  assert.ok(result.improved.length > 0);
  assert.ok(result.improved.every((c) => c.direction === "improved" && c.text.includes("→")));
  assert.ok(result.improved.some((c) => c.metric === "capacityRps"));
});

test("a regression is summarised as getting worse", () => {
  const result = explainComparison(evaluate(strong(), { requestsPerSecond: 6000 }), evaluate(simple(), { requestsPerSecond: 6000 }));
  assert.match(result.headline, /^Your changes made some results worse|, but /);
  assert.ok(result.regressed.length > 0);
  assert.ok(result.regressed.every((c) => c.direction === "regressed"));
  assert.match(result.headline, /dropped|rose/);
});

test("improvement that costs more mentions the trade-off", () => {
  const before = evaluate(simple(), { requestsPerSecond: 6000 });
  const after = evaluate(strong(), { requestsPerSecond: 6000 });
  const result = explainComparison(before, after);
  assert.ok(result.regressed.some((c) => c.metric === "estimatedMonthlyCost"));
  assert.match(result.headline, /but monthly cost rose from \$\d+ to \$\d+/);
  assert.match(result.tradeoffNote ?? "", /costs more/);
  assert.ok(result.improved.some((c) => c.metric === "p95LatencyMs") || result.improved.length > 0);
});

test("no change is reported as no change, and no trade-off is invented", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 6000 });
  const result = explainComparison(evaluation, evaluation);
  assert.equal(result.headline, "Your changes did not change the results.");
  assert.deepEqual(result.improved, []);
  assert.deepEqual(result.regressed, []);
  assert.equal(result.tradeoffNote, null);
  assert.equal(result.healthChange, null);
});

test("resolved and new findings are listed by title", () => {
  const before = evaluate(simple(), { requestsPerSecond: 6000 });
  const after = evaluate(strong(), { requestsPerSecond: 6000 });
  const result = explainComparison(before, after, { s: "API", d: "DB", c: "C", lb: "LB" });
  assert.ok(result.resolved.length > 0);
  assert.ok(result.resolved.some((r) => r.findingId === "saturated-s" && /API is overloaded/.test(r.title)));
  const reverse = explainComparison(after, before);
  assert.ok(reverse.introduced.some((r) => r.findingId === "saturated-s"));
  assert.deepEqual(result.introduced.map((i) => i.findingId).filter((id) => result.resolved.some((r) => r.findingId === id)), []);
});

test("a health change is mentioned", () => {
  const result = explainComparison(evaluate(simple(), { requestsPerSecond: 20_000 }), evaluate(simple(), { requestsPerSecond: 500 }));
  assert.match(result.healthChange ?? "", /Health went from critical to warning/);
});

test("the view carries a comparison once there are two runs", () => {
  const before = evaluate(simple(), { requestsPerSecond: 6000 });
  const after = evaluate(strong(), { requestsPerSecond: 6000 });
  const view = buildArchieView(stateOf(after, before), "fp");
  assert.ok(view.comparison);
  assert.match(view.comparison?.headline ?? "", /improved/);
  assert.equal(buildArchieView(stateOf(after), "fp").comparison, null);
});

// ---- Context for a future model ----

test("the model context is small plain data about the evaluation", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const view = buildArchieView(stateOf(evaluation, evaluate(simple(), { requestsPerSecond: 8000 })), "fp", {
    c: "Browser", s: "API", d: "Orders DB",
  });
  const context = buildArchieContext(view, { nodeId: "d" });
  assert.ok(context);
  assert.equal(context.version, ARCHIE_CONTEXT_VERSION);
  assert.equal(context.basedOn, "current-design");
  assert.equal(context.evaluationModelVersion, evaluation.modelVersion);
  assert.deepEqual(context.results.scores, evaluation.scores);
  assert.equal(context.results.overallScore, evaluation.overallScore);
  assert.deepEqual(context.results.metrics, evaluation.metrics);
  assert.deepEqual(context.results.bottleneckNodeIds, evaluation.bottleneckNodeIds);
  assert.equal(context.selected?.id, "d");
  assert.equal(context.selected?.label, "Orders DB");
  assert.equal(context.selected?.role, COMPONENT_ROLES.database);
  assert.ok(context.explanations.length <= MAX_CONTEXT_EXPLANATIONS);
  assert.equal(context.explanations[0].findingId, "saturated-d");
  assert.ok(context.rules.some((rule) => /deterministic evaluation/.test(rule)));
  assert.ok(context.comparison);
  assert.deepEqual(JSON.parse(JSON.stringify(context)), context);
});

test("the model context holds no UI state, positions or raw graph", () => {
  const evaluation = evaluate(dbBound(), { requestsPerSecond: 8000 });
  const view = buildArchieView(stateOf(evaluation), "fp", { d: "Orders DB" });
  const text = JSON.stringify(buildArchieContext(view));
  assert.equal(/position|selected":true|measured|dragging|className|style|viewport|"nodes"|"edges"/.test(text), false);
  const keys = Object.keys(buildArchieContext(view) ?? {});
  assert.deepEqual(keys.sort(), ["basedOn", "components", "evaluationModelVersion", "explanations", "nextSteps", "results", "rules", "traffic", "version"]);
});

test("the model context is focused on the component asked about", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 20_000, readRatio: 90 });
  const view = buildArchieView(stateOf(evaluation), "fp");
  const general = buildArchieContext(view);
  const about = buildArchieContext(view, { nodeId: "s" });
  assert.equal(general?.selected, undefined);
  assert.ok(about?.selected);
  assert.ok(about.explanations.slice(0, 1).every((x) => x.nodeIds.includes("s")));
  assert.ok((general?.explanations.length ?? 0) <= MAX_CONTEXT_EXPLANATIONS);
  assert.ok(about.components.some((c) => c.id === "s"));
});

test("the model context says when it describes an earlier run, and is null with no run", () => {
  const evaluation = evaluate(simple(), { requestsPerSecond: 9000 });
  assert.equal(buildArchieContext(buildArchieView(stateOf(evaluation), "other"))?.basedOn, "previous-run");
  assert.equal(buildArchieContext(buildArchieView(INITIAL_RUN_STATE, "fp")), null);
});
