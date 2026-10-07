import assert from "node:assert/strict";
import test from "node:test";

import { toCardResult } from "../src/components/challenge/cardResult.ts";
import {
  urlShortenerChallenge,
  urlShortenerDefinition,
} from "../src/components/challenge/challenges.ts";
import { buildArchieView } from "../src/lib/architecture/archie/view.ts";
import {
  DEFAULT_CHALLENGE_SCORING,
  type ChallengeDefinition,
  type ChallengeRequirement,
} from "../src/lib/architecture/challenge/contract.ts";
import {
  evaluateChallenge,
  judgeChallenge,
  validateChallengeDefinition,
} from "../src/lib/architecture/challenge/evaluate.ts";
import { challengeFingerprint, createChallengeSession } from "../src/lib/architecture/challenge/session.ts";
import { buildChallengeView } from "../src/lib/architecture/challenge/view.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { evaluateDesign, type EvaluateDesign } from "../src/lib/architecture/evaluation/evaluationService.ts";
import { INITIAL_RUN_STATE, createRunSession } from "../src/lib/architecture/evaluation/runSession.ts";
import { createLearnSession } from "../src/lib/architecture/learn/session.ts";
import { firstWebSystemLesson } from "../src/components/learn/lessons.ts";
import { buildArchieContext } from "../src/lib/architecture/archie/context.ts";

// ---- Helpers ----

type N = { id: string; data: { type: string; label: string; properties?: Record<string, unknown> } };
const n = (id: string, type: string, properties?: Record<string, unknown>, label = id): N => ({
  id,
  data: { type, label, ...(properties ? { properties } : {}) },
});
const e = (source: string, target: string) => ({ source, target });
const graphOf = (nodes: N[], edges: { source: string; target: string }[]) => ({ nodes, edges });

const empty = () => graphOf([], []);
const weak = () => graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s"), e("s", "d")]);
const strong = () =>
  graphOf(
    [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 5 }), n("k", "cache"), n("d", "database", { replicas: 2 })],
    [e("c", "lb"), e("lb", "s"), e("s", "k"), e("s", "d")],
  );
const noCache = () =>
  graphOf(
    [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 5 }), n("d", "database", { replicas: 4 })],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );
const noDatabase = () =>
  graphOf([n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 5 })], [e("c", "lb"), e("lb", "s")]);
const expensive = () =>
  graphOf(
    [n("c", "client"), n("lb", "load-balancer", { replicas: 2 }), n("s", "server", { replicas: 12 }), n("k", "cache", { replicas: 3 }), n("d", "database", { replicas: 5 })],
    [e("c", "lb"), e("lb", "s"), e("s", "k"), e("s", "d")],
  );

const url = urlShortenerDefinition;
const evaluate = (graph: unknown, challenge: ChallengeDefinition = url, labels?: Record<string, string>) =>
  evaluateChallenge({ challenge, graph: graph as never, labels });
const result = (evaluation: ReturnType<typeof evaluate>, id: string) =>
  evaluation.requirementResults.find((r) => r.requirementId === id);

// A challenge with a single condition, to test one kind of requirement at a time.
const only = (
  requirement: ChallengeRequirement,
  traffic: ChallengeDefinition["traffic"] = { requestsPerSecond: 1000 },
): ChallengeDefinition => ({
  id: "t",
  title: "Test",
  difficulty: "Beginner",
  description: "",
  traffic,
  requirements: [requirement],
  constraints: [],
  scoring: DEFAULT_CHALLENGE_SCORING,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ---- Definitions ----

test("the URL shortener is a valid challenge definition", () => {
  assert.deepEqual(validateChallengeDefinition(url), []);
});

test("an invalid definition says what is wrong", () => {
  const base = url;
  const problems = (change: Partial<ChallengeDefinition>) => validateChallengeDefinition({ ...base, ...change });
  assert.ok(problems({ id: " " }).some((p) => /id/.test(p)));
  assert.ok(problems({ title: "" }).some((p) => /title/.test(p)));
  assert.ok(problems({ requirements: [], constraints: [] }).some((p) => /at least one/.test(p)));
  assert.ok(problems({ requirements: [...base.requirements, base.requirements[0]] }).some((p) => /used twice/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "min-capacity", minRps: -5, label: "x" }] }).some((p) => /positive capacity/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "max-latency", maxP95Ms: 0, label: "x" }] }).some((p) => /latency/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "min-availability", minPercent: 120, label: "x" }] }).some((p) => /availability/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "max-cost", maxMonthlyCost: Number.NaN, label: "x" }] }).some((p) => /budget/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "max-components", max: 2.5, label: "x" }] }).some((p) => /whole number/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "requires-component", componentType: "teleporter" as never, label: "x" }] }).some((p) => /unknown component/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "min-capacity", minRps: 1, label: "x", weight: 0 }] }).some((p) => /weight/.test(p)));
  assert.ok(problems({ requirements: [{ id: "x", kind: "bogus" as never, label: "x" } as never] }).some((p) => /unknown kind/.test(p)));
  assert.ok(problems({ scoring: { ...base.scoring, requirementWeight: 0.7 } }).some((p) => /add up to 1/.test(p)));
  assert.ok(problems({ scoring: { ...base.scoring, mandatoryCap: 80 } }).some((p) => /below the pass score/.test(p)));
  assert.ok(problems({ scoring: { ...base.scoring, passScore: 120 } }).some((p) => /pass score/.test(p)));
});

test("the URL shortener keeps its brief and its machine-checkable conditions", () => {
  assert.equal(urlShortenerChallenge.definition, urlShortenerDefinition);
  assert.equal(urlShortenerChallenge.id, "url-shortener");
  assert.equal(urlShortenerChallenge.title, "Design a URL Shortener");
  assert.equal(urlShortenerChallenge.difficulty, "Intermediate");
  assert.deepEqual(urlShortenerChallenge.summary, ["100M redirects / day", "10M new URLs / day"]);
  assert.deepEqual(urlShortenerChallenge.highlights, ["Fast redirects", "High availability", "Scales with traffic"]);
  assert.equal(urlShortenerChallenge.requirements.length, 5);
  assert.equal(url.traffic.requestsPerSecond, 11_500);
  assert.equal(url.traffic.readRatio, 91);
  assert.ok(url.requirements.some((r) => r.kind === "min-capacity" && r.mandatory));
  assert.ok(url.requirements.some((r) => r.kind === "requires-component" && r.componentType === "database"));
  assert.ok(url.constraints.some((r) => r.kind === "max-cost"));
});

// ---- Requirement kinds ----

test("capacity requirement compares the design's capacity with the target", () => {
  const challenge = only({ id: "cap", kind: "min-capacity", minRps: 2000, label: "Capacity" });
  assert.equal(result(evaluate(strong(), challenge), "cap")?.passed, true);
  // The weak design can take about 2,500 requests per second: enough for 2,000, not for 5,000.
  const enough = result(evaluate(weak(), challenge), "cap");
  assert.equal(enough?.passed, true);
  assert.equal(enough?.measuredValue, 2500);
  const tooMuch = result(evaluate(weak(), only({ id: "cap", kind: "min-capacity", minRps: 5000, label: "Capacity" })), "cap");
  assert.equal(tooMuch?.passed, false);
  assert.equal(tooMuch?.measuredValue, 2500);
  assert.equal(tooMuch?.target, 5000);
  assert.deepEqual(tooMuch?.nodeIds, ["s"]);
  assert.match(tooMuch?.explanation ?? "", /only take about 2,500 requests per second, below the 5,000 required/);
  assert.match(tooMuch?.explanation ?? "", /your server runs out first/);
});

test("latency requirement compares p95 with the limit", () => {
  const challenge = (maxP95Ms: number) => only({ id: "lat", kind: "max-latency", maxP95Ms, label: "Fast" });
  const ok = result(evaluate(strong(), challenge(1000)), "lat");
  assert.equal(ok?.passed, true);
  assert.equal(ok?.unit, "ms");
  const slow = result(evaluate(strong(), challenge(10)), "lat");
  assert.equal(slow?.passed, false);
  assert.equal(slow?.target, 10);
  assert.ok((slow?.measuredValue ?? 0) > 10);
  assert.ok((slow?.nodeIds.length ?? 0) > 0);
});

test("availability requirement uses the design's uptime", () => {
  const challenge = (minPercent: number) => only({ id: "up", kind: "min-availability", minPercent, label: "Up" });
  assert.equal(result(evaluate(weak(), challenge(99.5)), "up")?.passed, true);
  const miss = result(evaluate(weak(), challenge(99.95)), "up");
  assert.equal(miss?.passed, false);
  assert.equal(miss?.measuredValue, 99.8);
  assert.match(miss?.explanation ?? "", /99\.8%.*below the 99\.95%/);
  assert.equal(result(evaluate(strong(), challenge(99.99)), "up")?.passed, true);
});

test("budget requirement compares monthly cost", () => {
  const challenge = (maxMonthlyCost: number) => only({ id: "b", kind: "max-cost", maxMonthlyCost, label: "Budget" });
  assert.equal(result(evaluate(weak(), challenge(500)), "b")?.passed, true);
  const over = result(evaluate(expensive(), challenge(800)), "b");
  assert.equal(over?.passed, false);
  assert.ok((over?.measuredValue ?? 0) > 800);
  assert.match(over?.explanation ?? "", /over the \$800 budget/);
});

test("required component must exist and be reached by requests", () => {
  const challenge = only({ id: "k", kind: "requires-component", componentType: "cache", label: "Cache" });
  assert.equal(result(evaluate(strong(), challenge), "k")?.passed, true);
  const missing = result(evaluate(weak(), challenge), "k");
  assert.equal(missing?.passed, false);
  assert.match(missing?.explanation ?? "", /needs a cache/);
  const unused = graphOf([...weak().nodes, n("k", "cache")], weak().edges);
  const loose = result(evaluate(unused, challenge), "k");
  assert.equal(loose?.passed, false);
  assert.match(loose?.explanation ?? "", /no request reaches it/);
  assert.deepEqual(loose?.nodeIds, ["k"]);
  const two = only({ id: "s", kind: "requires-component", componentType: "server", minCount: 2, label: "Servers" });
  assert.equal(result(evaluate(weak(), two), "s")?.passed, false);
  const pair = graphOf([n("c", "client"), n("a", "server"), n("b", "server")], [e("c", "a"), e("c", "b")]);
  assert.equal(result(evaluate(pair, two), "s")?.passed, true);
});

test("a forbidden component fails the design whenever it is present", () => {
  const challenge = only({ id: "f", kind: "forbids-component", componentType: "cache", label: "No cache" });
  assert.equal(result(evaluate(weak(), challenge), "f")?.passed, true);
  const used = result(evaluate(strong(), challenge), "f");
  assert.equal(used?.passed, false);
  assert.deepEqual(used?.nodeIds, ["k"]);
  const loose = graphOf([...weak().nodes, n("k", "cache")], weak().edges);
  assert.equal(result(evaluate(loose, challenge), "f")?.passed, false);
});

test("component count limit ignores clients", () => {
  const challenge = (max: number) => only({ id: "m", kind: "max-components", max, label: "Small" });
  assert.equal(result(evaluate(weak(), challenge(2)), "m")?.passed, true);
  const over = result(evaluate(weak(), challenge(1)), "m");
  assert.equal(over?.passed, false);
  assert.equal(over?.measuredValue, 2);
  assert.equal(over?.target, 1);
});

test("nothing can be met by a design that does not run", () => {
  const kinds: ChallengeRequirement[] = [
    { id: "1", kind: "min-capacity", minRps: 1, label: "a" },
    { id: "2", kind: "max-latency", maxP95Ms: 1000, label: "b" },
    { id: "3", kind: "min-availability", minPercent: 50, label: "c" },
    { id: "4", kind: "max-cost", maxMonthlyCost: 1_000_000, label: "d" },
    { id: "5", kind: "forbids-component", componentType: "cache", label: "e" },
    { id: "6", kind: "max-components", max: 100, label: "f" },
    { id: "7", kind: "requires-component", componentType: "server", label: "g" },
  ];
  const evaluation = evaluate(empty(), { ...url, requirements: kinds, constraints: [] });
  assert.ok(evaluation.requirementResults.every((r) => !r.passed));
  assert.equal(evaluation.score.score, 0);
  assert.equal(evaluation.score.passed, false);
  assert.match(result(evaluation, "2")?.explanation ?? "", /Nothing serves requests yet/);
});

test("results carry every requirement, in order, with its group and weight", () => {
  const evaluation = evaluate(strong());
  assert.deepEqual(
    evaluation.requirementResults.map((r) => [r.requirementId, r.group]),
    [
      ["capacity", "requirement"],
      ["backend", "requirement"],
      ["storage", "requirement"],
      ["fast-redirects", "requirement"],
      ["available", "requirement"],
      ["budget", "constraint"],
      ["size", "constraint"],
    ],
  );
  const capacity = result(evaluation, "capacity");
  assert.equal(capacity?.mandatory, true);
  assert.equal(capacity?.weight, 3);
  assert.equal(capacity?.kind, "min-capacity");
  assert.equal(result(evaluation, "size")?.weight, 1);
  for (const r of evaluation.requirementResults) assert.ok(r.explanation.length > 0);
});

// ---- Score ----

test("the score is the stated blend of requirement score and architecture score", () => {
  for (const graph of [strong(), noCache(), expensive()]) {
    const evaluation = evaluate(graph);
    const { score } = evaluation;
    assert.equal(score.mandatoryFailed.length, 0);
    const met = evaluation.requirementResults.filter((r) => r.passed).reduce((sum, r) => sum + r.weight, 0);
    const total = evaluation.requirementResults.reduce((sum, r) => sum + r.weight, 0);
    const expected = Math.round(0.6 * ((met / total) * 100) + 0.4 * evaluation.architectureEvaluation.overallScore);
    assert.equal(score.score, expected);
    assert.equal(score.architectureScore, evaluation.architectureEvaluation.overallScore);
    assert.deepEqual(score.weights, { requirement: 0.6, architecture: 0.4 });
  }
});

test("the same design always gets the same score", () => {
  assert.deepEqual(evaluate(strong()), evaluate(strong()));
  assert.equal(JSON.stringify(evaluate(noCache())), JSON.stringify(evaluate(noCache())));
});

test("a good design solves the challenge and a weak one does not", () => {
  const good = evaluate(strong());
  assert.equal(good.score.passed, true);
  assert.ok(good.score.score >= 90);
  assert.equal(good.feedback.summary, "Your design solves the challenge.");
  const poor = evaluate(weak());
  assert.equal(poor.score.passed, false);
  assert.ok(poor.score.score < good.score.score);
  assert.deepEqual(poor.score.mandatoryFailed, ["capacity"]);
});

test("a failed mandatory requirement caps the score even when the architecture is excellent", () => {
  const missing = evaluate(noDatabase());
  assert.equal(missing.architectureEvaluation.overallScore >= 85, true);
  assert.deepEqual(missing.score.mandatoryFailed, ["storage"]);
  assert.equal(missing.score.capApplied, true);
  assert.equal(missing.score.score, DEFAULT_CHALLENGE_SCORING.mandatoryCap);
  assert.equal(missing.score.passed, false);
  assert.ok(missing.score.score < evaluate(strong()).score.score);
});

test("a failed optional requirement lowers the score but does not cap or fail the design", () => {
  const expensiveOne = evaluate(expensive());
  assert.equal(result(expensiveOne, "budget")?.passed, false);
  assert.deepEqual(expensiveOne.score.mandatoryFailed, []);
  assert.equal(expensiveOne.score.capApplied, false);
  assert.equal(expensiveOne.score.passed, true);
  assert.ok(expensiveOne.score.score < evaluate(strong()).score.score);
});

test("a design that misses the requirements cannot score well on architecture alone", () => {
  const challenge: ChallengeDefinition = { ...url, requirements: [{ id: "x", kind: "min-capacity", minRps: 1_000_000, label: "Huge", mandatory: true }], constraints: [] };
  const evaluation = evaluate(strong(), challenge);
  assert.ok(evaluation.architectureEvaluation.overallScore >= 85);
  assert.equal(evaluation.score.requirementScore, 0);
  assert.ok(evaluation.score.score <= 0.4 * evaluation.architectureEvaluation.overallScore + 1);
  assert.equal(evaluation.score.passed, false);
});

test("scores are whole numbers from 0 to 100", () => {
  for (const graph of [empty(), weak(), strong(), noCache(), noDatabase(), expensive()]) {
    const { score } = evaluate(graph);
    assert.ok(Number.isInteger(score.score) && score.score >= 0 && score.score <= 100);
    assert.ok(score.requirementScore >= 0 && score.requirementScore <= 100);
  }
});

test("a score is explainable: the requirement shares add up", () => {
  const evaluation = evaluate(noCache());
  assert.equal(result(evaluation, "fast-redirects")?.passed, false);
  const met = evaluation.requirementResults.filter((r) => r.passed);
  const failed = evaluation.requirementResults.filter((r) => !r.passed);
  assert.equal(met.length + failed.length, evaluation.requirementResults.length);
  assert.equal(evaluation.score.requirementScore, Math.round((met.reduce((s, r) => s + r.weight, 0) / evaluation.requirementResults.reduce((s, r) => s + r.weight, 0)) * 100));
});

// ---- Shared evaluation ----

test("the challenge reuses the shared architecture evaluation at its own traffic", () => {
  const evaluation = evaluate(strong());
  assert.deepEqual(
    evaluation.architectureEvaluation,
    evaluateArchitecture({ graph: strong() as never, traffic: url.traffic }),
  );
  assert.equal(evaluation.architectureEvaluation.traffic.requestsPerSecond, 11_500);
  assert.equal(evaluation.architectureEvaluation.traffic.readRatio, 91);
  const direct = judgeChallenge(url, evaluateArchitecture({ graph: strong() as never, traffic: url.traffic }));
  assert.deepEqual(direct, evaluation);
});

test("the challenge evaluation does not change what it is given", () => {
  const graph = deepFreeze(strong());
  const challenge = deepFreeze({ ...url, traffic: { ...url.traffic } });
  const before = JSON.stringify({ graph, challenge });
  evaluate(graph, challenge, { s: "API" });
  assert.equal(JSON.stringify({ graph, challenge }), before);
});

// ---- Feedback ----

test("feedback names the requirements that actually failed", () => {
  const evaluation = evaluate(weak(), url, { c: "Browser", s: "Redirect API", d: "URL store" });
  const { feedback } = evaluation;
  assert.deepEqual(
    feedback.failedRequirements.map((f) => f.requirementId),
    evaluation.requirementResults.filter((r) => !r.passed).map((r) => r.requirementId),
  );
  assert.ok(feedback.failedRequirements.some((f) => f.requirementId === "capacity" && /Redirect API \(server\) runs out first/.test(f.explanation)));
  assert.deepEqual(feedback.passedRequirements.sort(), ["backend", "budget", "size", "storage"]);
  assert.match(feedback.summary, /does not meet a required condition yet: Handle peak traffic/);
  assert.equal(feedback.failedRequirements.every((f) => !feedback.passedRequirements.includes(f.requirementId)), true);
});

test("feedback uses the architecture evaluation's own diagnosis for weaknesses and next steps", () => {
  const evaluation = evaluate(weak());
  const { feedback } = evaluation;
  assert.ok(feedback.weaknesses.length >= 1 && feedback.weaknesses.length <= 2);
  assert.ok(feedback.weaknesses.every((w) => w.title && w.why));
  assert.ok(feedback.improvements.length >= 1 && feedback.improvements.length <= 3);
  assert.ok(feedback.improvements.every((i) => i.text && i.reason));
  assert.ok(evaluation.architectureEvaluation.findings.some((f) => f.severity === "high"));
});

test("feedback also says what is going well", () => {
  const { feedback } = evaluate(strong());
  assert.ok(feedback.strengths.some((s) => /Meets 7 of 7 requirements/.test(s)));
  assert.ok(feedback.strengths.some((s) => /strong/.test(s)));
  assert.deepEqual(feedback.failedRequirements, []);
});

test("an optional miss is described as close, not as missing a required condition", () => {
  const { feedback } = evaluate(expensive());
  assert.equal(feedback.summary, "Your design solves the challenge.");
  const weakButClose = evaluate(noCache(), { ...url, scoring: { ...url.scoring, passScore: 99 } });
  assert.match(weakButClose.feedback.summary, /close: 1 condition is still not met/);
});

test("components in feedback use their current names", () => {
  const evaluation = evaluate(weak(), url, { s: "Redirect API" });
  const text = JSON.stringify(evaluation.feedback);
  assert.match(text, /Redirect API/);
});

// ---- Submission lifecycle ----

const input = (graph: ReturnType<typeof graphOf>) => ({ nodes: graph.nodes as never, edges: graph.edges });
const viewOf = (session: ReturnType<typeof createChallengeSession>, graph: ReturnType<typeof graphOf>, labels?: Record<string, string>) =>
  buildChallengeView(session.getState(), challengeFingerprint(url, graph), url, labels);

test("a challenge starts in the building phase with nothing to show", () => {
  const session = createChallengeSession(url);
  const view = viewOf(session, weak());
  assert.equal(view.phase, "building");
  assert.equal(view.canSubmit, true);
  assert.equal(view.hasResult, false);
  assert.equal(view.isStale, false);
  assert.equal(view.result, null);
  assert.equal(view.scoreChange, null);
});

test("the first submission goes building, evaluating, results", async () => {
  const session = createChallengeSession(url);
  const phases: string[] = [];
  session.subscribe(() => phases.push(viewOf(session, strong()).phase));
  const running = session.submit(input(strong()));
  assert.ok(running);
  assert.equal(viewOf(session, strong()).phase, "evaluating");
  assert.equal(viewOf(session, strong()).canSubmit, false);
  await running;
  assert.deepEqual(phases, ["evaluating", "results"]);
  const view = viewOf(session, strong());
  assert.equal(view.phase, "results");
  assert.equal(view.hasResult, true);
  assert.equal(view.isStale, false);
  assert.equal(view.result?.score.passed, true);
  assert.equal(view.result?.challengeId, "url-shortener");
});

test("a submission is evaluated at the challenge's traffic, not the workspace's", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(weak()));
  assert.equal(session.getState().current?.traffic.requestsPerSecond, 11_500);
  assert.equal(session.getState().current?.fingerprint, challengeFingerprint(url, weak()));
});

test("a second submission is blocked while one is in progress", async () => {
  let calls = 0;
  const slow: EvaluateDesign = (request) => {
    calls += 1;
    return evaluateDesign(request);
  };
  const session = createChallengeSession(url, slow);
  const first = session.submit(input(weak()));
  assert.equal(session.submit(input(weak())), null);
  await first;
  assert.equal(calls, 1);
});

test("editing after a submission makes the result stale, and submitting again clears it", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(weak()));
  assert.equal(viewOf(session, weak()).isStale, false);

  assert.equal(viewOf(session, strong()).isStale, true);
  assert.equal(viewOf(session, strong()).phase, "results");
  assert.equal(viewOf(session, strong()).result?.score.score, evaluate(weak()).score.score);

  await session.submit(input(strong()));
  const view = viewOf(session, strong());
  assert.equal(view.isStale, false);
  assert.equal(view.result?.score.score, evaluate(strong()).score.score);
  assert.equal(view.previousResult?.score.score, evaluate(weak()).score.score);
  assert.equal(view.scoreChange?.direction, "improved");
  assert.equal(view.scoreChange?.delta, evaluate(strong()).score.score - evaluate(weak()).score.score);
});

test("moving or renaming components does not make a result stale", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(strong()));
  const renamed = graphOf(strong().nodes.map((node) => ({ ...node, data: { ...node.data, label: "Renamed" } })), strong().edges);
  assert.equal(viewOf(session, renamed).isStale, false);
});

test("a regression after resubmitting is reported", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(strong()));
  await session.submit(input(weak()));
  assert.equal(viewOf(session, weak()).scoreChange?.direction, "regressed");
});

test("a failed submission keeps the previous result", async () => {
  let fail = false;
  const flaky: EvaluateDesign = (request, options) =>
    fail ? Promise.reject(new Error("grader unavailable")) : evaluateDesign(request, options);
  const session = createChallengeSession(url, flaky);
  await session.submit(input(weak()));
  fail = true;
  await session.submit(input(strong()));
  const view = viewOf(session, strong());
  assert.equal(view.phase, "error");
  assert.equal(view.error, "grader unavailable");
  assert.equal(view.hasResult, true);
  assert.equal(view.result?.score.score, evaluate(weak()).score.score);
  assert.equal(view.isStale, true);
  assert.equal(view.canSubmit, true);

  fail = false;
  await session.submit(input(strong()));
  assert.equal(viewOf(session, strong()).phase, "results");
  assert.equal(viewOf(session, strong()).error, null);
});

test("a failed first submission leaves nothing to show and allows another try", async () => {
  const session = createChallengeSession(url, () => Promise.reject(new Error("down")));
  await session.submit(input(weak()));
  const view = viewOf(session, weak());
  assert.equal(view.phase, "error");
  assert.equal(view.hasResult, false);
  assert.equal(view.result, null);
  assert.equal(view.canSubmit, true);
});

test("submitting does not change the design", async () => {
  const graph = deepFreeze(strong());
  const before = JSON.stringify(graph);
  const session = createChallengeSession(url);
  await session.submit({ nodes: graph.nodes as never, edges: graph.edges });
  assert.equal(JSON.stringify(graph), before);
});

test("resetting a challenge clears the attempt", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(strong()));
  session.reset();
  assert.equal(viewOf(session, strong()).phase, "building");
  assert.equal(viewOf(session, strong()).hasResult, false);
});

test("submitting an empty design gives a clear, failing result", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(empty()));
  const view = viewOf(session, empty());
  assert.equal(view.result?.score.score, 0);
  assert.equal(view.result?.score.passed, false);
  assert.equal(view.result?.architectureEvaluation.health.status, "incomplete");
});

// ---- Isolation ----

test("a challenge result is separate from the workspace and from Learn", async () => {
  const challenge = createChallengeSession(url);
  const workspace = createRunSession(evaluateDesign);
  const lesson = createLearnSession(firstWebSystemLesson);

  await challenge.submit(input(strong()));
  assert.equal(workspace.getState(), INITIAL_RUN_STATE);
  assert.equal(workspace.getState().current, null);
  assert.deepEqual(lesson, createLearnSession(firstWebSystemLesson));

  await workspace.run({ projectId: "p", nodes: weak().nodes as never, edges: weak().edges, traffic: {} });
  assert.equal(challenge.getState().current?.traffic.requestsPerSecond, 11_500);
  assert.equal(workspace.getState().current?.traffic.requestsPerSecond, 1000);
  assert.notEqual(challenge.getState().current?.fingerprint, workspace.getState().current?.fingerprint);

  workspace.reset();
  assert.equal(viewOf(challenge, strong()).hasResult, true);
});

test("two challenge sessions do not share results", async () => {
  const a = createChallengeSession(url);
  const b = createChallengeSession(url);
  await a.submit(input(strong()));
  assert.equal(b.getState().current, null);
  assert.equal(viewOf(b, strong()).phase, "building");
});

// ---- Archie in a challenge ----

test("before a submission Archie has nothing to say about the design", () => {
  const view = buildArchieView(createChallengeSession(url).getState(), challengeFingerprint(url, weak()));
  assert.equal(view.status, "unavailable");
  assert.equal(view.explanation, null);
  assert.equal(view.source, null);
  assert.equal(buildArchieContext(view), null);
  const challengeView = viewOf(createChallengeSession(url), weak());
  assert.equal(challengeView.hasResult, false);
});

test("after a submission Archie can explain the submitted design", async () => {
  const session = createChallengeSession(url);
  await session.submit(input(weak()));
  const view = buildArchieView(session.getState(), challengeFingerprint(url, weak()), { c: "Browser", s: "Redirect API", d: "URL store" });
  assert.equal(view.status, "current");
  assert.ok(view.explanation);
  assert.match(view.explanation?.primaryIssue?.what ?? "", /URL store \(database\) is overloaded|Redirect API \(server\) is overloaded/);
  assert.ok(buildArchieContext(view));
  const stale = buildArchieView(session.getState(), challengeFingerprint(url, strong()));
  assert.equal(stale.status, "stale");
  assert.ok(stale.staleNotice);
});

// ---- Card ----

test("the card shows the challenge score, the architecture's bars and the failed requirements first", () => {
  const evaluation = evaluate(weak());
  const card = toCardResult(evaluation);
  assert.equal(card.overallScore, evaluation.score.score);
  assert.equal(card.scalability, evaluation.architectureEvaluation.scores.scalability);
  assert.equal(card.latency, evaluation.architectureEvaluation.scores.performance);
  assert.equal(card.findings[0].severity, "warning");
  assert.equal(card.findings[0].title, evaluation.feedback.failedRequirements[0].label);
  assert.ok(card.findings.some((f) => f.severity === "suggestion"));
  assert.ok(card.findings.some((f) => f.severity === "good"));
  const order = { warning: 0, suggestion: 1, good: 2 } as const;
  const ranks = card.findings.map((f) => order[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y));
});
