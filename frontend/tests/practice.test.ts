import assert from "node:assert/strict";
import test from "node:test";

import { applyChanges } from "../src/lib/ai/changes.ts";
import { summarizeAttempts } from "../src/lib/architecture/practice/attempts.ts";
import { incidentImpact, parseIncident } from "../src/lib/architecture/practice/incidents.ts";
import { gradePrediction, parsePrediction } from "../src/lib/architecture/practice/predictions.ts";
import { INCIDENT_SCENARIOS, gradeIncidentAttempt, scenarioById, scenarioView } from "../src/lib/architecture/practice/scenarios.ts";

let column = 0;
const n = (id: string, type: string, label: string, properties?: Record<string, number>) =>
  ({ id, position: { x: (column += 200), y: 0 }, data: { type, label, ...(properties ? { properties } : {}) } }) as never;
const e = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });

// Users -> LB -> API (2) -> Login, Redis -> Orders DB; API -> Jobs -> Worker -> Orders DB
const shop = (dbReplicas = 0) => ({
  nodes: [
    n("c", "client", "Users"), n("lb", "load-balancer", "LB"), n("api", "server", "API", { replicas: 2 }), n("au", "auth", "Login"),
    n("k", "cache", "Redis"), n("db", "database", "Orders DB", { replicas: dbReplicas }), n("q", "queue", "Jobs"), n("w", "worker", "Worker"),
  ],
  edges: [e("c", "lb"), e("lb", "api"), e("api", "au"), e("api", "k"), e("k", "db"), e("api", "q"), e("q", "w"), e("w", "db")],
});
const status = (impact: ReturnType<typeof incidentImpact>) => Object.fromEntries(impact.operations.map((operation) => [operation.id, operation.status]));

// ---- Incidents ----

test("a database with no replica goes down: reads fall back to cache hits, writes wait on the queue", () => {
  const impact = incidentImpact(shop(0), {}, { kind: "instance-down", nodeId: "db" });
  assert.equal(impact.description, "Orders DB's only instance fails, so Orders DB is down.");
  assert.deepEqual(impact.failed, ["db"]);
  assert.deepEqual(status(impact), { "use-app": "works", read: "partly", save: "works", "sign-in": "works", jobs: "works" });
  assert.match(impact.operations.find((operation) => operation.id === "read")!.note!, /cache hits/);
  assert.match(impact.operations.find((operation) => operation.id === "save")!.note!, /once the database is back/);
  assert.ok(impact.during.servedPercent < impact.healthy.servedPercent - 10);
});

test("a database with a replica loses its primary and carries on", () => {
  const impact = incidentImpact(shop(1), {}, { kind: "instance-down", nodeId: "db" });
  assert.match(impact.description, /read replica takes over/);
  assert.deepEqual(impact.failed, []);
  assert.ok(impact.operations.every((operation) => operation.status === "works"));
  assert.ok(impact.during.servedPercent >= 99);
});

test("a cache in front of the database is on the only path to it: reads stop, the worker still saves", () => {
  const impact = incidentImpact(shop(1), {}, { kind: "component-down", nodeId: "k" });
  assert.deepEqual(impact.cutOff, ["db"], "the database is cut off from the request path");
  assert.equal(status(impact).read, "down", "a queue and worker answer nobody's read");
  assert.equal(status(impact).save, "works");
  assert.match(impact.operations.find((operation) => operation.id === "save")!.note!, /worker saves them/);
});

test("losing sign-in loses the requests that sign in; losing the entry point loses everything", () => {
  const login = incidentImpact(shop(1), {}, { kind: "component-down", nodeId: "au" });
  assert.equal(status(login)["sign-in"], "down");
  assert.ok(login.during.servedPercent < login.healthy.servedPercent && login.during.servedPercent > 90, String(login.during.servedPercent));
  const lb = incidentImpact(shop(1), {}, { kind: "component-down", nodeId: "lb" });
  assert.equal(lb.during.servedPercent, 0);
  assert.ok(lb.operations.every((operation) => operation.status === "down"));
  assert.deepEqual(lb.cutOff.sort(), ["api", "au", "db", "k"]);
});

test("losing one of two busy servers halves what is served; a traffic spike overloads them", () => {
  const lost = incidentImpact(shop(1), { requestsPerSecond: 5_000 }, { kind: "instance-down", nodeId: "api" });
  assert.equal(lost.description, "One instance of API fails (1 of 2 left).");
  assert.ok(lost.during.servedPercent < 60);
  const spike = incidentImpact(shop(1), {}, { kind: "traffic-spike", multiplier: 10 });
  assert.ok(spike.explanation.some((line) => /Now overloaded: API/.test(line)), spike.explanation.join(" | "));
});

test("a slowed worker keeps requests flowing but lets jobs pile up", () => {
  const impact = incidentImpact(shop(1), { requestsPerSecond: 5_000, readRatio: 20 }, { kind: "capacity-drop", nodeId: "w", factor: 0.1 });
  assert.equal(status(impact).jobs, "partly");
  assert.ok(impact.during.servedPercent >= 99);
  assert.ok(impact.explanation.at(-1)!.includes("not everything works"));
});

test("incidents are checked against the design", () => {
  const design = shop();
  assert.equal(parseIncident({ kind: "component-down", nodeId: "nope" }, design).ok, false);
  assert.equal(parseIncident({ kind: "capacity-drop", nodeId: "w", factor: 1.5 }, design).ok, false);
  assert.equal(parseIncident({ kind: "traffic-spike", multiplier: 0.5 }, design).ok, false);
  assert.equal(parseIncident({ kind: "explode" }, design).ok, false);
  assert.deepEqual(parseIncident({ kind: "instance-down", nodeId: "db", extra: 1 }, design), { ok: true, incident: { kind: "instance-down", nodeId: "db" } });
});

// ---- Predictions ----

const simple = (apiReplicas: number) => ({
  nodes: [n("c", "client", "Users"), n("lb", "load-balancer", "LB"), n("api", "server", "API", { replicas: apiReplicas }), n("db", "database", "DB")],
  edges: [e("c", "lb"), e("lb", "api"), e("api", "db")],
});

test("each prediction is graded against the engine and explained with its numbers", () => {
  const graded = gradePrediction(simple(2), { requestsPerSecond: 3_000 }, { firstToFill: "db", meetsTarget: true, p95TargetMs: 200, handlesLoad: true });
  const [fill, target, load] = graded.answers;
  assert.deepEqual([fill!.correct, fill!.actual], [false, "api"]);
  assert.match(fill!.explanation, /^API fills up first: at 3,000 req\/s it runs at 60% of its capacity/);
  assert.match(fill!.explanation, /DB is at \d+%, so it still has room when API is full\./);
  assert.equal(target!.correct, true);
  assert.match(target!.explanation, /^p95 is \d+ ms against a target of 200 ms\./);
  assert.equal(load!.correct, true);
  assert.deepEqual([graded.correct, graded.total], [2, 3]);
  assert.equal(graded.actual.firstToFill, "api");
});

test("predicting a change: which way capacity, p95, cost and uptime move", () => {
  const graded = gradePrediction(simple(2), { requestsPerSecond: 3_000 }, { change: { capacity: "up", cost: "up", p95: "same", uptime: "up" } }, simple(4));
  const byMetric = Object.fromEntries(graded.answers.map((answer) => [answer.question, answer]));
  assert.equal(byMetric["change.capacity"]!.actual, "up");
  assert.match(byMetric["change.capacity"]!.explanation, /DB now fills up first instead of API/);
  assert.equal(byMetric["change.cost"]!.actual, "up");
  assert.equal(byMetric["change.p95"]!.actual, "same");
  assert.equal(graded.actual.after?.firstToFill, "db");
});

test("predictions are checked before grading", () => {
  const design = simple(2);
  assert.equal(parsePrediction({}, design, false).ok, false, "at least one question");
  assert.equal(parsePrediction({ firstToFill: "nope" }, design, false).ok, false);
  assert.equal(parsePrediction({ meetsTarget: true }, design, false).ok, false, "a target is needed");
  assert.equal(parsePrediction({ change: { capacity: "up" } }, design, false).ok, false, "a change needs the changed design");
  assert.equal(parsePrediction({ change: { speed: "up" } }, design, true).ok, false);
  assert.equal(parsePrediction({ handlesLoad: true, reasoning: "x".repeat(501) }, design, false).ok, false);
  assert.equal(parsePrediction({ handlesLoad: true, surprise: 1 }, design, false).ok, false);
  assert.deepEqual(parsePrediction({ firstToFill: "none", confidence: "low", reasoning: " a guess " }, design, false), { ok: true, value: { firstToFill: "none", confidence: "low", reasoning: "a guess" } });
});

// ---- Incident Lab scenarios ----

test("every scenario fails on its starting design and passes with its known fix", () => {
  assert.ok(INCIDENT_SCENARIOS.length >= 4);
  for (const scenario of INCIDENT_SCENARIOS) {
    const start = gradeIncidentAttempt(scenario, { graph: scenario.design as never });
    assert.equal(start.passed, false, `${scenario.id} must start broken`);
    const fixed = applyChanges(scenario.design as never, scenario.knownFix);
    assert.ok(fixed.ok, scenario.id);
    const after = gradeIncidentAttempt(scenario, { graph: { nodes: fixed.nodes, edges: fixed.edges } as never });
    assert.equal(after.passed, true, `${scenario.id}: ${after.checks.filter((check) => !check.passed).map((check) => check.detail).join("; ")}`);
  }
});

test("removing the part that fails does not pass, and diagnoses are graded", () => {
  const scenario = scenarioById("database-outage")!;
  const removed = { nodes: scenario.design.nodes.filter((node) => node.id !== "database-1"), edges: scenario.design.edges.filter((edge) => edge.target !== "database-1") };
  const graded = gradeIncidentAttempt(scenario, { graph: removed as never });
  assert.equal(graded.passed, false);
  assert.equal(graded.checks[0]!.id, "kept");
  assert.equal(gradeIncidentAttempt(scenario, { diagnosis: "database-1" }).diagnosis?.correct, true);
  assert.equal(gradeIncidentAttempt(scenario, { diagnosis: "server-1" }).diagnosis?.correct, false);
});

test("an over-budget fix does not pass", () => {
  const scenario = scenarioById("lost-server")!;
  const fixed = applyChanges(scenario.design as never, [{ op: "set_setting", node: "server-1", key: "replicas", value: 40 }]);
  assert.ok(fixed.ok);
  const graded = gradeIncidentAttempt(scenario, { graph: { nodes: fixed.nodes, edges: fixed.edges } as never });
  assert.equal(graded.checks.find((check) => check.id === "budget")?.passed, false);
  assert.equal(graded.passed, false);
});

test("the scenario view does not give away the answer", () => {
  for (const scenario of INCIDENT_SCENARIOS) {
    const view = JSON.stringify(scenarioView(scenario));
    assert.ok(!view.includes(scenario.rootCause.text), scenario.id);
    assert.ok(!view.includes(scenario.debrief.mitigation), scenario.id);
    assert.ok(!view.includes("knownFix") && !view.includes("rootCause"), scenario.id);
  }
});

// ---- History ----

test("practice history: accuracy overall and recently, by question, and scenarios passed", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes));
  const prediction = (minutes: number, correct: boolean) => ({
    kind: "prediction", scenarioId: null, correct: correct ? 1 : 0, total: 1, passed: correct,
    result: { answers: [{ question: "firstToFill", correct }] }, createdAt: at(minutes),
  });
  const rows = [
    ...Array.from({ length: 10 }, (_, index) => prediction(index, false)),
    ...Array.from({ length: 10 }, (_, index) => prediction(100 + index, true)),
    { kind: "incident", scenarioId: "cache-outage", correct: 1, total: 1, passed: true, result: {}, createdAt: at(200) },
    { kind: "incident", scenarioId: "lost-server", correct: 0, total: 1, passed: false, result: {}, createdAt: at(201) },
  ];
  const summary = summarizeAttempts(rows);
  assert.deepEqual(summary.predictions, { attempts: 20, accuracy: 50, recentAccuracy: 100, earlierAccuracy: 0, byQuestion: { firstToFill: { correct: 10, total: 20 } } });
  assert.deepEqual(summary.incidents, { attempts: 2, passedScenarios: ["cache-outage"] });
});
