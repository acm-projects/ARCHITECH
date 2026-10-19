import assert from "node:assert/strict";
import test from "node:test";

import { overallStatus, timed } from "../src/lib/server/health.ts";
import { formatLogLine, requestIdOf, serverError } from "../src/lib/server/log.ts";

test("log lines are JSON in production and readable in development", () => {
  const error = new Error("boom");
  const json = JSON.parse(formatLogLine("error", "Saving failed.", error, { requestId: "r1", path: "/api/x" }, true, new Date("2026-10-19T12:00:00Z")));
  assert.equal(json.level, "error");
  assert.equal(json.time, "2026-10-19T12:00:00.000Z");
  assert.equal(json.event, "Saving failed.");
  assert.equal(json.requestId, "r1");
  assert.equal(json.error.message, "boom");
  assert.match(json.error.stack, /boom/);
  const text = formatLogLine("error", "Saving failed.", error, { requestId: "r1" }, false);
  assert.match(text, /^\[error\] Saving failed\. \(requestId=r1\)\nError: boom/);
  assert.equal(formatLogLine("info", "Started.", undefined, {}, false), "[info] Started.");
});

test("a request keeps one id; a host-given id is used when it is safe", () => {
  const plain = new Request("http://x/api/projects");
  assert.equal(requestIdOf(plain), requestIdOf(plain));
  assert.match(requestIdOf(plain), /^[0-9a-f-]{36}$/);
  assert.equal(requestIdOf(new Request("http://x", { headers: { "X-Request-Id": "req-abc.123" } })), "req-abc.123");
  assert.notEqual(requestIdOf(new Request("http://x", { headers: { "X-Request-Id": "bad id <script>" } })), "bad id <script>");
});

test("a 500 answer carries the request id in the body and header", async () => {
  const original = console.error;
  const logged: string[] = [];
  console.error = (line: string) => void logged.push(line);
  try {
    const request = new Request("http://x/api/projects/1", { method: "PUT", headers: { "X-Request-Id": "req-9" } });
    const response = serverError(request, "Failed to save project.", new Error("db down"), "Unable to save the project.");
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-request-id"), "req-9");
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { error: "Unable to save the project.", requestId: "req-9" });
    assert.match(logged[0], /Failed to save project\..*requestId=req-9.*method=PUT.*path=\/api\/projects\/1/s);
    assert.ok(!body.includes("db down"), "internal details stay in the log");
  } finally {
    console.error = original;
  }
});

test("health: down without a database, degraded without migrations or AI, otherwise ok", async () => {
  const ok = await timed(async () => "fine");
  assert.equal(ok.ok, true);
  const failed = await timed(async () => {
    throw new Error("connection refused");
  });
  assert.deepEqual({ ok: failed.ok, error: failed.ok ? "" : failed.error }, { ok: false, error: "connection refused" });
  const slow = await timed(() => new Promise(() => undefined), 20);
  assert.match(slow.ok ? "" : slow.error, /timed out after 20 ms/);

  const ai = { configured: true, provider: "groq" as const };
  assert.equal(overallStatus({ database: ok, migrations: ok, ai }), "ok");
  assert.equal(overallStatus({ database: failed, migrations: ok, ai }), "down");
  assert.equal(overallStatus({ database: ok, migrations: failed, ai }), "degraded");
  assert.equal(overallStatus({ database: ok, migrations: ok, ai: { configured: false, provider: null } }), "degraded");
});
