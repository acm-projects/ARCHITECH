import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";

import { encode } from "next-auth/jwt";
import pg from "pg";

import { STACK_FILES, candidateFolders, folderPaths } from "../../src/lib/github/repoFiles.ts";
import { applyChanges } from "../../src/lib/ai/changes.ts";

// Integration tests: the real API routes, running in a real Next.js server, against a real
// PostgreSQL test database and a fake GitHub. See tests/integration/README.md.
//
//   TEST_DATABASE_URL="postgresql://<you>@localhost:5432/architech_test" npm run test:integration
//
// The test database is WIPED and rebuilt from prisma/migrations on every run, so it must be a
// separate database whose name contains "test".

const DB_URL = process.env.TEST_DATABASE_URL;
const FRONTEND = path.resolve(import.meta.dirname, "../..");
const SECRET = "integration-test-secret";

if (!DB_URL) {
  test("API integration tests", { skip: "Set TEST_DATABASE_URL to a separate test database to run them." }, () => {});
} else {
  if (!/test/i.test(new URL(DB_URL).pathname)) {
    throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test': it is wiped on every run.");
  }
  defineTests(DB_URL);
}

function defineTests(dbUrl: string) {
  const db = new pg.Client({ connectionString: dbUrl });
  let server: ChildProcess | undefined;
  let github: http.Server | undefined;
  let base = "";
  const githubCalls: string[] = [];

  // ---- A fake GitHub ----
  const REPOS: Record<string, { entries: { name: string; type: string }[]; files: Record<string, string> }> = {
    "tester/shop": {
      entries: [{ name: "backend", type: "tree" }],
      files: {
        "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n  tracing:\n    image: openzipkin/zipkin:3\n",
        "backend/package.json": JSON.stringify({ dependencies: { express: "4", ioredis: "5" } }),
      },
    },
    "tester/notes": { entries: [], files: { "README.md": "# notes" } },
  };
  const VALID_TOKENS = new Set(["good-token", "fresh-token"]);
  let modelCalls = 0;
  let groqCalls = 0;
  // A fake Groq for technology lookups: one call classifies every technology it is given.
  function fakeGroq(raw: string, response: http.ServerResponse) {
    groqCalls += 1;
    const body = JSON.parse(raw);
    const prompt = String(body.messages?.at(-1)?.content ?? "");
    const results = /\bSnuba\b/.test(prompt) ? [{ technology: "Snuba", actsAs: "server", similarTo: "python-django", summary: "Sentry's query service." }] : [];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify({ results }) } }] }));
  }
  // A fake Wikipedia.
  function fakeWikipedia(url: string, response: http.ServerResponse) {
    response.writeHead(200, { "Content-Type": "application/json" });
    if (url.startsWith("/w/api.php")) {
      const query = decodeURIComponent(/srsearch=([^&]+)/.exec(url)?.[1] ?? "").replace(" software", "");
      response.end(JSON.stringify({ query: { search: [{ title: query }] } }));
    } else {
      const title = decodeURIComponent(url.split("/summary/")[1] ?? "");
      response.end(JSON.stringify({ type: "standard", extract: `${title} is software.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } } }));
    }
  }
  let lastSystemPrompt = "";
  let latestMigration = "";
  // A fake Claude: Anthropic's streaming Messages API (server-sent events). Asked about a
  // cache, it answers and proposes adding one; otherwise it only answers.
  function fakeClaude(raw: string, response: http.ServerResponse) {
    modelCalls += 1;
    const body = JSON.parse(raw);
    lastSystemPrompt = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
    const question = String(body.messages.at(-1)?.content ?? "");
    if (/provider busy/i.test(question)) {
      response.writeHead(429, { "Content-Type": "application/json", "retry-after": "7", "retry-after-ms": "5" });
      response.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Rate limited" } }));
      return;
    }
    if (/provider down/i.test(question)) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Broken" } }));
      return;
    }
    const events: unknown[] = [
      { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Your server " } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "is the bottleneck." } },
      { type: "content_block_stop", index: 0 },
    ];
    if (/cache/i.test(question)) {
      const input = JSON.stringify({
        title: "Add a Redis cache",
        reason: "Takes reads off the database.",
        changes: [
          { op: "add_component", ref: "new-cache", type: "cache", implementation: "redis" },
          { op: "connect", from: "server-1", to: "new-cache" },
        ],
      });
      events.push(
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "propose_changes", input: {} } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: input.slice(0, 40) } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: input.slice(40) } },
        { type: "content_block_stop", index: 1 },
      );
    }
    events.push(
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } },
      { type: "message_stop" },
    );
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const event of events) response.write(`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end();
  }
  function fakeGitHub(request: http.IncomingMessage, response: http.ServerResponse) {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      githubCalls.push(`${request.method} ${request.url}`);
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (request.url === "/v1/messages") return fakeClaude(raw, response);
      if (request.url === "/chat/completions") return fakeGroq(raw, response);
      if (request.url?.startsWith("/w/api.php") || request.url?.startsWith("/api/rest_v1/page/summary/")) return fakeWikipedia(request.url, response);
      if (request.url === "/login/oauth/access_token") {
        const body = JSON.parse(raw);
        return body.refresh_token === "refresh-1"
          ? send(200, { access_token: "fresh-token", expires_in: 28_800, refresh_token: "refresh-2", token_type: "bearer", scope: "repo" })
          : send(200, { error: "bad_refresh_token" });
      }
      const token = (request.headers.authorization ?? "").replace("Bearer ", "");
      if (!VALID_TOKENS.has(token)) return send(401, { message: "Bad credentials" });
      if (request.url?.startsWith("/user/repos")) return send(200, [{ full_name: "tester/shop" }, { full_name: "tester/notes" }]);
      if (request.url === "/graphql") {
        const { query, variables } = JSON.parse(raw);
        const repo = REPOS[`${variables.owner}/${variables.name}`];
        if (!repo) return send(200, { data: { repository: null }, errors: [{ type: "NOT_FOUND" }] });
        const blob = (file: string) => (file in repo.files ? { text: repo.files[file], byteSize: repo.files[file].length, isBinary: false } : null);
        const isRoot = query.includes("RepoRoot");
        const paths = isRoot ? [...STACK_FILES] : folderPaths(candidateFolders(repo.entries));
        const aliases = Object.fromEntries(paths.map((file, index) => [`f${index}`, blob(file)]));
        return send(200, {
          data: { repository: isRoot ? { nameWithOwner: `${variables.owner}/${variables.name}`, description: null, root: { entries: repo.entries }, ...aliases } : aliases },
        });
      }
      send(404, {});
    });
  }

  // ---- Helpers ----
  // Each call comes from its own address unless a test names one, so the sign-up and sign-in
  // limits (per IP) only apply where a test means them to.
  const randomIp = () => `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
  const call = async (method: string, route: string, options: { cookie?: string; body?: unknown; ip?: string } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        "X-Forwarded-For": options.ip ?? randomIp(),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.cookie ? { Cookie: `next-auth.session-token=${options.cookie}` } : {}),
      },
      body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
      redirect: "manual",
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    // `never` so each test can read the body as the shape it expects.
    return { status: response.status, json: json as never };
  };
  const register = async (name: string) => {
    const email = `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 8)}@example.com`;
    const created = await call("POST", "/api/auth/register", { body: { name, email, password: "secret123" } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const { rows } = await db.query("select id from users where email = $1", [email]);
    const id = rows[0].id as string;
    return { id, email, cookie: await encode({ secret: SECRET, token: { sub: id, name, email } }) };
  };
  const linkGitHub = (userId: string, tokens: { access: string; refresh?: string; expiresAt?: number | null }) =>
    db.query(
      `insert into accounts (id, user_id, type, provider, provider_account_id, access_token, refresh_token, expires_at)
       values ($1, $2, 'oauth', 'github', $3, $4, $5, $6)`,
      [randomUUID(), userId, randomUUID(), tokens.access, tokens.refresh ?? null, tokens.expiresAt ?? null],
    );
  const now = new Date().toISOString();
  const projectBody = (title: string, extra: Record<string, unknown> = {}) => ({
    title,
    mode: "learn",
    learnSkipped: false,
    graph: {
      schemaVersion: 1,
      nodes: [
        { id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client" as const, label: "Users" } },
        { id: "server-1", type: "architecture", position: { x: 240, y: 0 }, data: { type: "server" as const, label: "API", properties: { replicas: 2 } } },
      ],
      edges: [{ id: "client-1->server-1", source: "client-1", target: "server-1" }],
      ...extra,
    },
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  });

  // ---- Setup: a fresh database, a fake GitHub, and the app ----
  before(async () => {
    await db.connect();
    await db.query("drop schema public cascade; create schema public;");
    const migrations = readdirSync(path.join(FRONTEND, "prisma/migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    // Recorded the way `prisma migrate` does, so /api/health sees a migrated database.
    await db.query(`create table "_prisma_migrations" (
      id varchar(36) primary key, checksum varchar(64) not null, finished_at timestamptz,
      migration_name varchar(255) not null, logs text, rolled_back_at timestamptz,
      started_at timestamptz not null default now(), applied_steps_count integer not null default 0)`);
    for (const migration of migrations) {
      await db.query(readFileSync(path.join(FRONTEND, "prisma/migrations", migration, "migration.sql"), "utf8"));
      await db.query(
        `insert into "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) values ($1, 'test', now(), $2, 1)`,
        [randomUUID(), migration],
      );
    }
    latestMigration = migrations.at(-1)!;
    await run(["node", "--experimental-strip-types", "prisma/seed.ts"], { DATABASE_URL: dbUrl });

    github = http.createServer(fakeGitHub);
    await new Promise<void>((resolve) => github!.listen(0, "127.0.0.1", resolve));
    const githubUrl = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

    const port = 4100 + Math.floor(Math.random() * 800);
    base = `http://localhost:${port}`;
    // Launch Next through Node so the runner also works without Unix's npx executable.
    server = spawn(process.execPath, [path.join(FRONTEND, "node_modules/next/dist/bin/next"), "dev", "-p", String(port), ...(process.env.INTEGRATION_NEXT_FLAGS?.split(" ").filter(Boolean) ?? [])], {
      cwd: FRONTEND,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        NEXTAUTH_SECRET: SECRET,
        NEXTAUTH_URL: base,
        GITHUB_API_URL: githubUrl,
        GITHUB_OAUTH_URL: githubUrl,
        GITHUB_ID: "test-client",
        GITHUB_SECRET: "test-secret",
        NEXT_DIST_DIR: ".next-integration",
        NEXT_TELEMETRY_DISABLED: "1",
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_BASE_URL: githubUrl,
        ANTHROPIC_MODEL: "claude-test",
        // Always the fake Claude, whatever provider the developer's .env picks.
        AI_PROVIDER: "anthropic",
        // Groq is used only for web research here, and it is the fake.
        GROQ_API_KEY: "test-groq",
        GROQ_BASE_URL: githubUrl,
        RESEARCH_WIKIPEDIA_URL: githubUrl,
        GROQ_RESEARCH_SEARCH: "",
        AI_LIMIT_PER_MINUTE: "3",
        AI_LIMIT_PER_DAY: "50",
      },
    });
    let log = "";
    server.stdout?.on("data", (chunk) => (log += chunk));
    server.stderr?.on("data", (chunk) => (log += chunk));
    const started = Date.now();
    for (;;) {
      try {
        await fetch(`${base}/api/projects`);
        break;
      } catch {
        if (Date.now() - started > 120_000) throw new Error(`The app did not start:\n${log.slice(-2_000)}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }, { timeout: 240_000 });

  after(async () => {
    if (server?.pid) {
      try {
        // Windows has no Unix process groups; stop only this test server's tree.
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        } else {
          process.kill(-server.pid, "SIGTERM");
        }
      } catch {
        // already gone
      }
    }
    await new Promise<void>((resolve) => (github ? github.close(() => resolve()) : resolve()));
    await db.end();
  });

  const T = { timeout: 120_000 };

  // ---- Registration and profile ----

  test("registration validates input and rejects a repeated email", T, async () => {
    const email = `dup-${randomUUID().slice(0, 8)}@example.com`;
    assert.equal((await call("POST", "/api/auth/register", { body: { name: "Ann", email, password: "secret123" } })).status, 201);
    assert.equal((await call("POST", "/api/auth/register", { body: { name: "Ann", email, password: "secret123" } })).status, 400);
    assert.equal((await call("POST", "/api/auth/register", { body: { name: "A", email: "x@example.com", password: "secret123" } })).status, 400);
    assert.equal((await call("POST", "/api/auth/register", { body: { name: "Ann", email: "not an email", password: "secret123" } })).status, 400);
    assert.equal((await call("POST", "/api/auth/register", { body: { name: "Ann", email: "y@example.com", password: "123" } })).status, 400);
    assert.equal((await call("POST", "/api/auth/register", { body: "nope" })).status, 400);
    const { rows } = await db.query('select "passwordHash" from users where email = $1', [email]);
    assert.ok(rows[0].passwordHash && rows[0].passwordHash !== "secret123", "only a hash is stored");
  });

  test("the profile's experience level can be saved, and only valid levels", T, async () => {
    const user = await register("Bea");
    assert.equal((await call("PATCH", "/api/users/me", { body: { experienceLevel: "Beginner" } })).status, 401);
    assert.equal((await call("PATCH", "/api/users/me", { cookie: user.cookie, body: { experienceLevel: "Expert" } })).status, 400);
    assert.equal((await call("PATCH", "/api/users/me", { cookie: user.cookie, body: { experienceLevel: "Advanced" } })).status, 200);
    const { rows } = await db.query('select "experienceLevel" from users where id = $1', [user.id]);
    assert.equal(rows[0].experienceLevel, "Advanced");
  });

  // Signs in through NextAuth's credentials flow; returns the error message, or null on success.
  const signInWithPassword = async (email: string, password: string, ip: string): Promise<string | null> => {
    const csrf = await fetch(`${base}/api/auth/csrf`, { headers: { "X-Forwarded-For": ip } });
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const cookies = csrf.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
    const response = await fetch(`${base}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies, "X-Forwarded-For": ip },
      body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
      redirect: "manual",
    });
    const location = response.headers.get("location") ?? ((await response.json().catch(() => ({}))) as { url?: string }).url ?? "";
    const error = new URL(location, base).searchParams.get("error");
    return error;
  };

  test("too many sign-ups from one network are refused", T, async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < 5; i += 1) {
      const created = await call("POST", "/api/auth/register", { ip, body: { name: "Net", email: `net-${i}-${randomUUID().slice(0, 6)}@example.com`, password: "secret123" } });
      assert.equal(created.status, 201);
    }
    const refused = await call("POST", "/api/auth/register", { ip, body: { name: "Net", email: `net-x-${randomUUID().slice(0, 6)}@example.com`, password: "secret123" } });
    assert.equal(refused.status, 429);
    assert.match((refused.json as { error: string }).error, /Too many accounts .* Try again in \d+ minutes?/);
    const elsewhere = await call("POST", "/api/auth/register", { body: { name: "Net", email: `net-y-${randomUUID().slice(0, 6)}@example.com`, password: "secret123" } });
    assert.equal(elsewhere.status, 201, "other networks are not affected");
    const { rows } = await db.query("select key_hash from auth_attempts where kind = 'signup-ip' limit 1");
    assert.match(rows[0].key_hash, /^[0-9a-f]{64}$/, "addresses are stored only as hashes");
  });

  test("an account is locked after 5 failed sign-ins, and a success resets the count", T, async () => {
    const user = await register("Lock");
    assert.equal(await signInWithPassword(user.email, "secret123", "198.51.100.1"), null, "the right password works");
    for (let i = 0; i < 4; i += 1) assert.equal(await signInWithPassword(user.email, "wrong", "198.51.100.2"), "Invalid email or password");
    assert.equal(await signInWithPassword(user.email, "secret123", "198.51.100.2"), null, "4 failures: still allowed, and it resets");
    for (let i = 0; i < 5; i += 1) assert.equal(await signInWithPassword(user.email, "wrong", "198.51.100.3"), "Invalid email or password");
    const locked = await signInWithPassword(user.email, "secret123", "198.51.100.4");
    assert.match(locked ?? "", /Too many failed sign-in attempts for this account\. Try again in \d+ minutes?/, "even the right password waits");
  });

  // ---- Operations ----

  test("the health check reports the database, migrations and AI, without secrets", T, async () => {
    const health = await call("GET", "/api/health");
    assert.equal(health.status, 200);
    const report = health.json as {
      status: string;
      version: string;
      checks: { database: { ok: boolean; latencyMs: number }; migrations: { ok: boolean; detail: string }; ai: { configured: boolean; provider: string } };
    };
    assert.equal(report.status, "ok");
    assert.equal(report.checks.database.ok, true);
    assert.equal(report.checks.migrations.detail, `latest: ${latestMigration}`);
    assert.deepEqual(report.checks.ai, { configured: true, provider: "anthropic" });
    const text = JSON.stringify(report);
    for (const secret of ["test-key", "postgres://", "postgresql://", SECRET]) assert.ok(!text.includes(secret), `no ${secret}`);
  });

  // ---- Challenges ----

  const strongDesign = {
    schemaVersion: 1,
    nodes: [
      { id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Users" } },
      { id: "lb-1", type: "architecture", position: { x: 1, y: 0 }, data: { type: "load-balancer", label: "LB", properties: { replicas: 2 } } },
      { id: "s-1", type: "architecture", position: { x: 2, y: 0 }, data: { type: "server", label: "API", properties: { replicas: 8 } } },
      { id: "c-1", type: "architecture", position: { x: 3, y: 0 }, data: { type: "cache", label: "Cache", properties: { replicas: 2 } } },
      { id: "db-1", type: "architecture", position: { x: 4, y: 0 }, data: { type: "database", label: "DB", properties: { replicas: 2 } } },
    ],
    edges: [
      { id: "e1", source: "client-1", target: "lb-1" },
      { id: "e2", source: "lb-1", target: "s-1" },
      { id: "e3", source: "s-1", target: "c-1" },
      { id: "e4", source: "c-1", target: "db-1" },
    ],
  };
  const weakDesign = { schemaVersion: 1, nodes: strongDesign.nodes.slice(0, 3).map((n) => ({ ...n, data: { ...n.data, properties: undefined } })), edges: strongDesign.edges.slice(0, 2) };

  test("challenge submissions are graded on the server and ranked on a leaderboard", T, async () => {
    const ada = await register("Ada Lovelace");
    const bo = await register("Bo Strong");
    const url = "/api/challenges/url-shortener";
    assert.equal((await call("POST", `${url}/submissions`, { body: { graph: strongDesign } })).status, 401);
    assert.equal((await call("POST", "/api/challenges/nope/submissions", { cookie: ada.cookie, body: { graph: strongDesign } })).status, 404);
    assert.equal((await call("POST", `${url}/submissions`, { cookie: ada.cookie, body: { graph: { nodes: "x" } } })).status, 400);

    // A score sent by the browser is ignored: the server grades the design itself.
    const weak = await call("POST", `${url}/submissions`, { cookie: ada.cookie, body: { graph: weakDesign, score: 100, passed: true } });
    assert.equal(weak.status, 400, "unknown fields are refused");
    const adaWeak = await call("POST", `${url}/submissions`, { cookie: ada.cookie, body: { graph: weakDesign } });
    assert.equal(adaWeak.status, 201, JSON.stringify(adaWeak.json));
    const boStrong = await call("POST", `${url}/submissions`, { cookie: bo.cookie, body: { graph: strongDesign } });
    const boResult = boStrong.json as { submission: { score: number }; rank: number };
    const adaResult = adaWeak.json as { submission: { score: number; passed: boolean } };
    assert.ok(boResult.submission.score > adaResult.submission.score, "a better design scores higher");
    assert.equal(boResult.rank, 1);

    const board = await call("GET", `${url}/leaderboard`, { cookie: ada.cookie });
    const top = (board.json as { top: { rank: number; name: string; score: number; you: boolean }[]; me: { rank: number } }).top;
    const names = top.map((e) => e.name);
    assert.ok(names.includes("Bo S.") && names.includes("Ada L."), names.join());
    assert.ok(!JSON.stringify(board.json).includes("@example.com"), "no emails");
    assert.ok(top.findIndex((e) => e.name === "Bo S.") < top.findIndex((e) => e.name === "Ada L."));
    assert.ok(top.find((e) => e.name === "Ada L.")!.you);

    // Ada improves: her best counts, not her latest.
    await call("POST", `${url}/submissions`, { cookie: ada.cookie, body: { graph: strongDesign } });
    await call("POST", `${url}/submissions`, { cookie: ada.cookie, body: { graph: weakDesign } });
    const mine = await call("GET", `${url}/submissions`, { cookie: ada.cookie });
    assert.equal((mine.json as { submissions: unknown[] }).submissions.length, 3);
    const after = (await call("GET", `${url}/leaderboard`, { cookie: ada.cookie })).json as { me: { score: number } };
    assert.equal(after.me.score, boResult.submission.score, "the best submission counts");
  });

  // ---- Projects ----

  test("projects need a signed-in user", T, async () => {
    assert.equal((await call("GET", "/api/projects")).status, 401);
    assert.equal((await call("PUT", `/api/projects/${randomUUID()}`, { body: projectBody("x") })).status, 401);
    assert.equal((await call("DELETE", `/api/projects/${randomUUID()}`)).status, 401);
  });

  test("a project is created, replaced, listed, read and deleted", T, async () => {
    const user = await register("Cal");
    const id = randomUUID();
    assert.deepEqual((await call("GET", "/api/projects", { cookie: user.cookie })).json, { projects: [], revisions: {} });

    const created = await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: projectBody("Shop") });
    assert.equal(created.status, 201);
    assert.equal((created.json as Record<string, unknown>).title, "Shop");

    const replaced = await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: projectBody("Shop v2") });
    assert.equal(replaced.status, 200);

    const listed = await call("GET", "/api/projects", { cookie: user.cookie });
    const projects = (listed.json as { projects: { id: string; title: string; graph: { nodes: unknown[] } }[] }).projects;
    assert.deepEqual(projects.map((project) => [project.id, project.title]), [[id, "Shop v2"]]);
    assert.equal(projects[0].graph.nodes.length, 2);

    const read = await call("GET", `/api/projects/${id}`, { cookie: user.cookie });
    assert.equal(read.status, 200);
    assert.deepEqual((read.json as { graph: unknown }).graph, projectBody("Shop v2").graph);

    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: user.cookie })).status, 204);
    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: user.cookie })).status, 404);
    assert.equal((await call("GET", `/api/projects/${id}`, { cookie: user.cookie })).status, 404);
  });

  test("a project's AI conversation is saved, restored, cleared, private, and deleted with it", T, async () => {
    const user = await register("Chat");
    const other = await register("Peek");
    const id = randomUUID();
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: projectBody("Chatty") })).status, 201);
    const url = `/api/projects/${id}/conversation`;
    assert.equal((await call("GET", url)).status, 401);
    assert.deepEqual((await call("GET", url, { cookie: user.cookie })).json, { turns: [], updatedAt: null });

    const turns = [
      { role: "user", text: "What breaks first?", focusCount: 0 },
      { role: "assistant", text: "Your server.", suggestions: [], notes: [], applied: {} },
    ];
    assert.equal((await call("PUT", url, { cookie: user.cookie, body: { turns: [{ role: "bot" }] } })).status, 400);
    assert.equal((await call("PUT", url, { cookie: user.cookie, body: { turns } })).status, 200);
    assert.deepEqual(((await call("GET", url, { cookie: user.cookie })).json as { turns: unknown[] }).turns, turns);

    assert.equal((await call("GET", url, { cookie: other.cookie })).status, 404, "another user cannot read it");
    assert.equal((await call("PUT", url, { cookie: other.cookie, body: { turns } })).status, 404);
    assert.equal((await call("GET", `/api/projects/${randomUUID()}/conversation`, { cookie: user.cookie })).status, 404);

    assert.equal((await call("DELETE", url, { cookie: user.cookie })).status, 204);
    assert.deepEqual(((await call("GET", url, { cookie: user.cookie })).json as { turns: unknown[] }).turns, []);

    assert.equal((await call("PUT", url, { cookie: user.cookie, body: { turns } })).status, 200);
    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: user.cookie })).status, 204);
    const { rows } = await db.query("select count(*)::int as n from ai_conversations where project_id = $1", [id]);
    assert.equal(rows[0].n, 0, "deleted with the project");
  });

  test("version history: automatic on change, manual on request, private, and deleted with the project", T, async () => {
    const user = await register("Ver");
    const other = await register("Spy");
    const id = randomUUID();
    const save = (body: unknown) => call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body });
    const versions = async () =>
      ((await call("GET", `/api/projects/${id}/versions`, { cookie: user.cookie })).json as {
        versions: { id: string; kind: string; label: string | null; summary: { score: number; components: number } }[];
      }).versions;

    assert.equal((await save(projectBody("History"))).status, 201);
    assert.deepEqual((await versions()).map((v) => v.kind), ["auto"], "the first save is recorded");
    const moved = projectBody("History renamed");
    (moved.graph.nodes[1] as { position: { x: number } }).position.x = 999;
    await save(moved);
    assert.equal((await versions()).length, 1, "a rename or move is not a new version");

    // A real change soon after: not recorded automatically (at most every 10 minutes)…
    const scaled = projectBody("History");
    (scaled.graph.nodes[1].data as { properties: { replicas: number } }).properties.replicas = 4;
    await save(scaled);
    assert.equal((await versions()).length, 1);
    // …but "Save version" always is, with the current numbers.
    const created = await call("POST", `/api/projects/${id}/versions`, { cookie: user.cookie, body: { label: "Four servers" } });
    assert.equal(created.status, 201);
    const list = await versions();
    assert.deepEqual(list.map((v) => [v.kind, v.label]), [["manual", "Four servers"], ["auto", null]]);
    assert.notEqual(list[0].summary.score, undefined);
    assert.equal(list[0].summary.components, 2);

    const one = await call("GET", `/api/projects/${id}/versions/${list[1].id}`, { cookie: user.cookie });
    assert.equal(one.status, 200);
    assert.equal(((one.json as { graph: { nodes: { data: { properties?: { replicas: number } } }[] } }).graph.nodes[1].data.properties?.replicas), 2, "the old design is kept");

    assert.equal((await call("POST", `/api/projects/${id}/versions`, { cookie: user.cookie, body: { kind: "auto" } })).status, 400);
    // The sync engine keeps a version saved in another tab or device before overwriting it.
    const kept = await call("POST", `/api/projects/${id}/versions`, { cookie: user.cookie, body: { kind: "other-device" } });
    assert.equal(kept.status, 201);
    assert.equal((kept.json as { version: { kind: string } }).version.kind, "other-device");
    assert.equal((await call("GET", `/api/projects/${id}/versions`, { cookie: other.cookie })).status, 404);
    assert.equal((await call("GET", `/api/projects/${id}/versions/${list[0].id}`, { cookie: other.cookie })).status, 404);
    assert.equal((await call("GET", `/api/projects/${id}/versions/nope`, { cookie: user.cookie })).status, 404);

    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: user.cookie })).status, 204);
    const { rows } = await db.query("select count(*)::int as n from project_versions where project_id = $1", [id]);
    assert.equal(rows[0].n, 0);
  });

  test("a project downloads as a starter docker-compose.yml", T, async () => {
    const user = await register("Ops");
    const id = randomUUID();
    await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: projectBody("Compose me") });
    assert.equal((await call("GET", `/api/projects/${id}/export/docker-compose`)).status, 401);
    const response = await fetch(`${base}/api/projects/${id}/export/docker-compose`, { headers: { Cookie: `next-auth.session-token=${user.cookie}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/yaml/);
    assert.match(response.headers.get("content-disposition") ?? "", /docker-compose\.yml/);
    const text = await response.text();
    assert.match(text, /generated by ARCHITECH/);
    assert.match(text, /build: \.\/api/, "the API server is a build service");
  });

  test("a project downloads as a runnable app (.zip)", T, async () => {
    const user = await register("Runner");
    const id = randomUUID();
    await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: projectBody("Run me") });
    assert.equal((await call("GET", `/api/projects/${id}/export/runnable-app`)).status, 401);
    const response = await fetch(`${base}/api/projects/${id}/export/runnable-app`, { headers: { Cookie: `next-auth.session-token=${user.cookie}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.match(response.headers.get("content-disposition") ?? "", /run-me\.zip/);
    const zip = Buffer.from(await response.arrayBuffer());
    assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304", "a zip file");
    const names = zip.toString("latin1");
    for (const file of ["run-me/docker-compose.yml", "run-me/app.config.json", "run-me/services/api.js", "run-me/web/index.html", "run-me/README.md"]) assert.ok(names.includes(file), file);
  });

  test("a project runs as an app inside ARCHITECH, through every part of the design", T, async () => {
    const user = await register("Run here");
    const id = randomUUID();
    const node = (nodeId: string, type: string, label: string, x: number, extra: Record<string, unknown> = {}) => ({ id: nodeId, type: "architecture", position: { x, y: 0 }, data: { type, label, ...extra } });
    const link = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });
    const design = projectBody("Shop", {
      nodes: [
        node("c", "client", "Users", 0), node("a", "auth", "Auth", 200), node("d", "dns", "DNS", 400), node("l", "load-balancer", "Load balancer", 600),
        node("s", "server", "API server", 800, { properties: { replicas: 2 } }), node("db", "database", "Orders DB", 1000), node("k", "cache", "Redis", 1000),
        node("q", "queue", "Jobs", 1000), node("w", "worker", "Worker", 1200), node("se", "search", "Search", 1000), node("st", "object-storage", "Files", 1000),
      ],
      edges: [link("c", "a"), link("a", "d"), link("d", "l"), link("l", "s"), link("s", "db"), link("s", "k"), link("s", "q"), link("q", "w"), link("w", "db"), link("s", "se"), link("s", "st")],
    });
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: design })).status, 201);
    const runBase = `/api/projects/${id}/run`;

    // The page: the Docker app's own page, pointed at this project's API. Owner only.
    const page = await fetch(`${base}/workspace/${id}/run`, { headers: { Cookie: `next-auth.session-token=${user.cookie}` } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes(`<meta name="app-base" content="${runBase}">`), "the page knows where its API is");
    assert.ok(html.includes("Shop · running in ARCHITECH"));
    const stranger = await register("Not the owner");
    assert.equal((await fetch(`${base}/workspace/${id}/run`, { headers: { Cookie: `next-auth.session-token=${stranger.cookie}` } })).status, 404);
    assert.equal((await call("GET", `${runBase}/app.config.json`, { cookie: stranger.cookie })).status, 404);
    assert.equal((await call("GET", `${runBase}/app.config.json`)).status, 401);

    const config = (await call("GET", `${runBase}/app.config.json`, { cookie: user.cookie })).json as { auth: { mode: string }; addresses: Record<string, string>; design: unknown };
    assert.equal(config.auth.mode, "on-path");
    assert.ok(config.design, "the drawing for the page");
    const at = Object.fromEntries(Object.entries(config.addresses).map(([address, container]) => [container, address]));

    // Talks to the app the way the page does: ARCHITECH's sign-in cookie plus the app's own.
    let appCookie = "";
    const app = async (method: string, route: string, body?: unknown, extra: Record<string, string> = {}) => {
      const response = await fetch(`${base}${runBase}${route}`, {
        method,
        headers: {
          Cookie: [`next-auth.session-token=${user.cookie}`, appCookie].filter(Boolean).join("; "),
          ...(body === undefined || body instanceof Uint8Array ? {} : { "Content-Type": "application/json" }),
          ...extra,
        },
        body: body === undefined ? undefined : body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body),
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie?.startsWith("app_session=")) appCookie = setCookie.split(";")[0]!;
      const steps = JSON.parse(decodeURIComponent(response.headers.get("x-trace-steps") ?? "[]")) as { node: string; text: string }[];
      const type = response.headers.get("content-type") ?? "";
      return { status: response.status, headers: response.headers, steps, setCookie, json: type.includes("json") ? ((await response.json()) as Record<string, unknown>) : null, bytes: type.includes("json") ? null : Buffer.from(await response.arrayBuffer()) };
    };

    // Not signed in: the auth part on the path stops API calls.
    const blocked = await app("GET", "/api/items");
    assert.equal(blocked.status, 401);
    assert.equal(blocked.headers.get("x-trace-auth"), "blocked");
    assert.equal(blocked.headers.get("x-trace-web"), `${at.auth}:80`, "the page's web server sent it to the auth part");
    assert.deepEqual(blocked.steps.map((s) => s.text), ["No session cookie: not signed in.", "Stopped the request: only signed-in users get through."]);

    // Sign up: the auth part answers itself; the password is hashed and saved with a session.
    const signup = await app("POST", "/api/auth/signup", { email: "Kim@Example.com", password: "shop password" });
    assert.equal(signup.status, 201, JSON.stringify(signup.json));
    assert.deepEqual(signup.json, { user: { id: 1, email: "kim@example.com" } });
    assert.ok(signup.setCookie?.startsWith("app_session=") && signup.setCookie.includes(`; Path=${runBase}; HttpOnly; SameSite=Lax`), signup.setCookie ?? "no cookie");
    assert.deepEqual(signup.steps.map((s) => [s.node, s.text]), [
      ["a", "Creating an account for kim@example.com."],
      ["db", "No account for kim@example.com yet."],
      ["a", "Turned the password into a salted hash (scrypt), so the password itself is never stored."],
      ["db", "Saved user #1: the email and the password hash."],
      ["db", "Saved a new session for user #1."],
      ["a", "Signed you in with a session cookie."],
    ]);
    const { rows: users } = await db.query("select email, password_hash from run_users where project_id = $1", [id]);
    assert.equal(users.length, 1);
    assert.ok(!users[0].password_hash.includes("shop password"), "only the hash is stored");
    assert.equal((await app("POST", "/api/auth/signup", { email: "kim@example.com", password: "another one" })).status, 409);
    assert.equal((await app("POST", "/api/auth/signin", { email: "kim@example.com", password: "wrong password" })).status, 401);

    // Add an item: through auth, DNS (which answers with the load balancer's address), the load
    // balancer and an API server, to the database; the cache is cleared and the item indexed.
    const added = await app("POST", "/api/items", { title: "Order notes", body: "ship the red shoes on monday" });
    assert.equal(added.status, 201, JSON.stringify(added.json));
    assert.equal(added.headers.get("x-trace-auth"), `${at["load-balancer"]}:80`, "DNS answered with the load balancer");
    const server = added.headers.get("x-trace-api")!;
    assert.match(server, /^api-[12]$/);
    assert.equal(added.headers.get("x-trace-load-balancer"), `${at[server]}:3000`);
    assert.deepEqual(added.steps.map((s) => s.text), [
      "Checked the session cookie: signed in as kim@example.com.",
      "Looked up the session.",
      "Let the request through for kim@example.com.",
      `${server} received POST /api/items.`,
      "Saved item #1.",
      "Removed the cached item list, so the next read gets fresh data.",
      "Indexed item #1 so it can be searched.",
    ]);

    // The load balancer takes turns; the second read is answered by the cache.
    const first = await app("GET", "/api/items");
    const second = await app("GET", "/api/items");
    assert.notEqual(first.headers.get("x-trace-api"), second.headers.get("x-trace-api"), "the API servers take turns");
    assert.ok(first.steps.some((s) => s.text === "Read 1 item."));
    assert.ok(second.steps.some((s) => s.text.startsWith("Cache hit")));
    assert.equal(((second.json!.items as { title: string }[])[0])!.title, "Order notes");

    // Process: a job on the queue; the worker does it after its pause.
    const queued = await app("POST", "/api/items/1/process");
    assert.equal(queued.status, 202);
    assert.ok(queued.steps.some((s) => s.node === "q" && s.text.startsWith("Put a job for item #1 on the queue")));
    await new Promise((resolve) => setTimeout(resolve, 1700));
    const processed = ((await app("GET", "/api/items")).json!.items as { status: string; wordCount: number; processedBy: string }[])[0]!;
    assert.deepEqual([processed.status, processed.wordCount, processed.processedBy], ["processed", 6, "worker"]);

    // Search, and a file through object storage.
    const found = await app("GET", "/api/items?q=SHOES");
    assert.ok(found.steps.some((s) => s.node === "se" && s.text === "Searched for “SHOES”: 1 match."));
    assert.equal((found.json!.items as unknown[]).length, 1);
    const attached = await app("PUT", "/api/items/1/file", new TextEncoder().encode("ship by monday\n"), { "Content-Type": "text/plain", "X-File-Name": "note.txt" });
    assert.equal(attached.status, 200);
    assert.ok(attached.steps.some((s) => s.node === "st" && s.text === "Stored “note.txt” (1 KB)."));
    const file = await app("GET", "/api/items/1/file");
    assert.equal(file.status, 200);
    assert.equal(file.bytes!.toString(), "ship by monday\n");
    assert.match(file.headers.get("content-disposition") ?? "", /note\.txt/);

    // Sign out, then deleting the project deletes everything people did in its app.
    assert.equal((await app("POST", "/api/auth/signout")).status, 200);
    assert.equal((await app("GET", "/api/items")).status, 401);
    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: user.cookie })).status, 204);
    for (const table of ["run_users", "run_sessions", "run_items"]) {
      assert.equal((await db.query(`select count(*)::int as n from ${table} where project_id = $1`, [id])).rows[0].n, 0, table);
    }
  });

  test("a save based on an outdated copy is refused, so another device's work is not overwritten", T, async () => {
    const user = await register("Two");
    const id = randomUUID();
    const put = (title: string, ifMatch?: string) =>
      fetch(`${base}/api/projects/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `next-auth.session-token=${user.cookie}`,
          ...(ifMatch ? { "If-Match": ifMatch } : {}),
        },
        body: JSON.stringify(projectBody(title)),
      });
    const created = await put("First");
    assert.equal(created.status, 201);
    const first = created.headers.get("etag")!;
    assert.match(first, /^"\d+"$/);

    const list = await call("GET", "/api/projects", { cookie: user.cookie });
    assert.equal(`"${(list.json as { revisions: Record<string, string> }).revisions[id]}"`, first, "the list reports revisions");

    // Laptop saves on top of the first version.
    const laptop = await put("Laptop edit", first);
    assert.equal(laptop.status, 200);
    const second = laptop.headers.get("etag")!;
    assert.notEqual(second, first);

    // Phone still had the first version.
    const phone = await put("Phone edit", first);
    assert.equal(phone.status, 409);
    const conflict = (await phone.json()) as { error: string; project: { title: string }; revision: string };
    assert.match(conflict.error, /another device/);
    assert.equal(conflict.project.title, "Laptop edit", "the 409 carries the server's copy");
    assert.equal(`"${conflict.revision}"`, second);
    const stored = await call("GET", `/api/projects/${id}`, { cookie: user.cookie });
    assert.equal((stored.json as { title: string }).title, "Laptop edit", "nothing was overwritten");

    // Saving again from the server's revision works; no If-Match keeps the old behaviour.
    assert.equal((await put("Phone edit", second)).status, 200);
    assert.equal((await put("Plain save")).status, 200);
  });

    test("one user cannot see, overwrite or delete another user's project", T, async () => {
    const owner = await register("Dee");
    const other = await register("Eve");
    const id = randomUUID();
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: owner.cookie, body: projectBody("Private") })).status, 201);
    assert.equal((await call("GET", `/api/projects/${id}`, { cookie: other.cookie })).status, 404);
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: other.cookie, body: projectBody("Hijack") })).status, 404);
    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: other.cookie })).status, 404);
    assert.deepEqual((await call("GET", "/api/projects", { cookie: other.cookie })).json, { projects: [], revisions: {} });
    const { rows } = await db.query("select title from projects where id = $1", [id]);
    assert.equal(rows[0].title, "Private");
  });

  test("invalid projects are refused with the graph spec's message, and nothing is stored", T, async () => {
    const user = await register("Fay");
    const id = randomUUID();
    const badEdge = projectBody("Bad");
    (badEdge.graph.edges as unknown[]).push({ id: "e2", source: "server-1", target: "missing" });
    const refused = await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: badEdge });
    assert.equal(refused.status, 400);
    assert.match(String((refused.json as { error: string }).error), /edges\[1\]\.target/);
    assert.equal((await call("PUT", "/api/projects/bad%20id", { cookie: user.cookie, body: projectBody("x") })).status, 400);
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: "{not json" })).status, 400);
    assert.equal((await db.query("select count(*)::int as n from projects where id = $1", [id])).rows[0].n, 0);
  });

  test("technologies, settings and custom technologies survive a save and load", T, async () => {
    const user = await register("Gus");
    const id = randomUUID();
    const body = projectBody("Tech", {
      customTechnologies: [{ id: "traefik", name: "Traefik", evidence: ["docker-compose.yml runs the \"traefik\" image"] }],
    });
    (body.graph.nodes as { data: Record<string, unknown> }[])[1].data.implementation = "go-service";
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body })).status, 201);
    const read = await call("GET", `/api/projects/${id}`, { cookie: user.cookie });
    assert.deepEqual((read.json as { graph: unknown }).graph, body.graph);
    const wrongType = projectBody("Wrong");
    (wrongType.graph.nodes as { data: Record<string, unknown> }[])[1].data.implementation = "postgresql";
    assert.equal((await call("PUT", `/api/projects/${randomUUID()}`, { cookie: user.cookie, body: wrongType })).status, 400);
  });

  // ---- Save/load performance ----

  test("saving and loading the largest allowed project through the API stays fast", T, async () => {
    const user = await register("Max");
    // The largest design the server accepts: 500 components, 2,000 connections.
    const nodes = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`, type: "architecture", position: { x: (i % 25) * 240, y: Math.floor(i / 25) * 110 },
      data: { type: i === 0 ? "client" : "server", label: `n${i}`, properties: { replicas: 2 } },
    }));
    const edges: { id: string; source: string; target: string }[] = [];
    for (let i = 1; i < 500; i += 1) edges.push({ id: `t${i}`, source: `n${i - 1}`, target: `n${i}` });
    // Plus links that skip ahead (i -> i+2, i+3, ...): all distinct, never a self-link.
    for (let skip = 2; edges.length < 2_000; skip += 1) {
      for (let i = 0; i + skip < 500 && edges.length < 2_000; i += 1) edges.push({ id: `s${skip}-${i}`, source: `n${i}`, target: `n${i + skip}` });
    }
    const big = { ...projectBody("Big"), graph: { schemaVersion: 1, nodes, edges } };
    const timed = async <R>(work: () => Promise<R>) => {
      const start = performance.now();
      const result = await work();
      return { result, ms: performance.now() - start };
    };
    // Warm up: the dev server compiles a route on its first request.
    await call("PUT", `/api/projects/${randomUUID()}`, { cookie: user.cookie, body: projectBody("warm-up") });
    await call("GET", "/api/projects", { cookie: user.cookie });

    const id = randomUUID();
    const save = await timed(() => call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: big }));
    assert.equal(save.result.status, 201);
    const load = await timed(() => call("GET", `/api/projects/${id}`, { cookie: user.cookie }));
    assert.equal((load.result.json as { graph: { edges: unknown[] } }).graph.edges.length, 2_000);
    for (let i = 0; i < 20; i += 1) await call("PUT", `/api/projects/${randomUUID()}`, { cookie: user.cookie, body: projectBody(`P${i}`) });
    const list = await timed(() => call("GET", "/api/projects", { cookie: user.cookie }));
    assert.equal((list.result.json as { projects: unknown[] }).projects.length, 22);

    // Budgets with plenty of headroom for a development server on a laptop.
    assert.ok(save.ms < 2_000, `saving took ${save.ms.toFixed(0)} ms`);
    assert.ok(load.ms < 1_000, `loading took ${load.ms.toFixed(0)} ms`);
    assert.ok(list.ms < 1_500, `listing 22 projects took ${list.ms.toFixed(0)} ms`);
    console.log(`save ${save.ms.toFixed(0)} ms · load ${load.ms.toFixed(0)} ms · list ${list.ms.toFixed(0)} ms`);
  });

  // ---- AI Architect ----

  const chat = async (cookie: string | undefined, question: string, focus?: unknown) => {
    const response = await fetch(`${base}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: `next-auth.session-token=${cookie}` } : {}) },
      body: JSON.stringify({
        graph: projectBody("x").graph,
        messages: [{ role: "user", content: question }],
        ...(focus === undefined ? {} : { focus }),
      }),
    });
    const text = await response.text();
    const events = response.headers.get("content-type")?.includes("ndjson")
      ? text.trim().split("\n").map((line) => JSON.parse(line))
      : [];
    return {
      status: response.status,
      cache: response.headers.get("x-ai-cache"),
      retryAfter: response.headers.get("retry-after"),
      remaining: response.headers.get("x-ai-remaining-today"),
      events,
      text,
    };
  };

  test("the AI Architect streams an answer and a checked, previewed suggestion", T, async () => {
    const user = await register("Ada");
    assert.equal((await chat(undefined, "Hi")).status, 401);
    const bad = await fetch(`${base}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `next-auth.session-token=${user.cookie}` },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(bad.status, 400);

    const reply = await chat(user.cookie, "Should I add a cache?");
    assert.equal(reply.status, 200, reply.text);
    assert.equal(reply.cache, "miss");
    assert.deepEqual(reply.events.map((event: { type: string }) => event.type), ["text", "text", "suggestion", "done"]);
    assert.equal(reply.events.filter((e: { type: string }) => e.type === "text").map((e: { text: string }) => e.text).join(""), "Your server is the bottleneck.");
    const suggestion = reply.events[2];
    assert.equal(suggestion.title, "Add a Redis cache");
    assert.equal(suggestion.changes[0].op, "add_component");
    assert.ok(typeof suggestion.preview.before.score === "number" && typeof suggestion.preview.after.score === "number");
    assert.ok(suggestion.preview.after.monthlyCost > suggestion.preview.before.monthlyCost);
  });

  test("the same question about the same design is answered from the cache", T, async () => {
    const user = await register("Bo");
    const first = await chat(user.cookie, "What breaks first?");
    assert.equal(first.cache, "miss");
    const callsBefore = modelCalls;
    const again = await chat(user.cookie, "What breaks first?");
    assert.equal(again.status, 200);
    assert.equal(again.cache, "hit");
    assert.deepEqual(again.events, first.events);
    assert.equal(modelCalls, callsBefore, "the model was not called again");
    const { rows } = await db.query("select cached from ai_requests where user_id = $1 order by created_at", [user.id]);
    assert.deepEqual(rows.map((row) => row.cached), [false, true]);
  });

  test("asking Archie and applying a suggestion keeps the same project across reopen", T, async () => {
    const user = await register("Same project");
    const id = randomUUID();
    const original = projectBody("Existing design");
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: original })).status, 201);
    const before = (await call("GET", "/api/projects", { cookie: user.cookie })).json as { revisions: Record<string, string> };
    const answer = await chat(user.cookie, "Should I add a cache?");
    assert.equal(answer.status, 200, answer.text);
    assert.equal((await chat(user.cookie, "What breaks first?")).status, 200);
    const turns = [
      { role: "user", text: "Should I add a cache?", focusCount: 0 },
      { role: "assistant", text: "Your server is the bottleneck.", suggestions: answer.events.filter((event) => event.type === "suggestion"), notes: [], applied: {} },
    ];
    assert.equal((await call("PUT", `/api/projects/${id}/conversation`, { cookie: user.cookie, body: { turns } })).status, 200);
    const after = (await call("GET", "/api/projects", { cookie: user.cookie })).json as { projects: { id: string }[]; revisions: Record<string, string> };
    assert.deepEqual(after.projects.map((project) => project.id), [id]);
    assert.equal(after.revisions[id], before.revisions[id], "chat saving does not invalidate project sync revisions");
    const suggestion = answer.events.find((event) => event.type === "suggestion");
    assert.ok(suggestion);
    const applied = applyChanges(original.graph, suggestion.changes);
    assert.ok(applied.ok);
    const updated = { ...original, graph: { schemaVersion: 1, nodes: applied.nodes, edges: applied.edges } };
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: user.cookie, body: updated })).status, 200);
    const reopened = (await call("GET", `/api/projects/${id}`, { cookie: user.cookie })).json as { graph: unknown };
    assert.deepEqual(reopened.graph, updated.graph);
    assert.deepEqual(((await call("GET", `/api/projects/${id}/conversation`, { cookie: user.cookie })).json as { turns: unknown[] }).turns, turns);
    const listed = (await call("GET", "/api/projects", { cookie: user.cookie })).json as { projects: { id: string }[] };
    assert.deepEqual(listed.projects.map((project) => project.id), [id]);
  });

  test("each user is rate limited, and cached answers do not use up the limit", T, async () => {
    const user = await register("Cy");
    for (const question of ["One?", "Two?", "Three?"]) assert.equal((await chat(user.cookie, question)).status, 200);
    const limited = await chat(user.cookie, "Four?");
    assert.equal(limited.status, 429);
    const wait = Number(limited.retryAfter);
    assert.ok(wait >= 1 && wait <= 60, `the exact wait for the oldest question to leave the minute (${wait})`);
    assert.match(limited.text, /3 questions a minute\. Try again in \d+ seconds?/);
    assert.equal(limited.remaining, "47");
    assert.equal((await chat(user.cookie, "One?")).cache, "hit", "a cached answer is still served");
    const other = await register("Di");
    assert.equal((await chat(other.cookie, "Four?")).status, 200, "limits are per user");
  });

  test("questions sent at the same moment cannot slip past the limit", T, async () => {
    const user = await register("Gus");
    const replies = await Promise.all(["A?", "B?", "C?", "D?", "E?", "F?"].map((question) => chat(user.cookie, question)));
    const statuses = replies.map((reply) => reply.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 429, 429, 429], "exactly the 3-a-minute limit is answered");
    const { rows } = await db.query("select count(*)::int as n from ai_requests where user_id = $1 and not cached", [user.id]);
    assert.equal(rows[0].n, 3);
  });

  test("questions left are reported, and failed questions are refunded", T, async () => {
    const user = await register("Fay");
    assert.equal((await call("GET", "/api/ai/usage")).status, 401);
    const usage = await call("GET", "/api/ai/usage", { cookie: user.cookie });
    assert.equal(usage.status, 200);
    assert.deepEqual(usage.json, { configured: true, remainingToday: 50, perDay: 50, perMinute: 3 });

    assert.equal((await chat(user.cookie, "First?")).remaining, "49");
    const busy = await chat(user.cookie, "provider busy?");
    assert.equal(busy.status, 429);
    assert.equal(busy.retryAfter, "7", "the provider's own wait");
    assert.match(busy.text, /temporarily busy.*didn't count/);
    assert.equal(busy.remaining, "49");
    const down = await chat(user.cookie, "provider down?");
    assert.equal(down.status, 502);
    const { rows } = await db.query("select count(*)::int as n from ai_requests where user_id = $1 and not cached", [user.id]);
    assert.equal(rows[0].n, 1, "only the answered question counts");
    assert.equal(((await call("GET", "/api/ai/usage", { cookie: user.cookie })).json as { remainingToday: number }).remainingToday, 49);
  });

  test("a question about a boxed part of the design sends that part to the model", T, async () => {
    const user = await register("Eve");
    const nodeIds = projectBody("x").graph.nodes.map((node: { id: string }) => node.id);
    const focused = nodeIds.filter((id: string) => id !== "client-1").slice(0, 2);
    const bad = await chat(user.cookie, "Explain this part", { nodeIds: ["ghost-1"] });
    assert.equal(bad.status, 400);
    assert.match(JSON.parse(bad.text).error, /"ghost-1" is not a component/);

    const reply = await chat(user.cookie, "Explain this part", { nodeIds: focused });
    assert.equal(reply.status, 200, reply.text);
    assert.match(lastSystemPrompt, /<focus>/);
    for (const id of focused) assert.ok(lastSystemPrompt.split("<focus>\n")[1].includes(`"id":"${id}"`));
    const whole = await chat(user.cookie, "Explain this part");
    assert.equal(whole.cache, "miss", "the same question about the whole design is a different answer");
    assert.ok(!lastSystemPrompt.includes("<focus>"));
  });

  // ---- GitHub ----

  test("GitHub repos: not connected, connected, and an expired token refreshed automatically", T, async () => {
    const user = await register("Hal");
    assert.equal((await call("GET", "/api/github/repos")).status, 401);
    assert.equal((await call("GET", "/api/github/repos", { cookie: user.cookie })).status, 404);

    // Expired an hour ago, with a refresh token the fake GitHub accepts.
    await linkGitHub(user.id, { access: "expired-token", refresh: "refresh-1", expiresAt: Math.floor(Date.now() / 1000) - 3_600 });
    githubCalls.length = 0;
    const repos = await call("GET", "/api/github/repos", { cookie: user.cookie });
    assert.equal(repos.status, 200);
    assert.deepEqual((repos.json as { full_name: string }[]).map((repo) => repo.full_name), ["tester/shop", "tester/notes"]);
    assert.deepEqual(githubCalls, ["POST /login/oauth/access_token", "GET /user/repos?sort=updated&per_page=100&page=1"]);
    const { rows } = await db.query("select access_token, refresh_token, expires_at from accounts where user_id = $1", [user.id]);
    assert.equal(rows[0].access_token, "fresh-token");
    assert.equal(rows[0].refresh_token, "refresh-2");
    assert.ok(rows[0].expires_at > Date.now() / 1000);

    // The fresh token is used directly next time.
    githubCalls.length = 0;
    assert.equal((await call("GET", "/api/github/repos", { cookie: user.cookie })).status, 200);
    assert.deepEqual(githubCalls, ["GET /user/repos?sort=updated&per_page=100&page=1"]);

    githubCalls.length = 0;
    assert.equal((await call("GET", "/api/github/repos?page=2", { cookie: user.cookie })).status, 200);
    assert.deepEqual(githubCalls, ["GET /user/repos?sort=updated&per_page=100&page=2"]);
    for (const page of ["0", "-1", "1.5", "10000", "invalid"]) {
      assert.equal((await call("GET", `/api/github/repos?page=${page}`, { cookie: user.cookie })).status, 400);
    }
    assert.equal(githubCalls.length, 1, "invalid page values never reach GitHub");
  });

  test("a refresh token GitHub rejects means reconnecting", T, async () => {
    const user = await register("Ivy");
    await linkGitHub(user.id, { access: "expired-token", refresh: "revoked", expiresAt: Math.floor(Date.now() / 1000) - 10 });
    const repos = await call("GET", "/api/github/repos", { cookie: user.cookie });
    assert.equal(repos.status, 401);
    assert.match(String((repos.json as { error: string }).error), /Reconnect GitHub/);
  });

  test("importing a repository saves a project with its design and custom technologies", T, async () => {
    const user = await register("Jay");
    await linkGitHub(user.id, { access: "good-token" });
    assert.equal((await call("POST", "/api/github/import", { body: { owner: "tester", repo: "shop" } })).status, 401);
    assert.equal((await call("POST", "/api/github/import", { cookie: user.cookie, body: { owner: "tester", repo: "../x" } })).status, 400);

    const imported = await call("POST", "/api/github/import", { cookie: user.cookie, body: { owner: "tester", repo: "shop" } });
    assert.equal(imported.status, 201, JSON.stringify(imported.json));
    const result = imported.json as {
      project: { id: string; title: string; source: string; learnSkipped: boolean; graph: { nodes: { data: { type: string; implementation?: string } }[]; customTechnologies?: { name: string }[] } };
      detected: { type: string }[];
      customTechnologies: { name: string }[];
    };
    assert.equal(result.project.title, "tester/shop");
    assert.equal(result.project.source, "github");
    assert.equal(result.project.learnSkipped, true);
    assert.deepEqual(
      result.project.graph.nodes.map((node) => `${node.data.type}${node.data.implementation ? `:${node.data.implementation}` : ""}`).sort(),
      ["cache:redis", "client", "database:postgresql", "server:nodejs-express"],
    );
    assert.deepEqual(result.customTechnologies.map((technology) => technology.name), ["Zipkin"]);

    // It is a normal project of this user from now on.
    const listed = await call("GET", "/api/projects", { cookie: user.cookie });
    const project = (listed.json as { projects: typeof result.project[] }).projects.find((item) => item.id === result.project.id);
    assert.ok(project);
    assert.deepEqual(project.graph.customTechnologies?.map((technology) => technology.name), ["Zipkin"]);
  });

  test("import preview, review as compose, create from the edited file, and web research", T, async () => {
    const user = await register("Rae");
    await linkGitHub(user.id, { access: "good-token" });
    const count = async () => (await db.query("select count(*)::int as n from projects where user_id = $1", [user.id])).rows[0].n;

    // The preview reads the repository but saves nothing.
    const preview = await call("POST", "/api/github/import", { cookie: user.cookie, body: { owner: "tester", repo: "shop", preview: true } });
    assert.equal(preview.status, 200, JSON.stringify(preview.json));
    const { yaml, title } = preview.json as { yaml: string; title: string };
    assert.equal(title, "tester/shop");
    assert.match(yaml, /^x-architech:\n  version: 1/m);
    assert.equal(await count(), 0);

    // Checking the edited file, then creating the design from it.
    assert.equal((await call("POST", "/api/projects/from-compose", { body: { yaml } })).status, 401);
    assert.equal((await call("POST", "/api/projects/from-compose", { cookie: user.cookie, body: { yaml: "services: [oops" } })).status, 400);
    assert.equal((await call("POST", "/api/projects/from-compose", { cookie: user.cookie, body: { yaml, extra: 1 } })).status, 400);
    const edited = yaml.replace(/label: Users/, "label: Shoppers");
    const checked = await call("POST", "/api/projects/from-compose", { cookie: user.cookie, body: { yaml: edited, preview: true } });
    assert.equal(checked.status, 200);
    assert.equal(await count(), 0);
    const created = await call("POST", "/api/projects/from-compose", { cookie: user.cookie, body: { yaml: edited, title: "My shop", source: "github" } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const project = (created.json as { project: { title: string; source: string; graph: { nodes: { data: { label: string } }[] } } }).project;
    assert.equal(project.title, "My shop");
    assert.equal(project.source, "github");
    assert.ok(project.graph.nodes.some((node) => node.data.label === "Shoppers"));
    assert.equal(await count(), 1);

    // Looking technologies up: ClickHouse is in the catalog (no AI call) and becomes a database;
    // Snuba is read on Wikipedia and classified in one Groq call, with a similar technology's numbers.
    const withUnknowns = yaml.replace(
      "services:\n",
      [
        "services:",
        "  analytics:",
        "    image: clickhouse/clickhouse-server:24",
        "    x-architech:",
        "      type: custom",
        "      label: Analytics",
        "      settings:",
        "        technology: ClickHouse",
        "        actsAs: server",
        "  snuba:",
        "    image: $SNUBA_IMAGE",
        "    x-architech:",
        "      type: custom",
        "      label: Snuba Api",
        "      settings:",
        "        technology: Snuba",
        "        actsAs: worker",
        "",
      ].join("\n"),
    );
    assert.equal((await call("POST", "/api/ai/research", { body: { yaml: withUnknowns } })).status, 401);
    const before = groqCalls;
    const researched = await call("POST", "/api/ai/research", { cookie: user.cookie, body: { yaml: withUnknowns } });
    assert.equal(researched.status, 200, JSON.stringify(researched.json));
    const result = researched.json as { yaml: string; findings: { technology: string; finding: { implementation?: string; similarTo?: string } | null }[] };
    assert.equal(groqCalls - before, 1, "one call for everything");
    assert.deepEqual(result.findings.map((item) => [item.technology, item.finding?.implementation ?? item.finding?.similarTo]), [["ClickHouse", "clickhouse"], ["Snuba", "python-django"]]);
    assert.match(result.yaml, /# Recognized: ClickHouse/);
    assert.match(result.yaml, /# Source: https:\/\/en\.wikipedia\.org\/wiki\/Snuba/);
    const created2 = await call("POST", "/api/projects/from-compose", { cookie: user.cookie, body: { yaml: result.yaml } });
    assert.equal(created2.status, 201, JSON.stringify(created2.json));
    const nodes = (created2.json as { project: { graph: { nodes: { id: string; data: { type: string; implementation?: string; properties?: Record<string, unknown> } }[] } } }).project.graph.nodes;
    assert.equal(nodes.find((node) => node.id === "analytics")?.data.implementation, "clickhouse");
    assert.equal(nodes.find((node) => node.id === "snuba")?.data.properties?.capacity, 900);
    // Cached: the same lookup again does not call Groq.
    await call("POST", "/api/ai/research", { cookie: user.cookie, body: { yaml: withUnknowns } });
    assert.equal(groqCalls - before, 1);
  });

  test("import errors: unknown repository, nothing recognizable, rejected token", T, async () => {
    const user = await register("Kim");
    await linkGitHub(user.id, { access: "good-token" });
    assert.equal((await call("POST", "/api/github/import", { cookie: user.cookie, body: { owner: "tester", repo: "missing" } })).status, 404);
    assert.equal((await call("POST", "/api/github/import", { cookie: user.cookie, body: { owner: "tester", repo: "notes" } })).status, 422);

    const rejected = await register("Lou");
    await linkGitHub(rejected.id, { access: "revoked-token" });
    const result = await call("POST", "/api/github/import", { cookie: rejected.cookie, body: { owner: "tester", repo: "shop" } });
    assert.equal(result.status, 401);
    assert.equal((await db.query("select count(*)::int as n from projects where user_id = $1", [rejected.id])).rows[0].n, 0);
  });
}

function run(command: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd: FRONTEND, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command.join(" ")} failed:\n${output.slice(-2_000)}`))));
  });
}
