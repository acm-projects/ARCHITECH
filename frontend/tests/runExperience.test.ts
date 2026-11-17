import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

const page = readFileSync(new URL("../export-templates/runnable-app/web/index.html", import.meta.url), "utf8");
type TraceStep = { node: string | null; kind?: string; text: string; ok?: boolean };
type Handler = (event: { preventDefault: () => void }) => unknown;
function element() {
  const attributes = new Map<string, string>();
  return { innerHTML: "", textContent: "", hidden: false, disabled: false, value: "0", max: 0,
    children: [], dataset: {} as Record<string, string>, files: [],
    listeners: new Map<string, Handler>(), attributes,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [],
    style: { setProperty() {} }, getBoundingClientRect: () => ({ width: 1200 }),
    querySelector: () => null, contains: () => false, scrollTo() {}, focus() {}, reset() {},
    addEventListener(name: string, fn: Handler) { this.listeners.set(name, fn); },
  };
}
const traceCode = page.slice(page.indexOf("  const ip ="), page.indexOf("  // ---- Archie:"));
const config = {
  path: [{ node: "browser", kind: "client" }, { node: "web", kind: "proxy", container: "web", label: "Web", does: "Forwards requests" }, { node: "api", kind: "server" }],
  server: { node: "api" }, auth: { mode: "none" }, addresses: {},
};
function trace(overrides: object = {}) {
  return { label: "Create item", method: "POST", path: "/api/items", status: 201, headers: new Headers(), steps: [], ...overrides };
}
function steps(request: object, settings: object = config): TraceStep[] {
  return runInNewContext(traceCode + "; stepsFor(request);", { config: settings, request, html: String });
}

test("missing trace headers never fabricate proxy or server failures", () => {
  const result = steps(trace());
  assert.deepEqual(Array.from(result, (s) => s.node), ["browser", null]);
  assert.equal(result.at(-1)!.kind, "response");
  assert.ok(result.every((s) => s.ok !== false));
});

test("recorded branches and repeated components retain their execution order", () => {
  const recorded = [{ node: "api", text: "Received" }, { node: "cache", text: "Miss" }, { node: "db", text: "Read" }, { node: "cache", text: "Saved" }];
  const result = steps(trace({ headers: new Headers({ "X-Trace-web": "10.0.0.2:3000" }), steps: recorded }));
  assert.deepEqual(Array.from(result, (s) => s.node), ["browser", "web", "api", "cache", "db", "cache", null]);
});

test("on-path authentication is shown before downstream proxy forwarding", () => {
  const settings = { ...config, auth: { mode: "on-path", node: "auth" }, path: [
    config.path[0], config.path[1], { node: "auth", kind: "auth" },
    { node: "gateway", kind: "proxy", container: "gateway" }, config.path[2],
  ] };
  const result = steps(trace({ headers: new Headers({ "X-Trace-web": "10.0.0.2:80", "X-Trace-gateway": "10.0.0.3:3000" }), steps: [
    { node: "auth", text: "Check session" }, { node: "auth-db", text: "Read session" },
    { node: "auth", text: "Let through" }, { node: "api", text: "Received" }, { node: "db", text: "Saved" },
  ] }), settings);
  assert.deepEqual(Array.from(result, (s) => s.node), ["browser", "web", "auth", "auth-db", "auth", "gateway", "api", "db", null]);
});

test("network and HTTP errors remain response failures when no component failure was recorded", () => {
  for (const status of [0, 403, 500]) {
    const result = steps(trace({ status }));
    assert.equal(result.at(-1)!.ok, false);
    assert.equal(result.at(-1)!.node, null);
    assert.equal(result.filter((s) => s.ok === false && s.node).length, 0);
  }
});

test("Archie answers component questions from the design and refuses unsupported facts", () => {
  const code = page.slice(page.indexOf("  const label ="), page.indexOf("  function say("));
  const context = { config: { labels: { cache: "Redis" }, components: [{ node: "cache", what: "Redis" }],
    design: { nodes: [{ id: "cache", label: "Redis", type: "cache" }], edges: [] }, data: { database: null } },
    inspectedNodeId: null, displayedTrace: null, html: (v: unknown) => String(v).replaceAll("<", "&lt;"), stepsFor: () => [] };
  const answer = runInNewContext(code + "; answerQuestion;", context);
  assert.match(answer("What does Redis do?"), /temporary copies/);
  assert.match(answer("What if Redis fails?"), /may fail or wait/);
  assert.match(answer("How is Redis connected?"), /No incoming connections/);
  assert.match(answer("Why did the last request fail?"), /No request has been recorded/);
  assert.match(answer("What is tomorrow's weather?"), /I can explain/);
  assert.ok(!answer("<script>alert(1)</script>").includes("<script>"));
});

function playbackHarness() {
  const elements = new Map<string, ReturnType<typeof element>>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const states = new Map<string, string>();
  const request = trace();
  const context = { $: get, document: { querySelectorAll: () => [] }, history: [request], displayedTrace: null,
    playing: 0, busy: false, waiting: [], quiet: false, pendingIntro: null, STEP_MS: 1800,
    html: String, plain: String, label: (id: string) => id, stepsFor: () => [], drawn: (id: string) => id,
    clearDiagram: () => states.clear(), setState: (id: string, state: string) => { if (id) states.set(id, state); },
    lightEdge() {}, renderTraceSummary() {}, renderNodeInspector() {}, say() {}, explain: () => "Explanation",
    requestOverview: () => "Overview",
    matchMedia: () => ({ matches: false }),
    setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
  };
  const code = page.slice(page.indexOf("  // ---- Playing a request:"), page.indexOf("  // ---- Pages:"));
  const controls = runInNewContext(code + "; ({ play, pausePlayback, resumePlayback, moveStep, resetPlayback, get: () => playback });", context);
  return { context, controls, get, states, timers, request };
}

test("pause and step cancel pending playback; replay and reset never reissue the API request", () => {
  const { controls: c, timers, states, request, get } = playbackHarness();
  const steps = [{ node: "api", text: "Received" }, { node: "db", text: "Saved" }, { node: null, kind: "response", text: "201", ok: true }];
  c.play(request, steps);
  assert.equal(c.get().index, 0);
  assert.equal(timers.size, 1);
  c.pausePlayback();
  assert.equal(timers.size, 0);
  c.moveStep(1);
  assert.equal(c.get().index, 1);
  assert.equal(states.get("api"), "done");
  assert.equal(states.get("db"), "active");
  c.moveStep(-1);
  assert.equal(c.get().index, 0);
  assert.equal(states.has("db"), false);
  c.resumePlayback();
  assert.equal(timers.size, 1);
  c.resetPlayback();
  assert.equal(timers.size, 0);
  assert.equal(c.get().index, -1);
  assert.equal(states.size, 0);
  assert.equal(get("next-step").disabled, false);
});

test("a new foreground trace replaces paused playback and cancels its timer", () => {
  const { controls: c, request, timers } = playbackHarness();
  c.play(request, [{ node: "api", text: "A" }]);
  c.pausePlayback();
  const newer = trace({ label: "Refresh" });
  c.play(newer, [{ node: "cache", text: "Hit" }]);
  assert.equal(c.get().trace, newer);
  assert.equal(c.get().index, 0);
  assert.equal(timers.size, 1);
});

test("playback completes and replays an observed worker result only after the foreground trace", () => {
  const { controls: c, request, timers, states, context } = playbackHarness();
  const tick = () => {
    const [id, fn] = timers.entries().next().value!;
    timers.delete(id);
    fn();
  };
  c.play(request, [{ node: "api", text: "Received" }, { node: null, kind: "response", text: "201" }]);
  const observed = trace({ observed: true, label: "Worker result" });
  c.play(observed, [{ node: "worker", kind: "observed", text: "Processed" }], { background: true });
  assert.equal(c.get().trace, request);
  assert.equal(context.waiting.length, 1);
  tick();
  assert.equal(states.get("api"), "done");
  tick();
  assert.equal(c.get().trace, observed);
  assert.equal(states.get("worker"), "done");
  tick();
  assert.equal(c.get().running, false);
  assert.equal(timers.size, 0);
});

test("worker observations do not replace inspection paused on the final response", () => {
  const { controls: c, request, context } = playbackHarness();
  c.play(request, [{ node: "api", text: "Received" }, { node: null, kind: "response", text: "201" }]);
  c.moveStep(1);
  const observed = trace({ observed: true, label: "Worker result" });
  c.play(observed, [{ node: "worker", kind: "observed", text: "Processed" }], { background: true });
  assert.equal(c.get().trace, request);
  assert.equal(c.get().running, false);
  assert.equal(context.waiting.length, 1);
});

// Runs the actual page script against a small DOM/transport adapter. This is a script-level
// integration check, not a browser rendering or native focus test.
async function pageHarness(failConfig = false, authentication = false) {
  const elements = new Map<string, ReturnType<typeof element>>();
  for (const [, id] of page.slice(0, page.indexOf("<script>")).matchAll(/\bid="([^"]+)"/g)) {
    elements.set(id, element());
  }
  const design = { ...config, title: "Example", labels: {}, auth: { mode: authentication ? "in-api" : "none" }, features: { auth: authentication, queue: false, search: false, files: false },
    data: { database: { node: "db", label: "Records" }, cache: null, queue: null, worker: null, storage: null, search: null },
    components: [{ node: "db", label: "Records", what: "PostgreSQL" }],
    design: { nodes: [{ id: "browser", label: "Browser", type: "client", x: 0, y: 0 }, { id: "api", label: "API", type: "server", x: 200, y: 0 }, { id: "db", label: "Records", type: "database", x: 400, y: 0 }], edges: [{ source: "browser", target: "api" }, { source: "api", target: "db" }] },
  };
  const calls: { path: string; method: string; body?: string }[] = [];
  const records: object[] = [];
  let configFails = failConfig;
  const context = {
    Headers, performance, CSS: { escape: String },
    document: { title: "", activeElement: null, querySelector: () => ({ content: "/run/example" }), getElementById: (id: string) => elements.get(id), querySelectorAll: () => [] },
    window: { addEventListener() {} }, matchMedia: () => ({ matches: true, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
      if (path.endsWith("app.config.json")) return new Response(JSON.stringify(design), { status: configFails ? 503 : 200 });
      calls.push({ path, method: options.method ?? "GET", body: options.body });
      if (path.endsWith("/api/auth/me")) return Response.json({ user: null });
      if (path.endsWith("/api/auth/signin")) return Response.json({ user: { id: 1, email: "learner@example.test" } });
      if (path.endsWith("/api/auth/signout")) return Response.json({ ok: true });
      if (options.method === "POST") {
        const item = { id: 1, ...JSON.parse(options.body ?? "{}"), status: "new" };
        records.push(item);
        return Response.json({ item }, { status: 201, headers: { "X-Trace-Steps": encodeURIComponent(JSON.stringify([{ node: "api", text: "Received request" }, { node: "db", text: "Saved item #1" }])) } });
      }
      return Response.json({ items: records });
    }, Response,
  };
  const script = page.match(/<script>([\s\S]*)<\/script>/)![1];
  runInNewContext(script, context);
  await setImmediate();
  const fire = async (id: string, event: string) => { await elements.get(id)!.listeners.get(event)!({ preventDefault() {} }); await setImmediate(); };
  return { elements: { get: (id: string) => elements.get(id)! }, context, calls, fire, recover: () => { configFails = false; } };
}

test("page startup and create/refresh connect the sample form to trace playback without feature assumptions", async () => {
  const { elements: e, calls, fire, context } = await pageHarness();
  assert.equal(context.document.title, "Test Your Architecture · Example");
  assert.equal(e.get("search").hidden, true);
  assert.equal(e.get("new-file-row").hidden, true);
  e.get("new-title").value = "Trace this";
  e.get("new-body").value = "A record";
  await fire("new", "submit");
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.match(e.get("operation-feedback").textContent, /completed.*201/);
  assert.match(e.get("steps").innerHTML, /Records/);
  assert.match(e.get("items").innerHTML, /Trace this/);
  const before = calls.length;
  await fire("play-pause", "click");
  await fire("next-step", "click");
  await fire("reset-trace", "click");
  await fire("replay", "click");
  assert.equal(calls.length, before, "playback never sends another application request");
  await fire("refresh", "click");
  assert.equal(calls.at(-1)?.method, "GET");
});

test("asking Archie validates input and answers locally without issuing an app action", async () => {
  const { elements: e, fire, calls } = await pageHarness();
  const before = calls.length;
  e.get("archie-question").value = "   ";
  await fire("archie-question-form", "submit");
  assert.equal(e.get("archie-question-error").textContent, "Enter a question.");
  e.get("archie-question").value = "What does Records do?";
  await fire("archie-question-form", "submit");
  assert.match(e.get("say").innerHTML, /Stores and retrieves application records/);
  assert.equal(e.get("bubble").hidden, false);
  assert.equal(e.get("archie-question-error").textContent, "");
  assert.equal(calls.length, before);
});

test("configuration failures are visible and retry boots the same page successfully", async () => {
  const { elements: e, fire, recover, context } = await pageHarness(true);
  assert.equal(e.get("startup-error").hidden, false);
  assert.match(e.get("startup-message").textContent, /503/);
  recover();
  await fire("retry-start", "click");
  assert.equal(e.get("startup-error").hidden, true);
  assert.equal(context.document.title, "Test Your Architecture · Example");
});

test("authentication still gates the sample app and traces sign-in and sign-out", async () => {
  const { elements: e, calls, fire } = await pageHarness(false, true);
  assert.equal(e.get("auth").hidden, false);
  assert.equal(e.get("app").hidden, true);
  e.get("email").value = "learner@example.test";
  e.get("password").value = "test-only-password";
  await fire("auth-form", "submit");
  assert.equal(e.get("auth").hidden, true);
  assert.equal(e.get("app").hidden, false);
  assert.equal(e.get("password").value, "");
  assert.equal(e.get("who").textContent, "learner@example.test");
  assert.ok(calls.some((c) => c.path.endsWith("/api/auth/signin") && c.method === "POST"));
  await fire("signout", "click");
  assert.equal(e.get("auth").hidden, false);
  assert.equal(e.get("app").hidden, true);
  assert.match(e.get("request-label").textContent, /Sign out/);
});
