import assert from "node:assert/strict";
import test from "node:test";

import {
  countConnectedNodes,
  getReachableNodes,
  hasDirectConnection,
  hasPath,
  type EvalNode,
} from "../src/components/challenge/evaluation/graph.ts";
import { evaluateUrlShortener } from "../src/components/challenge/evaluation/urlShortener.ts";

const n = (id: string, type: EvalNode["data"]["type"]): EvalNode => ({
  id,
  data: { type },
});
const e = (source: string, target: string) => ({ source, target });

const client = n("c", "client");
const server = n("s", "server");
const db = n("d", "database");
const cache = n("k", "cache");
const lb = n("lb", "load-balancer");
const server2 = n("s2", "server");

const baseline = evaluateUrlShortener(
  [client, server, db],
  [e("c", "s"), e("s", "d")],
);

const titles = (nodes: EvalNode[], edges: ReturnType<typeof e>[]) =>
  evaluateUrlShortener(nodes, edges).findings.map((f) => f.title);

test("empty canvas scores low but not zero, and asks for the basics", () => {
  const result = evaluateUrlShortener([], []);
  assert.ok(result.overallScore >= 5 && result.overallScore <= 15);
  assert.ok(result.scalability > 0 && result.latency > 0);
  const found = result.findings.map((f) => f.title);
  assert.ok(found.includes("Add an entry point"));
  assert.ok(found.includes("Your design needs a backend service"));
  assert.ok(found.includes("Your design needs persistent storage"));
});

test("Client only stays low and is not the core path", () => {
  const result = evaluateUrlShortener([client], []);
  assert.ok(result.overallScore < 20);
  assert.ok(!result.findings.some((f) => f.title === "Core request path established"));
});

test("Client -> API Server improves on Client only, without the core path", () => {
  const clientOnly = evaluateUrlShortener([client], []);
  const connected = evaluateUrlShortener([client, server], [e("c", "s")]);
  assert.ok(connected.overallScore > clientOnly.overallScore);
  assert.ok(
    connected.findings.some((f) => f.title === "Your design needs persistent storage"),
  );
});

test("Client -> API Server -> Database establishes the core path", () => {
  assert.ok(baseline.overallScore >= 45);
  assert.ok(baseline.findings.some((f) => f.title === "Core request path established"));
  const withoutDb = evaluateUrlShortener([client, server], [e("c", "s")]);
  assert.ok(baseline.reliability > withoutDb.reliability);
});

test("a database the backend cannot reach is flagged", () => {
  const found = titles([client, server, db], [e("c", "s")]);
  assert.ok(found.includes("Your backend has no path to persistent storage"));
});

test("a connected cache improves latency, scalability and cost", () => {
  const cached = evaluateUrlShortener(
    [client, server, db, cache],
    [e("c", "s"), e("s", "d"), e("s", "k")],
  );
  assert.ok(cached.latency > baseline.latency);
  assert.ok(cached.scalability > baseline.scalability);
  assert.ok(cached.costEfficiency > baseline.costEfficiency);
  assert.ok(
    cached.findings.some((f) => f.title === "Cache reduces redirect lookup latency"),
  );
});

test("a cache between the server and database also counts", () => {
  const inline = evaluateUrlShortener(
    [client, server, db, cache],
    [e("c", "s"), e("s", "k"), e("k", "d")],
  );
  assert.ok(inline.latency > baseline.latency);
});

test("a disconnected cache does not get the full benefit", () => {
  const connected = evaluateUrlShortener(
    [client, server, db, cache],
    [e("c", "s"), e("s", "d"), e("s", "k")],
  );
  const loose = evaluateUrlShortener(
    [client, server, db, cache],
    [e("c", "s"), e("s", "d")],
  );
  assert.ok(loose.latency < connected.latency);
  assert.ok(loose.scalability < connected.scalability);
  assert.ok(
    loose.findings.some((f) => f.title === "Connect the cache to your request path"),
  );
});

test("a connected load balancer improves scalability", () => {
  const balanced = evaluateUrlShortener(
    [client, lb, server, db],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );
  assert.ok(balanced.scalability > baseline.scalability);
  assert.ok(
    balanced.findings.some(
      (f) => f.title === "Traffic can be distributed across application servers",
    ),
  );
});

test("a disconnected load balancer does not get the full benefit", () => {
  const balanced = evaluateUrlShortener(
    [client, lb, server, db],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );
  const loose = evaluateUrlShortener(
    [client, lb, server, db],
    [e("c", "s"), e("s", "d")],
  );
  assert.ok(loose.scalability < balanced.scalability);
  assert.ok(loose.scalability - baseline.scalability < 10);
});

const redundantNodes = [client, lb, server, server2, db];
const redundantEdges = [
  e("c", "lb"),
  e("lb", "s"),
  e("lb", "s2"),
  e("s", "d"),
  e("s2", "d"),
];

test("a load balancer with several reachable servers adds redundancy", () => {
  const single = evaluateUrlShortener(
    [client, lb, server, db],
    [e("c", "lb"), e("lb", "s"), e("s", "d")],
  );
  const redundant = evaluateUrlShortener(redundantNodes, redundantEdges);
  assert.ok(redundant.reliability > single.reliability);
  assert.ok(redundant.scalability > single.scalability);
  assert.ok(
    redundant.findings.some((f) => f.title === "Application servers are redundant"),
  );
});

test("multiple isolated servers do not get the same redundancy bonus", () => {
  const isolated = evaluateUrlShortener(
    [client, server, server2, db],
    [e("c", "s"), e("s", "d")],
  );
  const redundant = evaluateUrlShortener(redundantNodes, redundantEdges);
  assert.ok(isolated.reliability < redundant.reliability);
  assert.ok(isolated.reliability - baseline.reliability < 10);
});

test("component types decide the score, not display names", () => {
  // Display labels never reach the evaluator; renamed nodes differ only by id.
  const renamed = evaluateUrlShortener(
    [n("user", "client"), n("backend", "server"), n("url-store", "database")],
    [e("user", "backend"), e("backend", "url-store")],
  );
  assert.deepEqual(renamed, baseline);
});

test("disconnected unnecessary components reduce cost efficiency", () => {
  const cluttered = evaluateUrlShortener(
    [client, server, db, n("x1", "worker"), n("x2", "cdn"), n("x3", "search")],
    [e("c", "s"), e("s", "d")],
  );
  assert.ok(cluttered.costEfficiency < baseline.costEfficiency);
  assert.ok(
    cluttered.findings.some((f) => f.title === "Remove or connect unused components"),
  );
});

test("every score stays within 0-100", () => {
  const huge = Array.from({ length: 40 }, (_, i) => n(`x${i}`, "worker"));
  const graphs = [
    evaluateUrlShortener([], []),
    evaluateUrlShortener(huge, []),
    evaluateUrlShortener(
      [client, lb, server, server2, n("s3", "server"), db, cache],
      [
        e("c", "lb"),
        e("lb", "s"),
        e("lb", "s2"),
        e("lb", "s3"),
        e("s", "d"),
        e("s", "k"),
      ],
    ),
    evaluateUrlShortener([client, server, db], [e("s", "missing")]),
  ];
  for (const g of graphs) {
    for (const v of [g.scalability, g.reliability, g.latency, g.costEfficiency, g.overallScore]) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, String(v));
    }
  }
});

test("overall score is the rounded average of the four dimensions", () => {
  for (const g of [
    baseline,
    evaluateUrlShortener([], []),
    evaluateUrlShortener(redundantNodes, redundantEdges),
  ]) {
    assert.equal(
      g.overallScore,
      Math.round(
        (g.scalability + g.reliability + g.latency + g.costEfficiency) / 4,
      ),
    );
  }
});

test("the same graph evaluates identically every time", () => {
  const run = () => evaluateUrlShortener(redundantNodes, redundantEdges);
  assert.deepEqual(run(), run());
});

test("findings are ordered warnings, suggestions, then good observations", () => {
  const order = { warning: 0, suggestion: 1, good: 2 };
  const { findings } = evaluateUrlShortener([client, server], [e("c", "s")]);
  const ranks = findings.map((f) => order[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("graph helpers", () => {
  const edges = [e("a", "b"), e("b", "c")];
  assert.ok(hasDirectConnection(edges, "a", "b"));
  assert.ok(!hasDirectConnection(edges, "b", "a"));
  assert.ok(hasPath(edges, "a", "c"));
  assert.ok(!hasPath(edges, "c", "a"));
  assert.deepEqual([...getReachableNodes(edges, "a")].sort(), ["b", "c"]);
  // Cycles terminate.
  assert.ok(hasPath([e("a", "b"), e("b", "a")], "a", "a"));
  assert.equal(
    countConnectedNodes([n("a", "client"), n("b", "server"), n("z", "cache")], edges),
    2,
  );
});
