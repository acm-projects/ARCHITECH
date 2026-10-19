import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";

import { encode } from "next-auth/jwt";
import pg from "pg";

import { STACK_FILES, candidateFolders, folderPaths } from "../../src/lib/github/repoFiles.ts";

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
        "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n  proxy:\n    image: traefik:v3\n",
        "backend/package.json": JSON.stringify({ dependencies: { express: "4", ioredis: "5" } }),
      },
    },
    "tester/notes": { entries: [], files: { "README.md": "# notes" } },
  };
  const VALID_TOKENS = new Set(["good-token", "fresh-token"]);
  function fakeGitHub(request: http.IncomingMessage, response: http.ServerResponse) {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      githubCalls.push(`${request.method} ${request.url}`);
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(body));
      };
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
  const call = async (method: string, route: string, options: { cookie?: string; body?: unknown } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
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
    const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`;
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
        { id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Users" } },
        { id: "server-1", type: "architecture", position: { x: 240, y: 0 }, data: { type: "server", label: "API", properties: { replicas: 2 } } },
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
    for (const migration of migrations) {
      await db.query(readFileSync(path.join(FRONTEND, "prisma/migrations", migration, "migration.sql"), "utf8"));
    }
    await run(["node", "--experimental-strip-types", "prisma/seed.ts"], { DATABASE_URL: dbUrl });

    github = http.createServer(fakeGitHub);
    await new Promise<void>((resolve) => github!.listen(0, "127.0.0.1", resolve));
    const githubUrl = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

    const port = 4100 + Math.floor(Math.random() * 800);
    base = `http://localhost:${port}`;
    server = spawn("npx", ["next", "dev", "-p", String(port), ...(process.env.INTEGRATION_NEXT_FLAGS?.split(" ").filter(Boolean) ?? [])], {
      cwd: FRONTEND,
      detached: true,
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
        process.kill(-server.pid, "SIGTERM");
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

  // ---- Projects ----

  test("projects need a signed-in user", T, async () => {
    assert.equal((await call("GET", "/api/projects")).status, 401);
    assert.equal((await call("PUT", `/api/projects/${randomUUID()}`, { body: projectBody("x") })).status, 401);
    assert.equal((await call("DELETE", `/api/projects/${randomUUID()}`)).status, 401);
  });

  test("a project is created, replaced, listed, read and deleted", T, async () => {
    const user = await register("Cal");
    const id = randomUUID();
    assert.deepEqual((await call("GET", "/api/projects", { cookie: user.cookie })).json, { projects: [] });

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

  test("one user cannot see, overwrite or delete another user's project", T, async () => {
    const owner = await register("Dee");
    const other = await register("Eve");
    const id = randomUUID();
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: owner.cookie, body: projectBody("Private") })).status, 201);
    assert.equal((await call("GET", `/api/projects/${id}`, { cookie: other.cookie })).status, 404);
    assert.equal((await call("PUT", `/api/projects/${id}`, { cookie: other.cookie, body: projectBody("Hijack") })).status, 404);
    assert.equal((await call("DELETE", `/api/projects/${id}`, { cookie: other.cookie })).status, 404);
    assert.deepEqual((await call("GET", "/api/projects", { cookie: other.cookie })).json, { projects: [] });
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
    assert.deepEqual(githubCalls, ["POST /login/oauth/access_token", "GET /user/repos?sort=updated&per_page=3"]);
    const { rows } = await db.query("select access_token, refresh_token, expires_at from accounts where user_id = $1", [user.id]);
    assert.equal(rows[0].access_token, "fresh-token");
    assert.equal(rows[0].refresh_token, "refresh-2");
    assert.ok(rows[0].expires_at > Date.now() / 1000);

    // The fresh token is used directly next time.
    githubCalls.length = 0;
    assert.equal((await call("GET", "/api/github/repos", { cookie: user.cookie })).status, 200);
    assert.deepEqual(githubCalls, ["GET /user/repos?sort=updated&per_page=3"]);
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
    assert.deepEqual(result.customTechnologies.map((technology) => technology.name), ["Traefik"]);

    // It is a normal project of this user from now on.
    const listed = await call("GET", "/api/projects", { cookie: user.cookie });
    const project = (listed.json as { projects: typeof result.project[] }).projects.find((item) => item.id === result.project.id);
    assert.ok(project);
    assert.deepEqual(project.graph.customTechnologies?.map((technology) => technology.name), ["Traefik"]);
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
