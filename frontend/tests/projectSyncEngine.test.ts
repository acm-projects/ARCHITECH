import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { type TestContext } from "node:test";

import { startProjectSync } from "../src/components/projects/projectSyncEngine.ts";
import { projectStore, STORAGE_KEY } from "../src/components/projects/projectStore.ts";
import { createProjectAutosave } from "../src/components/projects/projectAutosave.ts";
import { applyChanges } from "../src/lib/ai/changes.ts";
import { askArchitect, saveConversation } from "../src/lib/ai/chatClient.ts";
import { payloadToStoredProject, projectToPayload, type ProjectPayload } from "../src/lib/projects/projectPayload.ts";
import { fingerprint } from "../src/lib/projects/syncPlan.ts";

const SYNC_KEY = "architech:projects:sync";
const base: ProjectPayload = {
  id: "original-project", title: "Existing design", mode: "learn", learnSkipped: true, source: "blank",
  graph: { schemaVersion: 1, nodes: [
    { id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Client" } },
    { id: "server-1", type: "architecture", position: { x: 200, y: 0 }, data: { type: "server", label: "API", properties: { replicas: 1 } } },
  ], edges: [{ id: "client-1->server-1", source: "client-1", target: "server-1" }] },
  createdAt: "2026-10-19T10:00:00.000Z", updatedAt: "2026-10-19T10:00:00.000Z", lastOpenedAt: "2026-10-19T10:00:00.000Z",
};
const drain = async () => { for (let i = 0; i < 8; i++) await setImmediate(); };
type ServerRow = { project: ProjectPayload; revision: string };

// Match Web Locks' promise lifetime and queued-request cancellation without a browser.
function exclusiveLocks() {
  const queues = new Map<string, Promise<void>>();
  return {
    request(name: string, options: { signal: AbortSignal }, callback: () => Promise<void>) {
      const previous = queues.get(name) ?? Promise.resolve();
      let release!: () => void;
      queues.set(name, new Promise<void>(resolve => { release = resolve; }));
      return new Promise<void>((resolve, reject) => {
        let started = false;
        const abort = () => { if (!started) reject(new DOMException("Cancelled", "AbortError")); };
        options.signal.addEventListener("abort", abort, { once: true });
        void previous.then(async () => {
          if (options.signal.aborted) { release(); return; }
          started = true;
          options.signal.removeEventListener("abort", abort);
          try { await callback(); resolve(); } catch (error) { reject(error); } finally { release(); }
        });
      });
    },
  };
}

// Exercise the production sync engine and store. Only the browser, clock and HTTP
// transport are replaced, so response loss can be reproduced deterministically.
function setup(t: TestContext, options: {
  local?: ProjectPayload;
  afterList?: () => void;
  afterSave?: (project: ProjectPayload, response: Response) => Response | Promise<Response>;
  beforeSave?: (project: ProjectPayload) => Response | Promise<Response> | undefined;
  locks?: ReturnType<typeof exclusiveLocks>;
} = {}) {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); }, clear: () => data.clear(),
    key: index => [...data.keys()][index] ?? null, get length() { return data.size; },
  };
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects: [payloadToStoredProject(options.local ?? base)] }));
  storage.setItem(SYNC_KEY, JSON.stringify({ owner: "user", synced: { [base.id]: fingerprint(base) }, revisions: { [base.id]: "100" } }));
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: Object.assign(new EventTarget(), { localStorage: storage }) });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: options.locks } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  let revision = 100;
  const server = new Map<string, ServerRow>([[base.id, { project: structuredClone(base), revision: String(revision) }]]);
  const requests: { method: string; path: string; status?: number }[] = [];
  const conversations = new Map<string, unknown[]>();
  const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? "GET";
    const request: (typeof requests)[number] = { method, path }; requests.push(request);
    assert.ok(requests.length < 100, "sync must not loop indefinitely");
    if (path === "/api/projects") {
      const response = json({ projects: [...server.values()].map(row => row.project), revisions: Object.fromEntries([...server].map(([id, row]) => [id, row.revision])) });
      options.afterList?.(); return response;
    }
    if (path.endsWith("/conversation")) {
      if (method === "PUT") conversations.set(path, JSON.parse(String(init?.body)).turns);
      return json({ turns: conversations.get(path) ?? [] });
    }
    if (path === "/api/ai/chat") return new Response('{"type":"text","text":"Inspect capacity."}\n{"type":"done"}\n', { headers: { "Content-Type": "application/x-ndjson" } });
    const match = /^\/api\/projects\/([^/]+)$/.exec(path);
    assert.ok(match, `unexpected request ${method} ${path}`);
    const id = decodeURIComponent(match[1]), existing = server.get(id);
    if (method === "GET") return existing ? json(existing.project, 200, { ETag: `"${existing.revision}"` }) : json({}, 404);
    if (method === "DELETE") { server.delete(id); return new Response(null, { status: 204 }); }
    assert.equal(method, "PUT");
    const project = JSON.parse(String(init?.body)) as ProjectPayload;
    const intercepted = options.beforeSave?.(project);
    if (intercepted) return intercepted;
    const expected = new Headers(init?.headers).get("If-Match")?.replaceAll('"', "");
    if (existing && expected && expected !== existing.revision) {
      request.status = 409;
      return json({ project: existing.project, revision: existing.revision }, 409);
    }
    const next = String(++revision);
    server.set(id, { project: structuredClone(project), revision: next });
    const response = json(project, existing ? 200 : 201, { ETag: `"${next}"` });
    return options.afterSave ? await options.afterSave(project, response) : response;
  });
  const stops: (() => void)[] = [];
  const stop = () => { for (const end of stops.splice(0)) end(); };
  t.after(async () => {
    stop(); await drain();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
  return {
    server, storage, requests,
    start: async () => { const end = startProjectSync("user"); stops.push(end); await drain(); return end; }, stop,
    advance: async (ms: number) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 100) { t.mock.timers.tick(Math.min(100, ms - elapsed)); await drain(); }
    },
    edit: (replicas: number) => {
      const current = projectStore.getProject(base.id)!;
      projectStore.updateProject(base.id, { nodes: current.nodes.map(node => node.id === "server-1" ? { ...node, data: { ...node.data, properties: { replicas } } } : node) });
    },
    remote: (project: ProjectPayload) => server.set(base.id, { project: structuredClone(project), revision: String(++revision) }),
    assertSaved: () => {
      assert.equal(projectStore.listProjects().length, 1);
      const reopened = projectStore.getProject(base.id)!;
      assert.equal(reopened.id, base.id);
      assert.equal(server.size, 1);
      assert.deepEqual(server.get(base.id)!.project, projectToPayload(reopened));
    },
  };
}

test("Archie questions, conversation saves and applying suggestions keep the same project", async t => {
  const env = setup(t); await env.start();
  for (let i = 0; i < 3; i++) {
    await askArchitect({ graph: base.graph, traffic: { requestsPerSecond: 1000 }, messages: [{ role: "user", content: `Question ${i}` }], signal: new AbortController().signal, onEvent: () => {} });
    assert.equal(await saveConversation(base.id, [{ role: "user", text: `Question ${i}`, focusCount: 0 }]), true);
  }
  assert.deepEqual(projectToPayload(projectStore.getProject(base.id)!).graph, base.graph);
  const current = projectStore.getProject(base.id)!;
  const autosave = createProjectAutosave(base.id);
  autosave.update(current);
  const applied = applyChanges(current, [{ op: "add_component", ref: "new-cache", type: "cache" }]);
  assert.ok(applied.ok);
  autosave.update({ ...current, nodes: applied.nodes });
  await env.advance(1000);
  env.assertSaved();
  assert.equal(projectStore.getProject(base.id)!.nodes.length, 3);
});

test("opening another tab does not turn a normal edit into a recovery project", async t => {
  const env = setup(t); await env.start();
  env.remote({ ...base, lastOpenedAt: "2026-10-20T10:01:00.000Z" });
  env.edit(2); await env.advance(1000);
  env.assertSaved();
});

test("startup keeps its baseline when another tab opens an offline-edited project", async t => {
  const local = { ...base, title: "Offline edit", updatedAt: "2026-10-20T10:00:00.000Z" };
  const env = setup(t, { local, afterList: () => env.remote({ ...base, lastOpenedAt: "2026-10-20T10:01:00.000Z" }) });
  await env.start(); await env.advance(1000);
  env.assertSaved();
  assert.equal(projectStore.getProject(base.id)!.title, "Offline edit");
});

test("five lost-response cycles followed by newer edits never create recovery projects", async t => {
  let armed = false;
  const responses: ((error: Error) => void)[] = [];
  const env = setup(t, { afterSave: (project, response) => {
    if (armed && project.id === base.id) {
      armed = false;
      return new Promise<Response>((_, reject) => { responses.push(reject); });
    }
    return response;
  } });
  await env.start();
  for (let round = 1; round <= 5; round++) {
    armed = true;
    env.edit(round * 2); await env.advance(400);
    const rejectResponse = responses.shift();
    assert.ok(rejectResponse);
    env.edit(round * 2 + 1);
    rejectResponse(new TypeError("Response lost after server saved"));
    await drain(); await env.advance(2500);
    env.assertSaved();
  }
  assert.equal(projectStore.getProject(base.id)!.nodes[1].data.properties?.replicas, 11);
});

test("an uncertain save survives stop/reopen while newer edits and another tab are present", async t => {
  let armed = true, lists = 0;
  const env = setup(t, {
    afterList: () => {
      if (++lists === 2) env.remote({ ...env.server.get(base.id)!.project, lastOpenedAt: "2026-10-20T10:01:00.000Z" });
    },
    afterSave: (_project, response) => {
      if (armed) { armed = false; throw new TypeError("Saved, but the reply was lost"); }
      return response;
    },
  });
  await env.start(); env.edit(2); await env.advance(400);
  env.edit(3); env.stop(); await env.start(); await env.advance(1000);
  env.assertSaved();
  assert.equal(projectStore.getProject(base.id)!.nodes[1].data.properties?.replicas, 3);
});

test("a genuinely different server edit is still preserved as one recovery project", async t => {
  const env = setup(t); await env.start();
  env.remote({ ...base, title: "Other device edit" });
  env.edit(2); await env.advance(1000);
  const copies = projectStore.listProjects().filter(project => project.id !== base.id);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].title, "Other device edit (from another device)");
  assert.equal(env.server.size, 2);
  env.edit(3); await env.advance(1000);
  assert.equal(projectStore.listProjects().length, 2);
});

test("an offline request that never reached the server retries the newest local edit", async t => {
  let offline = true;
  const env = setup(t, { beforeSave: () => {
    if (offline) throw new TypeError("Connection failed before sending");
    return undefined;
  } });
  await env.start(); env.edit(2); await env.advance(400);
  env.edit(3); offline = false; await env.advance(2500);
  env.assertSaved();
  assert.equal(projectStore.getProject(base.id)!.nodes[1].data.properties?.replicas, 3);
});

test("a real remote edit after an uncertain save is preserved rather than mistaken for our save", async t => {
  let lost = false;
  const env = setup(t, { afterSave: (_project, response) => {
    if (!lost) { lost = true; throw new TypeError("Saved, but response lost"); }
    return response;
  } });
  await env.start(); env.edit(2); await env.advance(400);
  env.remote({ ...env.server.get(base.id)!.project, title: "Genuine remote change" });
  env.edit(3); await env.advance(2500);
  const copies = projectStore.listProjects().filter(project => project.id !== base.id);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].title, "Genuine remote change (from another device)");
  assert.equal(env.server.size, 2);
  assert.equal(env.server.get(base.id)!.project.graph.nodes[1].data.properties?.replicas, 3);
});

test("an invalid conflict response cannot introduce a different project into storage", async t => {
  const env = setup(t, { beforeSave: () => new Response(JSON.stringify({ project: { ...base, id: "unexpected-project" }, revision: "101" }), { status: 409 }) });
  await env.start(); env.edit(2); await env.advance(400);
  assert.equal(projectStore.listProjects().length, 1);
  assert.equal(projectStore.getProject("unexpected-project"), null);
  assert.equal(projectStore.getProject(base.id)!.nodes[1].data.properties?.replicas, 2);
  assert.equal(env.server.get(base.id)!.project.graph.nodes[1].data.properties?.replicas, 1);
});

test("a stopped sync cannot create recovery projects from an in-flight conflict", async t => {
  let finish: ((response: Response) => void) | undefined;
  const env = setup(t, { beforeSave: () => new Promise<Response>(resolve => { finish = resolve; }) });
  await env.start(); env.edit(2); await env.advance(400);
  assert.ok(finish);
  env.stop();
  const before = env.storage.getItem(STORAGE_KEY), syncBefore = env.storage.getItem(SYNC_KEY);
  finish(new Response(JSON.stringify({ project: { ...base, title: "Late conflict" }, revision: "101" }), { status: 409 }));
  await drain();
  assert.equal(env.storage.getItem(STORAGE_KEY), before);
  assert.equal(env.storage.getItem(SYNC_KEY), syncBefore);
});

test("deleting a project during an in-flight save does not recreate it", async t => {
  let finish: (() => void) | undefined;
  const env = setup(t, { afterSave: (_project, response) => new Promise<Response>(resolve => { finish = () => resolve(response); }) });
  await env.start(); env.edit(2); await env.advance(400);
  assert.ok(finish);
  projectStore.deleteProject(base.id); finish();
  await drain(); await env.advance(1000);
  assert.deepEqual(projectStore.listProjects(), []);
  assert.equal(env.server.size, 0);
});

test("overlapping tabs cannot create recovery projects from each other's ordinary saves", async t => {
  let held = 0;
  const responses: (() => void)[] = [];
  const env = setup(t, { locks: exclusiveLocks(), afterSave: (_project, response) => {
    if (held++ < 2) return new Promise<Response>(resolve => { responses.push(() => resolve(response)); });
    return response;
  } });
  await env.start(); await env.start();
  env.edit(2); await env.advance(400);
  env.edit(3); await env.advance(400);
  env.edit(4); await env.advance(400);
  // Deliver old responses after the other tab has had time to send newer edits.
  while (responses.length) { responses.shift()!(); await drain(); await env.advance(1000); }
  env.assertSaved();
  assert.equal(projectStore.getProject(base.id)!.nodes[1].data.properties?.replicas, 4);
});

test("the active writer saves edits received through another tab's storage event", async t => {
  const env = setup(t, { locks: exclusiveLocks() });
  await env.start(); await env.start();
  const edited = structuredClone(base);
  edited.graph.nodes[1].data.properties = { replicas: 5 };
  edited.updatedAt = "2026-10-20T10:00:00.000Z";
  env.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects: [payloadToStoredProject(edited)] }));
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: STORAGE_KEY });
  window.dispatchEvent(event);
  await env.advance(1000);
  env.assertSaved();
  assert.equal(env.server.get(base.id)!.project.graph.nodes[1].data.properties?.replicas, 5);
  assert.equal(env.requests.filter(request => request.path === "/api/projects").length, 1);
});

test("a waiting tab takes over only after the outgoing writer's save settles", async t => {
  let finish: (() => void) | undefined;
  let hold = true;
  const env = setup(t, { locks: exclusiveLocks(), afterSave: (_project, response) => {
    if (hold) {
      hold = false;
      return new Promise<Response>(resolve => { finish = () => resolve(response); });
    }
    return response;
  } });
  const stopWriter = await env.start(); await env.start();
  env.edit(2); await env.advance(400);
  assert.ok(finish);
  env.edit(3); stopWriter(); await drain();
  assert.equal(env.requests.filter(request => request.path === "/api/projects").length, 1);
  finish(); await drain(); await env.advance(1000);
  assert.equal(env.requests.filter(request => request.path === "/api/projects").length, 2);
  env.assertSaved();
  assert.equal(env.server.get(base.id)!.project.graph.nodes[1].data.properties?.replicas, 3);
});

test("stopping a waiting tab cancels its sync before another tab takes over", async t => {
  const env = setup(t, { locks: exclusiveLocks() });
  const stopWriter = await env.start();
  const stopWaiting = await env.start();
  await env.start();
  stopWaiting(); stopWriter(); await drain();
  assert.equal(env.requests.filter(request => request.path === "/api/projects").length, 2);
  env.edit(2); await env.advance(1000);
  env.assertSaved();
});
