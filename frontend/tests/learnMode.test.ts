import assert from "node:assert/strict";
import test from "node:test";

import { firstWebSystemLesson } from "../src/components/learn/lessons.ts";
import { classifyLessonConnection, isLessonStepComplete } from "../src/components/learn/lessonValidation.ts";
import { evaluateDesign } from "../src/lib/architecture/evaluation/evaluationService.ts";
import { createRunSession } from "../src/lib/architecture/evaluation/runSession.ts";
import { getLearnHint, shouldShowHint } from "../src/lib/architecture/learn/hints.ts";
import { validateObjective, type LearnObjective } from "../src/lib/architecture/learn/objectives.ts";
import {
  checkLesson,
  createLearnSession,
  reconcileLearnSession,
  recordAttempt,
  resetLearnSession,
} from "../src/lib/architecture/learn/session.ts";
import { createChallengeSession } from "../src/lib/architecture/challenge/session.ts";
import { urlShortenerDefinition } from "../src/components/challenge/challenges.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";

// ---- Helpers ----

type N = {
  id: string;
  data: { type: ArchitectureNodeType; label?: string; properties?: Record<string, string | number | boolean> };
  position?: { x: number; y: number };
};
const n = (
  id: string,
  type: ArchitectureNodeType,
  properties?: Record<string, string | number | boolean>,
  label?: string,
): N => ({ id, data: { type, ...(label ? { label } : {}), ...(properties ? { properties } : {}) } });
const e = (source: string, target: string) => ({ source, target });
const graphOf = (nodes: N[], edges: { source: string; target: string }[]) => ({ nodes, edges });

const lesson = firstWebSystemLesson;
const STEPS = lesson.steps.length;
const step = (id: number) => lesson.steps[id - 1];

// The design the lesson builds, one stage at a time.
const stages = {
  client: () => graphOf([n("c", "client")], []),
  server: () => graphOf([n("c", "client"), n("s", "server")], []),
  connected: () => graphOf([n("c", "client"), n("s", "server")], [e("c", "s")]),
  database: () => graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s")]),
  stored: () => graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("c", "s"), e("s", "d")]),
  cache: () => graphOf([n("c", "client"), n("s", "server"), n("d", "database"), n("k", "cache")], [e("c", "s"), e("s", "d")]),
  cached: () => graphOf([n("c", "client"), n("s", "server"), n("d", "database"), n("k", "cache")], [e("c", "s"), e("s", "d"), e("s", "k")]),
  redundant: () =>
    graphOf(
      [n("c", "client"), n("s", "server", { replicas: 2 }), n("d", "database"), n("k", "cache")],
      [e("c", "s"), e("s", "d"), e("s", "k")],
    ),
};

const reconcile = (graph: ReturnType<typeof graphOf>, from = createLearnSession(lesson)) =>
  reconcileLearnSession(lesson, from, graph);

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ---- The lesson ----

test("the lesson is a complete beginner flow that explains why each step matters", () => {
  assert.equal(STEPS, 8);
  assert.deepEqual(lesson.steps.map((s) => s.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const s of lesson.steps) {
    assert.ok(s.title && s.description.length > 20 && s.instruction && s.successMessage, `step ${s.id}`);
    assert.ok(s.successExplanation.length > 20, `step ${s.id} explains why it worked`);
  }
  assert.equal(step(6).objective.kind, "node");
  assert.equal(step(7).objective.kind, "edge");
  assert.equal(step(8).objective.kind, "redundancy");
  assert.match(step(8).instruction, /Replicas/);
});

test("the finished design satisfies every step", () => {
  const checks = checkLesson(lesson, stages.redundant());
  assert.ok(checks.every((c) => c.valid));
  assert.equal(reconcile(stages.redundant()).status, "completed");
});

// ---- Session ----

test("a new session has not started", () => {
  const session = createLearnSession(lesson);
  assert.deepEqual(session, {
    lessonId: "first-web-system",
    status: "not-started",
    currentStep: 0,
    completedSteps: [],
    validSteps: [],
    everCompleted: false,
    attempts: {},
  });
});

test("reconciling an untouched session on an empty canvas changes nothing", () => {
  const session = createLearnSession(lesson);
  assert.equal(reconcile(graphOf([], []), session), session);
});

test("reconciling is idempotent and returns the same object when nothing changed", () => {
  const first = reconcile(stages.stored());
  assert.equal(reconcile(stages.stored(), first), first);
});

// ---- Progression ----

test("progress follows the design, step by step", () => {
  // [what was just built, the design, index of the step that is open afterwards]
  const sequence: [string, ReturnType<typeof graphOf>, number][] = [
    ["nothing", graphOf([], []), 0],
    ["a client", stages.client(), 1],
    ["a server", stages.server(), 2],
    ["client to server", stages.connected(), 3],
    ["a database", stages.database(), 4],
    ["server to database", stages.stored(), 5],
    ["a cache", stages.cache(), 6],
    ["server to cache", stages.cached(), 7],
    ["two servers", stages.redundant(), STEPS],
  ];
  let session = createLearnSession(lesson);
  for (const [built, graph, open] of sequence) {
    session = reconcile(graph, session);
    assert.equal(session.currentStep, open, built);
  }
  assert.equal(session.status, "completed");
});

test("a correct action completes the step and an unrelated edit does not", () => {
  const before = reconcile(stages.server());
  assert.equal(before.currentStep, 2);
  const unrelated = reconcile(graphOf([n("c", "client"), n("s", "server"), n("d", "database")], []), before);
  assert.equal(unrelated.currentStep, 2);
  assert.equal(isLessonStepComplete(step(3), stages.database().nodes, []), false);
  assert.equal(unrelated.validSteps.includes(3), false);
  const connected = reconcile(stages.connected(), before);
  assert.ok(connected.currentStep > 2);
  assert.ok(connected.validSteps.includes(3));
});

test("steps built ahead of time count, and the lesson waits at the first one still open", () => {
  const session = reconcile(graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("s", "d")]));
  assert.equal(session.currentStep, 2);
  assert.deepEqual(session.validSteps, [1, 2, 4, 5]);
  const fixed = reconcile(graphOf([n("c", "client"), n("s", "server"), n("d", "database")], [e("s", "d"), e("c", "s")]), session);
  assert.equal(fixed.currentStep, 5);
});

test("names, ids and positions never matter", () => {
  const renamed = graphOf(
    [
      { ...n("zz-1", "client", undefined, "Phone"), position: { x: 999, y: -5 } },
      { ...n("zz-2", "server", undefined, "Database"), position: { x: -3, y: 10 } },
      { ...n("zz-3", "database", undefined, "Client"), position: { x: 0, y: 0 } },
    ],
    [e("zz-1", "zz-2"), e("zz-2", "zz-3")],
  );
  assert.equal(reconcile(renamed).currentStep, 5);
  const moved = { ...stages.stored(), nodes: stages.stored().nodes.map((node, i) => ({ ...node, position: { x: i * 7000, y: -i } })) };
  assert.deepEqual(reconcile(moved).validSteps, reconcile(stages.stored()).validSteps);
});

// ---- Undo, redo, reset ----

test("undoing a required connection makes the lesson ask for it again, and keeps what happened", () => {
  const done = reconcile(stages.redundant());
  assert.equal(done.status, "completed");

  // The same components, with the connection to the cache undone.
  const withoutCacheEdge = graphOf(stages.redundant().nodes, [e("c", "s"), e("s", "d")]);
  const undone = reconcile(withoutCacheEdge, done);
  assert.equal(undone.status, "in-progress");
  assert.equal(undone.currentStep, 6);
  assert.equal(step(undone.currentStep + 1).objective.kind, "edge");
  assert.equal(undone.validSteps.includes(7), false);
  // The past is remembered separately from what holds now.
  assert.equal(undone.completedSteps.includes(7), true);
  assert.equal(undone.everCompleted, true);
});

test("undoing a component, then redoing it, restores the lesson", () => {
  const full = reconcile(stages.redundant());
  const withoutClient = graphOf(
    stages.redundant().nodes.filter((node) => node.id !== "c"),
    [e("s", "d"), e("s", "k")],
  );
  const undone = reconcile(withoutClient, full);
  assert.equal(undone.currentStep, 0);
  assert.equal(undone.status, "in-progress");
  assert.equal(undone.validSteps.includes(1), false);

  const redone = reconcile(stages.redundant(), undone);
  assert.equal(redone.status, "completed");
  assert.equal(redone.currentStep, STEPS);
});

test("undoing redundancy asks for it again", () => {
  const full = reconcile(stages.redundant());
  const single = reconcile(stages.cached(), full);
  assert.equal(single.currentStep, 7);
  assert.equal(single.validSteps.includes(8), false);
  assert.equal(single.completedSteps.includes(8), true);
});

test("deleting something does not leave the lesson claiming it exists", () => {
  const full = reconcile(stages.redundant());
  for (const removed of ["c", "s", "d", "k"]) {
    const graph = graphOf(
      stages.redundant().nodes.filter((node) => node.id !== removed),
      stages.redundant().edges.filter((edge) => edge.source !== removed && edge.target !== removed),
    );
    const session = reconcile(graph, full);
    assert.notEqual(session.status, "completed", removed);
    assert.ok(session.currentStep < STEPS, removed);
  }
});

test("reset returns the lesson to its start, forgetting history and attempts", () => {
  const used = recordAttempt(reconcile(stages.redundant()), 3);
  assert.equal(used.attempts[3], 1);
  const reset = resetLearnSession(lesson);
  assert.deepEqual(reset, createLearnSession(lesson));
  assert.equal(reset.status, "not-started");
  assert.equal(reconcile(graphOf([], []), reset), reset);
});

test("with an emptied canvas after a finished lesson, the lesson is back at the beginning", () => {
  const done = reconcile(stages.redundant());
  const cleared = reconcile(graphOf([], []), resetLearnSession(lesson));
  assert.equal(cleared.currentStep, 0);
  assert.equal(done.everCompleted, true);
  assert.equal(cleared.everCompleted, false);
});

test("a completed lesson is reported as completed", () => {
  const session = reconcile(stages.redundant());
  assert.equal(session.status, "completed");
  assert.equal(session.currentStep, STEPS);
  assert.equal(session.validSteps.length, STEPS);
  assert.equal(session.everCompleted, true);
});

// ---- Attempts ----

test("wrong attempts are counted per step and survive reconciling", () => {
  let session = createLearnSession(lesson);
  session = recordAttempt(recordAttempt(session, 3), 5);
  session = recordAttempt(session, 3);
  assert.deepEqual(session.attempts, { 3: 2, 5: 1 });
  const reconciled = reconcile(stages.server(), session);
  assert.deepEqual(reconciled.attempts, { 3: 2, 5: 1 });
  assert.equal(reconciled.status, "in-progress");
  assert.equal(createLearnSession(lesson).attempts[3], undefined);
});

// ---- Objectives ----

const check = (objective: LearnObjective, graph: ReturnType<typeof graphOf>) => validateObjective(objective, graph);

test("has component type, and how many", () => {
  const graph = graphOf([n("a", "server"), n("b", "server"), n("c", "cache")], []);
  assert.equal(check({ kind: "node", componentType: "cache" }, graph).valid, true);
  assert.equal(check({ kind: "node", componentType: "database" }, graph).reason, "component-missing");
  assert.equal(check({ kind: "node", componentType: "server", min: 2 }, graph).valid, true);
  const few = check({ kind: "node", componentType: "server", min: 3 }, graph);
  assert.equal(few.reason, "too-few-components");
  assert.equal(few.found, 2);
  assert.deepEqual(few.relevantNodeIds, ["a", "b"]);
});

test("a connection between types is checked in one direction", () => {
  const objective: LearnObjective = { kind: "edge", sourceType: "client", targetType: "server" };
  const nodes = [n("c", "client"), n("s", "server")];
  assert.deepEqual(check(objective, graphOf(nodes, [e("c", "s")])).relevantNodeIds, ["c", "s"]);
  const reversed = check(objective, graphOf(nodes, [e("s", "c")]));
  assert.equal(reversed.valid, false);
  assert.equal(reversed.reason, "reversed");
  assert.equal(check(objective, graphOf(nodes, [])).reason, "not-connected");
  assert.equal(check(objective, graphOf([n("c", "client")], [])).reason, "target-missing");
  assert.equal(check(objective, graphOf([n("s", "server")], [])).reason, "source-missing");
  const none = check(objective, graphOf([], []));
  assert.equal(none.reason, "both-missing");
  assert.deepEqual(none.missingTypes, ["client", "server"]);
});

test("a connection to a component that does not exist is ignored", () => {
  const objective: LearnObjective = { kind: "edge", sourceType: "client", targetType: "server" };
  assert.equal(check(objective, graphOf([n("c", "client"), n("s", "server")], [e("c", "ghost")])).valid, false);
});

test("a path may pass through other components", () => {
  const objective: LearnObjective = { kind: "path", sourceType: "client", targetType: "database" };
  const nodes = [n("c", "client"), n("lb", "load-balancer"), n("s", "server"), n("d", "database")];
  const through = check(objective, graphOf(nodes, [e("c", "lb"), e("lb", "s"), e("s", "d")]));
  assert.equal(through.valid, true);
  assert.deepEqual(through.relevantNodeIds, ["c", "d"]);
  assert.equal(check(objective, graphOf(nodes, [e("c", "lb"), e("s", "d")])).reason, "no-path");
  assert.equal(check(objective, graphOf(nodes, [e("d", "s"), e("s", "lb"), e("lb", "c")])).valid, false);
  assert.equal(check(objective, graphOf(nodes.slice(0, 2), [e("c", "lb")])).reason, "target-missing");
});

test("a path survives a loop in the graph", () => {
  const objective: LearnObjective = { kind: "path", sourceType: "client", targetType: "database" };
  const nodes = [n("c", "client"), n("a", "server"), n("b", "server"), n("d", "database")];
  assert.equal(check(objective, graphOf(nodes, [e("c", "a"), e("a", "b"), e("b", "a"), e("b", "d")])).valid, true);
});

test("a component is reachable only if a client's request can arrive", () => {
  const objective: LearnObjective = { kind: "reachable", componentType: "cache" };
  const nodes = [n("c", "client"), n("s", "server"), n("k", "cache")];
  assert.equal(check(objective, graphOf(nodes, [e("c", "s"), e("s", "k")])).valid, true);
  const cut = check(objective, graphOf(nodes, [e("c", "s")]));
  assert.equal(cut.reason, "not-reachable");
  assert.deepEqual(cut.relevantNodeIds, ["k"]);
  assert.equal(check(objective, graphOf(nodes.slice(0, 2), [])).reason, "component-missing");
});

test("a setting is checked against its effective value", () => {
  const atLeast: LearnObjective = { kind: "property", componentType: "server", key: "replicas", comparison: "at-least", value: 2 };
  assert.equal(check(atLeast, graphOf([n("s", "server")], [])).reason, "property-not-met");
  assert.equal(check(atLeast, graphOf([n("s", "server", { replicas: 3 })], [])).valid, true);
  assert.equal(check(atLeast, graphOf([n("s", "server", { replicas: 2 })], [])).valid, true);
  // A value the engine would not use does not count.
  assert.equal(check(atLeast, graphOf([n("s", "server", { replicas: "lots" })], [])).valid, false);
  assert.equal(check(atLeast, graphOf([n("s", "server", { replicas: 1e9 })], [])).valid, true);

  const atMost: LearnObjective = { kind: "property", componentType: "database", key: "replicas", comparison: "at-most", value: 0 };
  assert.equal(check(atMost, graphOf([n("d", "database")], [])).valid, true);
  assert.equal(check(atMost, graphOf([n("d", "database", { replicas: 1 })], [])).valid, false);

  const equals: LearnObjective = { kind: "property", componentType: "cache", key: "cacheHitRate", comparison: "equals", value: 0.7 };
  assert.equal(check(equals, graphOf([n("k", "cache")], [])).valid, true);
  assert.equal(check(equals, graphOf([n("k", "cache", { cacheHitRate: 0.9 })], [])).valid, false);

  const unsupported: LearnObjective = { kind: "property", componentType: "server", key: "cacheHitRate", comparison: "at-least", value: 0 };
  assert.equal(check(unsupported, graphOf([n("s", "server")], [])).valid, false);
  assert.equal(check(atLeast, graphOf([], [])).reason, "component-missing");
});

test("redundancy counts instances across components of a type", () => {
  const objective: LearnObjective = { kind: "redundancy", componentType: "server", minInstances: 2 };
  assert.equal(check(objective, graphOf([n("s", "server")], [])).reason, "not-redundant");
  assert.equal(check(objective, graphOf([n("s", "server", { replicas: 2 })], [])).valid, true);
  assert.equal(check(objective, graphOf([n("a", "server"), n("b", "server")], [])).valid, true);
  assert.equal(check(objective, graphOf([n("a", "server"), n("b", "server")], [])).found, 2);
  assert.equal(check({ kind: "redundancy", componentType: "database", minInstances: 2 }, graphOf([n("d", "database", { replicas: 1 })], [])).valid, true);
  assert.equal(check(objective, graphOf([], [])).reason, "component-missing");
});

test("a check says which components it is about and never throws on odd graphs", () => {
  const objective: LearnObjective = { kind: "edge", sourceType: "server", targetType: "database" };
  assert.deepEqual(check(objective, graphOf([n("s", "server"), n("d", "database")], [e("s", "d")])).relevantNodeIds, ["s", "d"]);
  for (const graph of [graphOf([], []), { nodes: [], edges: [e("a", "b")] }, graphOf([n("a", "server")], [e("a", "a")])]) {
    for (const objectiveKind of lesson.steps.map((s) => s.objective)) {
      assert.doesNotThrow(() => validateObjective(objectiveKind, graph));
    }
  }
});

test("validation does not change the graph", () => {
  const graph = deepFreeze(stages.redundant());
  const before = JSON.stringify(graph);
  checkLesson(lesson, graph);
  reconcile(graph);
  assert.equal(JSON.stringify(graph), before);
});

// ---- Hints ----

const hintFor = (stepId: number, graph: ReturnType<typeof graphOf>) => {
  const objective = step(stepId).objective;
  return getLearnHint(objective, validateObjective(objective, graph));
};

test("no hint is needed when the step is met", () => {
  assert.equal(hintFor(5, stages.stored()), null);
});

test("a missing component is named first", () => {
  assert.match(hintFor(5, stages.connected())?.text ?? "", /Add a database first/);
  assert.match(hintFor(1, graphOf([], []))?.text ?? "", /Add a client first/);
  assert.match(hintFor(3, graphOf([], []))?.text ?? "", /Add a client and a server first/);
  assert.match(hintFor(7, graphOf([n("c", "client"), n("s", "server")], [e("c", "s")]))?.text ?? "", /Add a cache first/);
});

test("when both components exist the hint is about the connection", () => {
  const hint = hintFor(5, stages.database());
  assert.equal(hint?.text.startsWith("You have both components. Connect the server to the database"), true);
  assert.deepEqual(hint?.nodeIds.sort(), ["d", "s"]);
});

test("a connection made backwards is called out", () => {
  const graph = graphOf([n("s", "server"), n("d", "database")], [e("d", "s")]);
  assert.match(hintFor(5, graph)?.text ?? "", /goes the other way/);
});

test("hints for settings, redundancy, reachability and paths are specific", () => {
  assert.match(hintFor(8, stages.cached())?.text ?? "", /at least 2 server instances/);
  assert.match(
    getLearnHint(
      { kind: "property", componentType: "server", key: "replicas", comparison: "at-least", value: 3 },
      validateObjective({ kind: "property", componentType: "server", key: "replicas", comparison: "at-least", value: 3 }, graphOf([n("s", "server")], [])),
    )?.text ?? "",
    /open Configure, and set replicas to at least 3/,
  );
  const reach: LearnObjective = { kind: "reachable", componentType: "cache" };
  assert.match(getLearnHint(reach, validateObjective(reach, graphOf([n("c", "client"), n("k", "cache")], [])))?.text ?? "", /no request reaches it/);
  const path: LearnObjective = { kind: "path", sourceType: "client", targetType: "database" };
  assert.match(getLearnHint(path, validateObjective(path, graphOf([n("c", "client"), n("d", "database")], [])))?.text ?? "", /route from the client to the database/);
  const many: LearnObjective = { kind: "node", componentType: "server", min: 3 };
  assert.match(getLearnHint(many, validateObjective(many, graphOf([n("a", "server")], [])))?.text ?? "", /You have 1\. Add 2 more servers/);
});

test("hints depend only on the design, so the same design gives the same hint", () => {
  assert.deepEqual(hintFor(5, stages.database()), hintFor(5, stages.database()));
  const renamed = graphOf([n("x", "server", undefined, "Whatever"), n("y", "database", undefined, "Other")], []);
  assert.equal(hintFor(5, renamed)?.text, hintFor(5, stages.database())?.text);
});

test("a hint appears right away when the learner is stuck on the last part, and otherwise after a wrong attempt", () => {
  const stuck = validateObjective(step(5).objective, stages.database());
  assert.equal(shouldShowHint(0, stuck), true);
  const missing = validateObjective(step(5).objective, stages.connected());
  assert.equal(shouldShowHint(0, missing), false);
  assert.equal(shouldShowHint(1, missing), true);
  const met = validateObjective(step(5).objective, stages.stored());
  assert.equal(shouldShowHint(3, met), false);
});

// ---- Connection feedback on the new steps ----

test("known mistakes on the cache step are explained, and the right connection is correct", () => {
  const nodes = [n("c", "client"), n("s", "server"), n("k", "cache"), n("d", "database")];
  const input = (source: string, target: string) => classifyLessonConnection(step(7), e(source, target), nodes);
  assert.equal(input("s", "k").result, "correct");
  assert.equal(input("k", "s").result, "incorrect");
  assert.match(input("k", "s").feedback?.title ?? "", /reversing/);
  assert.equal(input("c", "k").result, "incorrect");
  assert.equal(input("s", "d").result, "unrelated");
  assert.equal(classifyLessonConnection(step(8), e("s", "k"), nodes).result, "unrelated");
});

test("connection steps of type path also classify connections", () => {
  const pathStep = {
    objective: {
      kind: "path",
      sourceType: "client",
      targetType: "database",
      feedbackRules: [{ sourceType: "database", targetType: "client", title: "Backwards", explanation: "Other way." }],
    } as LearnObjective,
  };
  const nodes = [n("c", "client"), n("d", "database")];
  assert.equal(classifyLessonConnection(pathStep, e("c", "d"), nodes).result, "correct");
  assert.equal(classifyLessonConnection(pathStep, e("d", "c"), nodes).result, "incorrect");
});

// ---- Isolation from other modes ----

test("a lesson session shares nothing with a workspace run or a challenge submission", async () => {
  const learn = reconcile(stages.stored());
  const snapshot = JSON.stringify(learn);

  const workspace = createRunSession(evaluateDesign);
  const challenge = createChallengeSession(urlShortenerDefinition);
  await workspace.run({ projectId: "p", nodes: stages.stored().nodes as never, edges: stages.stored().edges, traffic: {} });
  await challenge.submit({ nodes: stages.stored().nodes as never, edges: stages.stored().edges });

  assert.equal(JSON.stringify(learn), snapshot);
  assert.equal(workspace.getState().status, "results");
  assert.equal(challenge.getState().status, "results");
  // Each session is its own state.
  assert.notEqual(workspace.getState(), challenge.getState());
  assert.equal(workspace.getState().current?.traffic.requestsPerSecond, 1000);
  assert.equal(challenge.getState().current?.traffic.requestsPerSecond, 11_500);

  // And the lesson is unaffected by resetting either.
  workspace.reset();
  challenge.reset();
  assert.equal(JSON.stringify(learn), snapshot);
  assert.equal(reconcile(stages.stored(), learn), learn);
});
