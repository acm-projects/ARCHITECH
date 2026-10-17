import assert from "node:assert/strict";
import test from "node:test";

import { getPropertyDefinitions, validatePropertyValue } from "../src/lib/architecture/componentProperties.ts";
import { AUTH_CHECK_RATE_DEFAULT, configureNode } from "../src/lib/architecture/evaluation/capabilities.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { canonicalEvaluationInput } from "../src/lib/architecture/evaluation/fingerprint.ts";
import { simulate } from "../src/lib/architecture/evaluation/simulation.ts";
import { sanitizeTraffic } from "../src/lib/architecture/evaluation/traffic.ts";
import type { ArchitectureNodeType, NodeProperties } from "../src/lib/architecture/types.ts";

const n = (id: string, type: ArchitectureNodeType, properties?: NodeProperties) => ({
  id,
  data: { type, label: id, ...(properties ? { properties } : {}) },
});
const e = (source: string, target: string) => ({ source, target });
const traffic = (overrides: Record<string, number> = {}) =>
  sanitizeTraffic({ requestsPerSecond: 2_000, concurrentUsers: 5_000, datasetGb: 50, readRatio: 80, staticShare: 0, networkLatencyMs: 40, ...overrides }).traffic;
const nodeOf = (graph: Parameters<typeof simulate>[0], id: string, t = traffic()) =>
  simulate(graph, t).nodes.find((node) => node.id === id)!;

// ---- Authentication: JWT by default, session lookup when set to 1 ----

const withAuth = (auth?: NodeProperties) => ({
  nodes: [n("c", "client"), n("s", "server", { replicas: 4 }), n("a", "auth", auth), n("d", "database")],
  edges: [e("c", "s"), e("s", "a"), e("s", "d")],
});

test("by default (JWT) only sign-ins and refreshes reach the auth service", () => {
  assert.equal(AUTH_CHECK_RATE_DEFAULT, 0.05);
  assert.equal(configureNode(n("a", "auth")).checkRate, 0.05);
  assert.equal(configureNode(n("s", "server")).checkRate, 1);
  const jwt = nodeOf(withAuth(), "a");
  const sessions = nodeOf(withAuth({ authCheckRate: 1 }), "a");
  assert.ok(Math.abs(jwt.demandRps - 2_000 * 0.05) < 1e-6);
  assert.ok(Math.abs(sessions.demandRps - 2_000) < 1e-6);
  assert.ok(jwt.utilization < sessions.utilization);
});

test("an auth outage only fails the requests that call it", () => {
  const availability = (auth?: NodeProperties) =>
    evaluateArchitecture({ graph: withAuth(auth) as never, traffic: traffic() }).metrics.uptimeAvailability;
  assert.ok(availability() > availability({ authCheckRate: 1 }));
});

test("session lookups make auth the bottleneck where JWTs would not", () => {
  const graph = (auth?: NodeProperties) => ({
    nodes: [n("c", "client"), n("s", "server", { replicas: 10 }), n("a", "auth", auth)],
    edges: [e("c", "s"), e("s", "a")],
  });
  const t = traffic({ requestsPerSecond: 8_000 });
  assert.notEqual(simulate(graph({ authCheckRate: 1 }), t).limitingNodeId, null);
  assert.equal(simulate(graph({ authCheckRate: 1 }), t).limitingNodeId, "a");
  assert.notEqual(simulate(graph(), t).limitingNodeId, "a");
});

test("the check rate is an auth setting, validated like the others, and part of the fingerprint", () => {
  assert.ok(getPropertyDefinitions("auth").some((definition) => definition.key === "authCheckRate"));
  assert.ok(!getPropertyDefinitions("search").some((definition) => definition.key === "authCheckRate"));
  assert.equal(validatePropertyValue("auth", "authCheckRate", 0.2).ok, true);
  assert.equal(validatePropertyValue("auth", "authCheckRate", 2).ok, false);
  assert.equal(validatePropertyValue("server", "authCheckRate", 0.2).ok, false);
  assert.notEqual(
    canonicalEvaluationInput({ graph: withAuth({ authCheckRate: 1 }) }),
    canonicalEvaluationInput({ graph: withAuth() }),
  );
});

// ---- Static files vs API requests ----

const staticTraffic = (overrides: Record<string, number> = {}) => traffic({ staticShare: 60, ...overrides });

test("by default 60% of requests are static files, and they never reach the database", () => {
  assert.equal(sanitizeTraffic(undefined).traffic.staticShare, 60);
  const graph = {
    nodes: [n("c", "client"), n("s", "server", { replicas: 4 }), n("d", "database")],
    edges: [e("c", "s"), e("s", "d")],
  };
  const sim = simulate(graph, staticTraffic());
  const server = sim.nodes.find((node) => node.id === "s")!;
  const database = sim.nodes.find((node) => node.id === "d")!;
  assert.ok(Math.abs(server.demandRps - 2_000) < 1e-6, "the server handles everything");
  assert.ok(Math.abs(server.staticRps - 1_200) < 1e-6);
  assert.ok(Math.abs(database.demandRps - 800) < 1e-6, "only the API requests reach the database");
  assert.equal(database.staticRps, 0);
});

test("a CDN answers static files at the edge and sends API requests on", () => {
  const graph = {
    nodes: [n("c", "client"), n("cdn", "cdn"), n("s", "server", { replicas: 4 }), n("o", "object-storage"), n("d", "database")],
    edges: [e("c", "cdn"), e("cdn", "s"), e("cdn", "o"), e("s", "d")],
  };
  const sim = simulate(graph, staticTraffic());
  const at = (id: string) => sim.nodes.find((node) => node.id === id)!;
  assert.equal(configureNode(n("cdn", "cdn")).hitRate, 0.95);
  assert.ok(Math.abs(at("s").demandRps - 800) < 1e-6, "the server only sees API requests");
  assert.equal(at("s").staticRps, 0);
  assert.ok(Math.abs(at("o").demandRps - 1_200 * 0.05) < 1e-6, "storage only sees the CDN's misses");
});

test("the client fetches static files from a CDN or object storage it is connected to", () => {
  const graph = {
    nodes: [n("c", "client"), n("cdn", "cdn"), n("o", "object-storage"), n("s", "server", { replicas: 4 }), n("d", "database")],
    edges: [e("c", "cdn"), e("cdn", "o"), e("c", "s"), e("s", "d")],
  };
  const sim = simulate(graph, staticTraffic());
  const at = (id: string) => sim.nodes.find((node) => node.id === id)!;
  assert.ok(Math.abs(at("cdn").demandRps - 1_200) < 1e-6);
  assert.ok(Math.abs(at("s").demandRps - 800) < 1e-6);
});

test("CDN + object storage beats serving files through the servers", () => {
  const throughServers = {
    nodes: [n("c", "client"), n("s", "server", { replicas: 4 }), n("d", "database")],
    edges: [e("c", "s"), e("s", "d")],
  };
  const withCdn = {
    nodes: [n("c", "client"), n("cdn", "cdn"), n("o", "object-storage"), n("s", "server", { replicas: 4 }), n("d", "database")],
    edges: [e("c", "cdn"), e("cdn", "o"), e("c", "s"), e("s", "d")],
  };
  const t = staticTraffic({ requestsPerSecond: 12_000 });
  const servers = evaluateArchitecture({ graph: throughServers as never, traffic: t });
  const cdn = evaluateArchitecture({ graph: withCdn as never, traffic: t });
  assert.ok((cdn.metrics.capacityRps ?? Infinity) > (servers.metrics.capacityRps ?? Infinity));
  assert.ok(servers.findings.some((finding) => finding.id === "static-on-servers-s"));
  assert.ok(!cdn.findings.some((finding) => finding.id.startsWith("static-on-servers-")));
});

test("a server connected to object storage reads files from it instead of the database", () => {
  const graph = {
    nodes: [n("c", "client"), n("s", "server", { replicas: 4 }), n("o", "object-storage"), n("d", "database")],
    edges: [e("c", "s"), e("s", "o"), e("s", "d")],
  };
  const sim = simulate(graph, staticTraffic());
  const at = (id: string) => sim.nodes.find((node) => node.id === id)!;
  assert.ok(at("o").staticRps >= 1_200 - 1e-6);
  assert.equal(at("d").staticRps, 0);
});

test("static files a CDN holds keep working when the origin is down", () => {
  const graph = (cdnHit: number) => ({
    nodes: [n("c", "client"), n("cdn", "cdn", { cacheHitRate: cdnHit }), n("s", "server")],
    edges: [e("c", "cdn"), e("cdn", "s")],
  });
  const up = (hit: number) => simulate(graph(hit), staticTraffic()).uptimeAvailability;
  assert.ok(up(0.95) > up(0));
});

test("the static share is part of the fingerprint", () => {
  const graph = { nodes: [n("c", "client"), n("s", "server")], edges: [e("c", "s")] };
  assert.notEqual(
    canonicalEvaluationInput({ graph, traffic: staticTraffic({ staticShare: 60 }) }),
    canonicalEvaluationInput({ graph, traffic: staticTraffic({ staticShare: 20 }) }),
  );
});
