import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { urlShortenerDefinition } from "../src/components/challenge/challenges.ts";
import { FREE_PLAY_BODY, FREE_PLAY_TITLE, firstWebSystemLesson } from "../src/components/learn/lessons.ts";
import {
  STORAGE_KEY,
  createProjectStore,
  diffProjectContent,
  type StorageLike,
} from "../src/components/projects/projectStore.ts";
import { createChallengeSession, challengeFingerprint } from "../src/lib/architecture/challenge/session.ts";
import { buildChallengeView } from "../src/lib/architecture/challenge/view.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { evaluateDesign } from "../src/lib/architecture/evaluation/evaluationService.ts";
import { fingerprintEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import { buildResultsView, demandVsCapacity } from "../src/lib/architecture/evaluation/resultsView.ts";
import { createRunSession } from "../src/lib/architecture/evaluation/runSession.ts";
import {
  BASELINE_REQUESTS_PER_SECOND,
  DEFAULT_TRAFFIC,
  parseRequestRate,
  stressRate,
  withRequestRate,
} from "../src/lib/architecture/evaluation/traffic.ts";
import { createGraphHistory, toSnapshot } from "../src/lib/architecture/graphHistory.ts";
import {
  createLearnSession,
  learnPhase,
  reconcileLearnSession,
  resetLearnSession,
} from "../src/lib/architecture/learn/session.ts";
import { applyReset, planReset, type ResetEffects, type ResetMode } from "../src/lib/architecture/reset.ts";
import { HOME_ROUTE, RETIRED_ROUTES, projectRoute } from "../src/lib/routes.ts";
import type { ArchitectureNodeType } from "../src/lib/architecture/types.ts";

// ---- Helpers ----

type N = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { type: ArchitectureNodeType; label: string; properties?: Record<string, string | number | boolean> };
};
const n = (
  id: string,
  type: ArchitectureNodeType,
  label: string,
  properties?: Record<string, string | number | boolean>,
  x = 0,
): N => ({
  id,
  type: "architecture",
  position: { x, y: 0 },
  data: { type, label, ...(properties ? { properties } : {}) },
});
const e = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });

const clientServerDb = () => ({
  nodes: [n("c", "client", "Client"), n("s", "server", "API Server", undefined, 100), n("d", "database", "Database", undefined, 200)],
  edges: [e("c", "s"), e("s", "d")],
});
// What the lesson builds in the end: two servers' worth of capacity behind a cache.
const lessonDesign = () => ({
  nodes: [
    n("c", "client", "Client"),
    n("s", "server", "API Server", { replicas: 2 }, 100),
    n("d", "database", "Database", undefined, 200),
    n("k", "cache", "Cache", undefined, 200),
  ],
  edges: [e("c", "s"), e("s", "d"), e("s", "k")],
});
const empty = () => ({ nodes: [] as N[], edges: [] as ReturnType<typeof e>[] });

const read = (path: string) => readFileSync(path, "utf8");

type FakeStorage = StorageLike & { data: Map<string, string> };
function fakeStorage(initial?: unknown): FakeStorage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, JSON.stringify(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}
function makeStore(storage: StorageLike = fakeStorage()) {
  let tick = 0;
  let id = 0;
  return createProjectStore({
    getStorage: () => storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    newId: () => `p${++id}`,
  });
}

// ---- 1-3. Reset ----

const effectsLog = () => {
  const log: string[] = [];
  const effects: ResetEffects = {
    replaceGraph: () => log.push("replaceGraph"),
    clearSelection: () => log.push("clearSelection"),
    clearAnalysis: () => log.push("clearAnalysis"),
    restartLesson: () => log.push("restartLesson"),
    showBrief: () => log.push("showBrief"),
  };
  return { log, effects };
};

test("reset clears the analysis in every mode, whether or not the canvas changes", () => {
  for (const mode of ["workspace", "learn", "challenge"] as ResetMode[]) {
    const built = effectsLog();
    applyReset(mode, planReset(mode, clientServerDb() as never, empty()), built.effects);
    assert.ok(built.log.includes("replaceGraph"), `${mode} replaces the graph`);
    assert.ok(built.log.includes("clearAnalysis"), `${mode} clears the analysis`);

    const untouched = effectsLog();
    applyReset(mode, planReset(mode, empty(), empty()), untouched.effects);
    assert.ok(!untouched.log.includes("replaceGraph"));
    assert.ok(untouched.log.includes("clearSelection"), `${mode} still clears the selection`);
    assert.ok(untouched.log.includes("clearAnalysis"), `${mode} clears the analysis on an empty canvas`);
  }
});

test("reset restarts the lesson only in Learn and shows the brief only in Challenge", () => {
  const learn = effectsLog();
  applyReset("learn", planReset("learn", clientServerDb() as never, empty()), learn.effects);
  assert.ok(learn.log.includes("restartLesson"));
  assert.ok(!learn.log.includes("showBrief"));

  const challenge = effectsLog();
  applyReset("challenge", planReset("challenge", clientServerDb() as never, empty()), challenge.effects);
  assert.ok(challenge.log.includes("showBrief"));
  assert.ok(!challenge.log.includes("restartLesson"));
});

test("after reset no System Review of the old design remains, and the action is Run Design again", async () => {
  const session = createRunSession(evaluateDesign);
  const design = clientServerDb();
  await session.run({ projectId: "p", nodes: design.nodes, edges: design.edges, traffic: DEFAULT_TRAFFIC });
  const fingerprint = fingerprintEvaluationInput({ graph: design, traffic: DEFAULT_TRAFFIC });

  // A second run, so a previous result exists to compare against.
  await session.run({ projectId: "p", nodes: design.nodes, edges: design.edges, traffic: DEFAULT_TRAFFIC });
  const before = buildResultsView(session.getState(), fingerprint);
  assert.equal(before.runButtonState, "ready");
  assert.ok(before.result);
  assert.ok(before.comparison);

  const { effects } = effectsLog();
  applyReset("learn", planReset("learn", design as never, empty()), {
    ...effects,
    clearAnalysis: () => session.reset(),
  });

  const emptyFingerprint = fingerprintEvaluationInput({ graph: empty(), traffic: DEFAULT_TRAFFIC });
  const after = buildResultsView(session.getState(), emptyFingerprint);
  assert.equal(after.runButtonState, "idle");
  assert.equal(after.hasResult, false);
  assert.equal(after.result, null);
  assert.equal(after.comparison, null);
  assert.equal(session.getState().previous, null);
  assert.equal(session.getState().status, "idle");
});

test("reset is one undoable history step: one undo restores the whole design, redo reapplies the reset", () => {
  const design = lessonDesign();
  const history = createGraphHistory(toSnapshot(design.nodes, design.edges));
  const designSnapshot = toSnapshot(design.nodes, design.edges);
  const starting = toSnapshot([], []);

  // The hook records the graph on screen, then the replacement, then the watcher sees nothing new.
  history.observe(toSnapshot(design.nodes, design.edges));
  assert.equal(history.commit(starting), true);
  assert.equal(history.observe(starting), false);
  assert.equal(history.undoDepth(), 1);

  assert.deepEqual(history.undo(), designSnapshot, "one undo restores nodes, edges, positions and settings");
  assert.equal(history.canUndo(), false);
  assert.deepEqual(history.redo(), starting, "redo applies the reset again");
  assert.deepEqual(history.undo(), designSnapshot);
});

test("a reset that differs from the design only by a label is still its own undo step", () => {
  const design = clientServerDb();
  const history = createGraphHistory(toSnapshot(design.nodes, design.edges));
  // Renaming a component is a coalescing edit...
  const renamed = clientServerDb();
  renamed.nodes[1].data.label = "Gateway";
  assert.equal(history.observe(toSnapshot(renamed.nodes, renamed.edges)), true);

  // ...and a reset back to the original names must not merge into it.
  assert.equal(history.commit(toSnapshot(design.nodes, design.edges)), true);
  assert.equal(history.undoDepth(), 2);
  assert.equal(history.undo()?.nodes[1].data.label, "Gateway", "undo returns to the design before the reset");
});

test("an edit after reset is its own step, and the reset step stays beneath it", () => {
  const design = clientServerDb();
  const history = createGraphHistory(toSnapshot(design.nodes, design.edges));
  history.commit(toSnapshot([], []));
  const added = { nodes: [n("c", "client", "Client")], edges: [] as ReturnType<typeof e>[] };
  history.observe(toSnapshot(added.nodes, added.edges));
  assert.equal(history.undoDepth(), 2);
  assert.deepEqual(history.undo(), toSnapshot([], []));
  assert.deepEqual(history.undo(), toSnapshot(design.nodes, design.edges));
});

// ---- 3-6. Routing ----

test("the root route is the landing and sign-in entry, and the old dashboard and workspace stay gone", () => {
  assert.equal(HOME_ROUTE, "/dashboard");
  const page = read("app/page.tsx");
  assert.match(page, /EntryFlowLoader/);
  assert.doesNotMatch(page, /redirect\(/, "/ is not an unconditional redirect");
  // The old single-page app's dashboard and workspace are not coming back.
  for (const gone of [
    "src/App.tsx",
    "app/client-app.tsx",
    "src/screens/Home.tsx",
    "src/screens/Workspace.tsx",
    "src/screens/home",
    "src/screens/workspace",
    "src/lib/projects.ts",
  ]) {
    assert.equal(existsSync(gone), false, gone);
  }
});

test("home and logo navigation target the dashboard", () => {
  for (const file of [
    "src/components/workspace/WorkspaceHeader.tsx",
    "src/components/workspace/ProjectWorkspace.tsx",
    "app/dashboard/page.tsx",
    "app/error.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /HOME_ROUTE/, `${file} uses the home route`);
    assert.doesNotMatch(source, /href="\/(?:learn|challenge|workspace)?"/, `${file} has no other home link`);
  }
});

test("the standalone workspace, learn and challenge pages are no longer part of the product", () => {
  assert.equal(existsSync("app/workspace/page.tsx"), false, "no standalone empty workspace");
  assert.equal(existsSync("app/learn"), false);
  assert.equal(existsSync("app/challenge"), false);
  assert.equal(existsSync("app/workspace/[projectId]/page.tsx"), true);
  assert.deepEqual([...RETIRED_ROUTES], ["/workspace", "/learn", "/challenge"]);
  // Old bookmarks land on the dashboard.
  const config = read("next.config.ts");
  assert.match(config, /RETIRED_ROUTES/);
  assert.match(config, /HOME_ROUTE/);
  // Nothing links to a retired page.
  for (const file of ["app/dashboard/page.tsx", "src/components/dashboard/DailyChallenge.tsx", "src/components/workspace/WorkspaceHeader.tsx"]) {
    assert.doesNotMatch(read(file), /href="\/(?:learn|challenge)"/, file);
  }
  // The workspace component can only be opened with a project.
  assert.doesNotMatch(read("src/components/workspace/ArchitectureWorkspace.tsx"), /mode = "workspace"|project\?:/);
});

test("project routes encode the id", () => {
  assert.equal(projectRoute("abc-123"), "/workspace/abc-123");
  assert.equal(projectRoute("a/b?c"), "/workspace/a%2Fb%3Fc");
});

test("a new project is a real project opened by id, on an empty canvas", () => {
  const source = read("src/components/projects/useStartProject.ts");
  assert.match(source, /projectActions\.create/);
  assert.match(source, /router\.push\(projectRoute\(result\.value\.id\)\)/);
  assert.match(source, /nodes: \[\], edges: \[\]/);
  const store = makeStore();
  const project = store.createProject({ mode: "learn", nodes: [], edges: [] });
  assert.equal(store.getProject(project.id)?.nodes.length, 0);
  assert.equal(store.listProjects().length, 1);
});

// ---- 7-9. Learn <-> Challenge inside a project ----

test("a project switches Learn -> Challenge -> Learn, and reopens in the mode it was left in", () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const project = store.createProject({ mode: "learn" });
  assert.equal(project.mode, "learn");

  assert.equal(store.setProjectMode(project.id, "challenge")?.mode, "challenge");
  assert.equal(makeStore(storage).getProject(project.id)?.mode, "challenge", "survives a reload");

  assert.equal(store.setProjectMode(project.id, "learn")?.mode, "learn");
  assert.equal(makeStore(storage).getProject(project.id)?.mode, "learn");
});

test("switching mode is not an edit and never touches the design", () => {
  const store = makeStore();
  const project = store.createProject({ mode: "learn" });
  const before = store.getProject(project.id);
  const switched = store.setProjectMode(project.id, "challenge");
  assert.equal(switched?.updatedAt, before?.updatedAt);
  assert.deepEqual(switched?.nodes, before?.nodes);
  assert.deepEqual(switched?.edges, before?.edges);
  // Setting the mode it already has changes nothing.
  assert.deepEqual(store.setProjectMode(project.id, "challenge"), switched);
});

test("an unknown mode is refused and a missing project is not found", () => {
  const store = makeStore();
  const project = store.createProject();
  assert.throws(() => store.setProjectMode(project.id, "workspace" as never));
  assert.equal(store.getProject(project.id)?.mode, "learn");
  assert.equal(store.setProjectMode("missing", "challenge"), null);
});

test("saving the design keeps the project's mode, and a duplicate keeps it too", () => {
  const store = makeStore();
  const project = store.createProject({ mode: "challenge" });
  const edited = lessonDesign();
  const saved = store.updateProject(project.id, diffProjectContent(project, { title: project.title, nodes: edited.nodes as never, edges: edited.edges }));
  assert.equal(saved?.mode, "challenge");
  assert.equal(saved?.nodes.length, 4);
  assert.equal(store.duplicateProject(project.id)?.mode, "challenge");
});

test("projects saved as workspace projects still open, as Learn projects with their design intact", () => {
  const storage = fakeStorage({
    version: 1,
    projects: [
      {
        id: "old",
        title: "Saved before modes were merged",
        mode: "workspace",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        lastOpenedAt: "2025-01-02T00:00:00.000Z",
        nodes: [
          { id: "c", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Client" } },
          { id: "s", type: "architecture", position: { x: 80, y: 0 }, data: { type: "server", label: "API Server" } },
        ],
        edges: [{ id: "c->s", source: "c", target: "s" }],
      },
    ],
  });
  const project = makeStore(storage).getProject("old");
  assert.equal(project?.mode, "learn");
  assert.equal(project?.nodes.length, 2);
  assert.equal(project?.edges.length, 1);
});

test("a mode's state does not leak into the other: each has its own session and its own load", async () => {
  const design = clientServerDb();
  const learnRuns = createRunSession(evaluateDesign);
  const challenge = createChallengeSession(urlShortenerDefinition);

  await challenge.submit({ nodes: design.nodes as never, edges: design.edges });
  assert.equal(challenge.getState().status, "results");
  assert.equal(learnRuns.getState().status, "idle", "a Challenge submission is not a Learn run");

  await learnRuns.run({ projectId: "p", nodes: design.nodes, edges: design.edges, traffic: DEFAULT_TRAFFIC });
  assert.equal(learnRuns.getState().current?.traffic.requestsPerSecond, DEFAULT_TRAFFIC.requestsPerSecond);
  assert.equal(
    challenge.getState().current?.traffic.requestsPerSecond,
    urlShortenerDefinition.traffic.requestsPerSecond,
    "Challenge is always judged at its own traffic",
  );

  // Resetting one never clears the other.
  learnRuns.reset();
  assert.equal(challenge.getState().status, "results");
});

test("Learn guidance is derived from the design and carries no challenge state", () => {
  const lesson = firstWebSystemLesson;
  const session = reconcileLearnSession(lesson, createLearnSession(lesson), clientServerDb());
  assert.deepEqual(Object.keys(session).sort(), [
    "attempts",
    "completedSteps",
    "currentStep",
    "everCompleted",
    "lessonId",
    "status",
    "validSteps",
  ]);
  const view = buildChallengeView(createRunSession(evaluateDesign).getState(), "x", urlShortenerDefinition);
  assert.equal(view.phase, "building");
  assert.equal(view.hasResult, false);
  assert.equal(view.result, null);
});

// ---- 10-11. Learn free play ----

test("completing the final step enters free play", () => {
  const lesson = firstWebSystemLesson;
  const guided = reconcileLearnSession(lesson, createLearnSession(lesson), clientServerDb());
  assert.equal(learnPhase(guided), "guided");

  const finished = reconcileLearnSession(lesson, createLearnSession(lesson), lessonDesign());
  assert.equal(finished.status, "completed");
  assert.equal(learnPhase(finished), "free-play");
  assert.equal(FREE_PLAY_TITLE, "It's your turn!");
  assert.match(FREE_PLAY_BODY, /experiment with your architecture/);
});

test("free play is not taken back when the design is changed: nodes, edges, undo", () => {
  const lesson = firstWebSystemLesson;
  let session = reconcileLearnSession(lesson, createLearnSession(lesson), lessonDesign());

  // Delete a node and its edges, rewire, or return to an empty canvas: still the learner's turn.
  const without = clientServerDb();
  session = reconcileLearnSession(lesson, session, without);
  assert.equal(learnPhase(session), "free-play");
  assert.notEqual(session.status, "completed", "the lesson itself no longer holds");
  session = reconcileLearnSession(lesson, session, empty());
  assert.equal(learnPhase(session), "free-play");
  session = reconcileLearnSession(lesson, session, lessonDesign());
  assert.equal(learnPhase(session), "free-play");
});

test("resetting the lesson leaves free play and starts the tutorial again", () => {
  const lesson = firstWebSystemLesson;
  const finished = reconcileLearnSession(lesson, createLearnSession(lesson), lessonDesign());
  const fresh = resetLearnSession(lesson);
  assert.equal(learnPhase(finished), "free-play");
  assert.equal(learnPhase(fresh), "guided");
  assert.equal(learnPhase(reconcileLearnSession(lesson, fresh, empty())), "guided");
});

test("a saved project reopens where its design is: finished designs resume in free play", () => {
  const lesson = firstWebSystemLesson;
  // The engine starts from the design on screen, not from step one.
  const reopened = reconcileLearnSession(lesson, createLearnSession(lesson), lessonDesign());
  assert.equal(reopened.currentStep, lesson.steps.length);
  assert.equal(learnPhase(reopened), "free-play");
  const half = reconcileLearnSession(lesson, createLearnSession(lesson), clientServerDb());
  assert.equal(half.currentStep, 5, "resumes at the first step the design does not meet");
  assert.equal(learnPhase(half), "guided");
});

test("Run Design works after the tutorial, and the review follows later edits", async () => {
  const session = createRunSession(evaluateDesign);
  const design = lessonDesign();
  const live = (graph: { nodes: N[]; edges: unknown[] }) =>
    fingerprintEvaluationInput({ graph, traffic: DEFAULT_TRAFFIC });

  await session.run({ projectId: "p", nodes: design.nodes, edges: design.edges, traffic: DEFAULT_TRAFFIC });
  const view = buildResultsView(session.getState(), live(design));
  assert.equal(view.runButtonState, "ready");
  assert.equal(view.result?.ready, true);
  assert.ok(Number.isFinite(view.result?.overallScore));

  // Moving a node is not a change to the architecture.
  const moved = { nodes: design.nodes.map((node) => ({ ...node, position: { x: 9, y: 9 } })), edges: design.edges };
  assert.equal(buildResultsView(session.getState(), live(moved)).isStale, false);

  // Removing the cache is.
  const edited = {
    nodes: design.nodes.filter((node) => node.id !== "k"),
    edges: design.edges.filter((edge) => edge.target !== "k"),
  };
  const stale = buildResultsView(session.getState(), live(edited));
  assert.equal(stale.isStale, true);
  assert.equal(stale.runButtonState, "stale");

  // Run again compares with the previous run.
  await session.run({ projectId: "p", nodes: edited.nodes, edges: edited.edges, traffic: DEFAULT_TRAFFIC });
  const again = buildResultsView(session.getState(), live(edited));
  assert.equal(again.runButtonState, "ready");
  assert.ok(again.comparison);
});

// ---- 12. Challenge inside a project ----

test("a challenge evaluates the project's design at the challenge's traffic, with stale detection", async () => {
  const design = clientServerDb();
  const session = createChallengeSession(urlShortenerDefinition);
  const live = (graph: { nodes: N[]; edges: unknown[] }) => challengeFingerprint(urlShortenerDefinition, graph);

  assert.equal(buildChallengeView(session.getState(), live(design), urlShortenerDefinition).phase, "building");

  await session.submit({ nodes: design.nodes as never, edges: design.edges });
  const first = buildChallengeView(session.getState(), live(design), urlShortenerDefinition);
  assert.equal(first.phase, "results");
  assert.equal(first.isStale, false);
  assert.ok(first.result && first.result.score.score >= 0 && first.result.score.score <= 100);
  assert.ok(first.result.requirementResults.length > 0);

  const edited = lessonDesign();
  assert.equal(buildChallengeView(session.getState(), live(edited), urlShortenerDefinition).isStale, true);

  await session.submit({ nodes: edited.nodes as never, edges: edited.edges });
  const second = buildChallengeView(session.getState(), live(edited), urlShortenerDefinition);
  assert.equal(second.isStale, false);
  assert.ok(second.scoreChange);

  // Reset clears the submission and keeps the challenge.
  session.reset();
  const cleared = buildChallengeView(session.getState(), live(empty()), urlShortenerDefinition);
  assert.equal(cleared.phase, "building");
  assert.equal(cleared.result, null);
});

// ---- 13. Stress test ----

test("the request rate field accepts numbers in range and refuses everything else", () => {
  assert.deepEqual(parseRequestRate("2500"), { ok: true, value: 2500 });
  assert.deepEqual(parseRequestRate(" 1,000 "), { ok: true, value: 1000 });
  assert.deepEqual(parseRequestRate("0"), { ok: true, value: 0 });
  for (const bad of ["", "   ", "abc", "-5", "1e99", "Infinity", "NaN", "10000001"]) {
    const result = parseRequestRate(bad);
    assert.equal(result.ok, false, `"${bad}" is refused`);
    if (!result.ok) assert.ok(result.message.length > 0);
  }
});

test("changing the rate changes the load and keeps everything else about it", () => {
  const traffic = { ...DEFAULT_TRAFFIC, datasetGb: 7, readRatio: 60, networkLatencyMs: 10 };
  const doubled = withRequestRate(traffic, stressRate(2));
  assert.equal(doubled.requestsPerSecond, BASELINE_REQUESTS_PER_SECOND * 2);
  assert.equal(doubled.concurrentUsers, DEFAULT_TRAFFIC.concurrentUsers * 2);
  assert.equal(doubled.datasetGb, 7);
  assert.equal(doubled.readRatio, 60);
  assert.equal(doubled.networkLatencyMs, 10);
  // Deterministic, and never outside the limits.
  assert.deepEqual(withRequestRate(traffic, stressRate(2)), doubled);
  assert.ok(Number.isFinite(withRequestRate(traffic, Number.POSITIVE_INFINITY).requestsPerSecond));
});

test("the stress test is the shared evaluation at another rate: demand against capacity changes", () => {
  const design = clientServerDb();
  const at = (multiplier: number) =>
    evaluateArchitecture({ graph: design as never, traffic: withRequestRate(DEFAULT_TRAFFIC, stressRate(multiplier)) });

  const normal = at(1);
  const heavy = at(1000);
  assert.equal(normal.metrics.requestedRps, BASELINE_REQUESTS_PER_SECOND);
  assert.equal(heavy.metrics.requestedRps, BASELINE_REQUESTS_PER_SECOND * 1000);
  assert.equal(demandVsCapacity(normal.metrics).state, "within");
  assert.equal(demandVsCapacity(heavy.metrics).state, "exceeds");
  assert.ok(heavy.metrics.effectiveRps < heavy.metrics.requestedRps, "overload is dropped, not served");
  assert.ok(heavy.bottlenecks.length > 0, "something saturates");
  assert.notEqual(heavy.health.status, "healthy");
  assert.ok(heavy.metrics.availability < normal.metrics.availability);
  assert.ok(heavy.overallScore <= normal.overallScore);
  assert.deepEqual(at(1000), heavy, "same graph and rate, same result");
});

test("a result at one rate is out of date at another, and current again when the rate returns", async () => {
  const design = clientServerDb();
  const session = createRunSession(evaluateDesign);
  const fast = withRequestRate(DEFAULT_TRAFFIC, stressRate(10));
  await session.run({ projectId: "p", nodes: design.nodes, edges: design.edges, traffic: fast });

  const fingerprintAt = (traffic: typeof fast) => fingerprintEvaluationInput({ graph: design, traffic });
  assert.equal(buildResultsView(session.getState(), fingerprintAt(fast)).isStale, false);
  assert.equal(buildResultsView(session.getState(), fingerprintAt(DEFAULT_TRAFFIC)).isStale, true);
  assert.equal(buildResultsView(session.getState(), fingerprintAt(fast)).isStale, false);
  assert.equal(session.getState().current?.traffic.requestsPerSecond, fast.requestsPerSecond);
});

test("the load is session state: it is not part of the graph history, and not saved with the project", () => {
  const design = clientServerDb();
  const history = createGraphHistory(toSnapshot(design.nodes, design.edges));
  // Nothing about traffic is in what history remembers.
  assert.doesNotMatch(JSON.stringify(toSnapshot(design.nodes, design.edges)), /requestsPerSecond/);
  assert.equal(history.undoDepth(), 0);
  const store = makeStore();
  const project = store.createProject();
  assert.doesNotMatch(JSON.stringify(store.getProject(project.id)), /requestsPerSecond|traffic/i);
  // The workspace wires the stress test to the run session only.
  const hook = read("src/components/workspace/useRunSession.ts");
  assert.match(hook, /runAtRate/);
  assert.match(hook, /setRequestRate/);
});

test("Stress test is reachable in Learn free play, next to the system review", () => {
  const workspace = read("src/components/workspace/ArchitectureWorkspace.tsx");
  assert.match(workspace, /<StressTestPanel/);
  assert.match(workspace, /learn\.freePlay &&/);
  assert.match(workspace, /onRunAtRate=\{learn\.runs\.runAtRate\}/);
});

// ---- 11. Cycle finding ----

test("a request path that loops back is reported, and still evaluates", () => {
  const graph = {
    nodes: [n("c", "client", "Client"), n("s", "server", "API Server"), n("d", "database", "Database")],
    edges: [e("c", "s"), e("s", "d"), e("d", "s")],
  };
  const result = evaluateArchitecture({ graph: graph as never, traffic: DEFAULT_TRAFFIC });
  const finding = result.findings.find((f) => f.id.startsWith("request-cycle-"));
  assert.ok(finding, "a cycle finding exists");
  assert.equal(finding.title, "Request path contains a cycle: API Server -> Database -> API Server.");
  assert.deepEqual([...finding.nodeIds].sort(), ["d", "s"]);
  assert.equal(result.ready, true);
  assert.deepEqual(evaluateArchitecture({ graph: graph as never, traffic: DEFAULT_TRAFFIC }), result);

  const acyclic = evaluateArchitecture({ graph: clientServerDb() as never, traffic: DEFAULT_TRAFFIC });
  assert.equal(acyclic.findings.some((f) => f.id.startsWith("request-cycle-")), false);
});

test("a self-loop and a cycle that never reaches a client are handled", () => {
  // A component connected to itself is dropped when the graph is read, so it is not a cycle.
  const selfLoop = {
    nodes: [n("c", "client", "Client"), n("s", "server", "API Server")],
    edges: [e("c", "s"), e("s", "s")],
  };
  const result = evaluateArchitecture({ graph: selfLoop as never, traffic: DEFAULT_TRAFFIC });
  assert.equal(result.ready, true);
  assert.equal(result.findings.some((f) => f.id.startsWith("request-cycle-")), false);

  const detached = {
    nodes: [n("c", "client", "Client"), n("s", "server", "API Server"), n("a", "server", "A"), n("b", "server", "B")],
    edges: [e("c", "s"), e("a", "b"), e("b", "a")],
  };
  const quiet = evaluateArchitecture({ graph: detached as never, traffic: DEFAULT_TRAFFIC });
  assert.equal(quiet.findings.some((f) => f.id.startsWith("request-cycle-")), false, "only paths a request takes");
});
