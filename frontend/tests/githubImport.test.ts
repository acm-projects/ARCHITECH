import assert from "node:assert/strict";
import test from "node:test";

import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { buildDesign } from "../src/lib/github/buildDesign.ts";
import { detectStack, detectUnmodeled } from "../src/lib/github/detectStack.ts";
import { importRepository, validateImportRequest } from "../src/lib/github/importRepo.ts";
import {
  GitHubError,
  STACK_FILES,
  candidateFolders,
  folderPaths,
  githubGraphql,
  type GitHubGraphql,
} from "../src/lib/github/repoFiles.ts";
import { validateGraph } from "../src/lib/projects/projectPayload.ts";

// ---- A fake GitHub: answers the two GraphQL queries from an in-memory repository ----

type FakeRepo = { entries: { name: string; type: "blob" | "tree" }[]; files: Record<string, string> };

function fakeGitHub(repo: FakeRepo | null) {
  const queries: string[] = [];
  const graphql: GitHubGraphql = async (query, variables) => {
    queries.push(query);
    assert.deepEqual(Object.keys(variables).sort(), ["name", "owner"]);
    if (!repo) return { repository: null };
    const blob = (path: string) => (path in repo.files ? { text: repo.files[path], byteSize: repo.files[path].length, isBinary: false } : null);
    const paths = query.includes("RepoRoot") ? [...STACK_FILES] : folderPaths(candidateFolders(repo.entries));
    const aliases = Object.fromEntries(paths.map((path, index) => [`f${index}`, blob(path)]));
    if (query.includes("RepoRoot")) {
      return { repository: { nameWithOwner: `${variables.owner}/${variables.name}`, description: null, root: { entries: repo.entries }, ...aliases } };
    }
    return { repository: aliases };
  };
  return { graphql, queries };
}
const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ dependencies: deps, devDependencies: dev });
const typesOf = (result: { graph: { nodes: { data: { type: string; implementation?: string } }[] } }) =>
  result.graph.nodes.map((node) => `${node.data.type}${node.data.implementation ? `:${node.data.implementation}` : ""}`).sort();

// ---- Whole imports ----

test("a Next.js + Prisma monorepo (like ARCHITECH) becomes web app, API routes, auth and PostgreSQL", async () => {
  const { graphql, queries } = fakeGitHub({
    entries: [{ name: "frontend", type: "tree" }, { name: "README.md", type: "blob" }, { name: "node_modules", type: "tree" }],
    files: {
      "frontend/package.json": pkg({ next: "16", react: "19", "next-auth": "4", "@prisma/client": "7", pg: "8" }),
      "frontend/prisma/schema.prisma": 'datasource db {\n  provider = "postgresql"\n}\n',
    },
  });
  const result = await importRepository(graphql, { owner: "team", repo: "architech" });
  assert.equal(queries.length, 2, "one request for the top level, one for the frontend/ folder");
  assert.ok(!queries[1].includes("node_modules"));
  assert.equal(result.title, "team/architech");
  assert.deepEqual(typesOf(result), ["auth:authjs", "client", "database:postgresql", "server:nodejs-express", "web-app:nextjs"]);
  const routes = result.detected.find((component) => component.type === "server");
  assert.equal(routes?.label, "Next.js API routes");
  const database = result.detected.find((component) => component.type === "database");
  assert.deepEqual(database?.evidence, ['frontend/package.json uses "pg"', 'frontend/prisma/schema.prisma uses provider "postgresql"']);
  assert.equal(database?.technology, "PostgreSQL");
  assert.deepEqual(result.scannedFiles, ["frontend/package.json", "frontend/prisma/schema.prisma"]);
  // client -> web app -> API routes -> auth and database
  const edges = result.graph.edges.map((edge) => `${edge.source}>${edge.target}`).sort();
  assert.deepEqual(edges, ["client-1>web-app-1", "server-1>auth-1", "server-1>database-1", "web-app-1>server-1"]);
});

test("a docker-compose full stack becomes load balancer, GraphQL API, services, data, queue and worker", async () => {
  const { graphql } = fakeGitHub({
    entries: [{ name: "backend", type: "tree" }, { name: "web", type: "tree" }],
    files: {
      "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7-alpine\n  mq:\n    image: rabbitmq:3-management\n  proxy:\n    image: nginx:latest\n",
      "backend/package.json": pkg({ express: "4", "@apollo/server": "4", ioredis: "5", amqplib: "0.10", "@aws-sdk/client-s3": "3" }),
      "web/package.json": pkg({ react: "19" }, { "@vitejs/plugin-react": "4", vite: "5" }),
    },
  });
  const result = await importRepository(graphql, { owner: "acme", repo: "shop" });
  assert.deepEqual(typesOf(result), [
    "api:graphql-api", "cache:redis", "client", "database:postgresql", "load-balancer:nginx", "object-storage:amazon-s3",
    "queue:rabbitmq", "server:nodejs-express", "web-app:react-spa", "worker",
  ]);
  const edges = new Set(result.graph.edges.map((edge) => `${edge.source}>${edge.target}`));
  for (const edge of ["client-1>web-app-1", "web-app-1>load-balancer-1", "load-balancer-1>api-1", "api-1>server-1", "server-1>cache-1", "server-1>database-1", "server-1>queue-1", "server-1>object-storage-1", "queue-1>worker-1", "worker-1>database-1"]) {
    assert.ok(edges.has(edge), `missing ${edge}`);
  }
  const redis = result.detected.find((component) => component.type === "cache");
  assert.deepEqual(redis?.evidence, ['backend/package.json uses "ioredis"', 'docker-compose.yml runs the "redis" image']);
  // The imported design runs straight away.
  const evaluation = evaluateArchitecture({ graph: result.graph as never });
  assert.equal(evaluation.ready, true);
  assert.deepEqual(evaluation.findings.filter((finding) => finding.category === "architecture").map((f) => f.id), []);
});

test("Python, Go and Java projects are recognized", () => {
  const detect = (files: Record<string, string>) =>
    detectStack(new Map(Object.entries(files))).map((c) => `${c.type}${c.implementation ? `:${c.implementation}` : ""}`).sort();
  assert.deepEqual(detect({ "requirements.txt": "fastapi==0.110\npsycopg2-binary>=2.9  # db\nredis\ncelery[redis]==5.3\n# flask\n" }), [
    "cache:redis", "database:postgresql", "queue:rabbitmq", "server:python-fastapi", "worker",
  ]);
  assert.deepEqual(detect({ "pyproject.toml": '[project]\ndependencies = ["django>=5", "pymongo"]\n' }), ["database:mongodb", "server:python-fastapi"]);
  assert.deepEqual(
    detect({ "go.mod": "module example.com/svc\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgithub.com/jackc/pgx/v5 v5.5.0\n\tgoogle.golang.org/grpc v1.62.0\n)\n" }),
    ["api:grpc-api", "database:postgresql", "server:go-service"],
  );
  assert.deepEqual(detect({ "go.mod": "module example.com/tool\n\ngo 1.22\n" }), ["server:go-service"]);
  assert.deepEqual(
    detect({ "pom.xml": "<dependency><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><groupId>org.postgresql</groupId></dependency><dependency><artifactId>spring-kafka</artifactId></dependency>" }),
    ["database:postgresql", "queue:apache-kafka", "server:java-spring-boot", "worker"],
  );
});

test("every built design passes the graph spec and is laid out left to right", () => {
  const files = new Map(Object.entries({
    "package.json": pkg({ next: "16", "socket.io": "4", mongoose: "8", "@elastic/elasticsearch": "8", "@auth0/nextjs-auth0": "3", kafkajs: "2" }),
  }));
  const design = buildDesign(detectStack(files));
  assert.equal(validateGraph(JSON.parse(JSON.stringify(design))).ok, true);
  const x = (type: string) => design.nodes.find((node) => node.data.type === type)!.position.x;
  assert.ok(x("client") < x("web-app") && x("web-app") < x("api") && x("api") < x("server") && x("server") < x("database"));
});

// ---- Problems ----

test("a missing repository, or one with nothing recognizable, is a clear error", async () => {
  await assert.rejects(importRepository(fakeGitHub(null).graphql, { owner: "a", repo: "b" }), (error: unknown) =>
    error instanceof GitHubError && error.kind === "not-found" && /a\/b was not found/.test(error.message));
  await assert.rejects(importRepository(fakeGitHub({ entries: [], files: {} }).graphql, { owner: "a", repo: "b" }), (error: unknown) =>
    error instanceof GitHubError && error.kind === "nothing-detected" && /No stack files/.test(error.message));
  await assert.rejects(
    importRepository(fakeGitHub({ entries: [], files: { "package.json": pkg({ lodash: "4" }) } }).graphql, { owner: "a", repo: "b" }),
    /No recognizable components/,
  );
});

test("folder names that are not plain names never reach a query", () => {
  assert.deepEqual(
    candidateFolders([
      { name: "api", type: "tree" }, { name: 'x") { evil }', type: "tree" }, { name: ".github", type: "tree" },
      { name: "docs", type: "tree" }, { name: "src", type: "blob" }, { name: "services", type: "tree" },
    ]),
    ["api", "services"],
  );
});

test("import requests are validated", () => {
  assert.equal(validateImportRequest({ owner: "vercel", repo: "next.js" }).ok, true);
  for (const body of [null, {}, { owner: "a" }, { owner: "-bad", repo: "x" }, { owner: "a", repo: "../x" }, { owner: "a", repo: ".." }, { owner: "a", repo: "x", extra: 1 }]) {
    assert.equal(validateImportRequest(body).ok, false, JSON.stringify(body));
  }
});

test("the GitHub GraphQL client sends the token and maps GitHub's errors", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const respond = (status: number, body: unknown) => async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return new Response(JSON.stringify(body), { status });
  };
  const ok = githubGraphql("tok", respond(200, { data: { repository: { nameWithOwner: "a/b" } } }) as typeof fetch);
  assert.deepEqual(await ok("query { x }", { owner: "a", name: "b" }), { repository: { nameWithOwner: "a/b" } });
  assert.equal(calls[0].url, "https://api.github.com/graphql");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { query: "query { x }", variables: { owner: "a", name: "b" } });

  const kind = async (status: number, body: unknown) => {
    try {
      await githubGraphql("tok", respond(status, body) as typeof fetch)("q", {});
      return "none";
    } catch (error) {
      return error instanceof GitHubError ? error.kind : "other";
    }
  };
  assert.equal(await kind(401, {}), "unauthorized");
  assert.equal(await kind(403, {}), "rate-limited");
  assert.equal(await kind(200, { data: { repository: null }, errors: [{ type: "NOT_FOUND" }] }), "not-found");
  assert.equal(await kind(200, { errors: [{ type: "RATE_LIMITED" }] }), "rate-limited");
  assert.equal(await kind(502, {}), "failed");
});

// ---- Technologies the app does not model ----

test("unknown services and unmodeled stacks are collected as custom technologies, with evidence", () => {
  const custom = detectUnmodeled(
    new Map(Object.entries({
      "docker-compose.yml": [
        "services:",
        "  proxy:\n    image: traefik:v3.0",
        "  analytics:\n    image: clickhouse/clickhouse-server:24",
        "  db:\n    image: postgres:16",
        "  vote:\n    image: dockersamples/examplevotingapp_vote",
        "  tools:\n    image: node:20-alpine",
      ].join("\n"),
      "worker/Dockerfile": "FROM mcr.microsoft.com/dotnet/sdk:7.0 AS build\nRUN dotnet publish\n",
      "api/Dockerfile": "FROM node:20\n",
      "engine/CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\n",
      "billing/Gemfile": "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\n",
    })),
    { owner: "dockersamples", name: "example-voting-app" },
  );
  assert.deepEqual(
    custom.map((technology) => technology.name).sort(),
    [".NET service (worker)", "C++ service (engine)", "ClickHouse", "Ruby on Rails app (billing)", "Traefik"],
  );
  const traefik = custom.find((technology) => technology.id === "traefik");
  assert.deepEqual(traefik?.evidence, ['docker-compose.yml runs the "traefik" image']);
  assert.ok(custom.every((technology) => /^[a-z0-9][a-z0-9-]*$/.test(technology.id)));
});

test("an import keeps its custom technologies with the project, even when nothing else is recognized", async () => {
  const { graphql } = fakeGitHub({
    entries: [{ name: "worker", type: "tree" }],
    files: {
      "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n  proxy:\n    image: traefik:v3\n",
      "worker/Dockerfile": "FROM mcr.microsoft.com/dotnet/runtime:8.0\n",
    },
  });
  const result = await importRepository(graphql, { owner: "acme", repo: "orders" });
  assert.deepEqual(result.customTechnologies.map((technology) => technology.name).sort(), [".NET service (worker)", "Traefik"]);
  assert.deepEqual(result.graph.customTechnologies, result.customTechnologies);
  assert.ok(!result.graph.nodes.some((node) => node.data.type === "custom"), "custom technologies are offered, not placed");

  // A C++ repository: nothing modelled, but its stack is offered.
  const cpp = await importRepository(fakeGitHub({ entries: [], files: { "CMakeLists.txt": "project(engine)\n" } }).graphql, { owner: "me", repo: "risk-engine" });
  assert.deepEqual(cpp.customTechnologies.map((technology) => technology.name), ["C++ service"]);
  assert.deepEqual(cpp.graph.nodes.map((node) => node.data.type), ["client"]);
});
