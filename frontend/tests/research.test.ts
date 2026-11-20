import assert from "node:assert/strict";
import test from "node:test";

import { applyFindings, checkResult, groqResearcher, researchTechnologies, researchableTechnologies } from "../src/lib/ai/research.ts";
import { toDockerCompose } from "../src/lib/architecture/export/dockerCompose.ts";
import { designFromCompose } from "../src/lib/architecture/export/fromCompose.ts";

// A fake Groq + Wikipedia. `answer` is the JSON the one Groq call returns.
function fakeApis(answer: unknown, options: { busy?: number; refuse?: boolean } = {}) {
  const calls: string[] = [];
  let busy = options.busy ?? 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.includes("/w/api.php")) {
      calls.push("wiki-search");
      const query = decodeURIComponent(/srsearch=([^&]+)/.exec(url)![1]!).replace(" software", "");
      return new Response(JSON.stringify({ query: { search: [{ title: query }] } }), { status: 200 });
    }
    if (url.includes("/api/rest_v1/page/summary/")) {
      calls.push("wiki-summary");
      const title = decodeURIComponent(url.split("/summary/")[1]!);
      return new Response(JSON.stringify({ type: "standard", extract: `${title} is a piece of software.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } } }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    calls.push(`groq:${body.model}${body.response_format ? "+json" : ""}`);
    if (busy > 0) {
      busy -= 1;
      return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
    }
    if (options.refuse) return new Response(JSON.stringify({ error: { message: "model not available" } }), { status: 404 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("catalog technologies need no AI call; the rest are read on Wikipedia and classified in ONE call", async () => {
  const { calls, fetchImpl } = fakeApis({
    results: [
      { technology: "Snuba", actsAs: "server", similarTo: "python-django", summary: "Sentry's query service." },
      { technology: "Relay", actsAs: "api-gateway", similarTo: "redis", summary: "An event ingestion proxy." },
    ],
  });
  const researcher = groqResearcher({ GROQ_API_KEY: "k" }, fetchImpl)!;
  const { outcomes, busy } = await researchTechnologies(researcher, [
    { technology: "Pgbouncer", hint: "docker image edoburu/pgbouncer:v1" },
    { technology: "Snuba", hint: "docker image $SNUBA_IMAGE" },
    { technology: "Relay", hint: "" },
  ]);
  assert.equal(busy, undefined);
  assert.equal(calls.filter((call) => call.startsWith("groq")).length, 1, "one Groq call for both unknown technologies");
  assert.equal(calls.filter((call) => call.startsWith("wiki")).length, 4);
  const [pgbouncer, snuba, relay] = outcomes.map((outcome) => outcome.finding!);
  assert.equal(pgbouncer.implementation, "pgbouncer", "known: becomes that component");
  assert.deepEqual(
    { ...snuba, summary: undefined },
    { technology: "Snuba", actsAs: "server", summary: undefined, similarTo: "python-django", capacity: 900, latencyMs: 40, costPerInstance: 42, availability: 0.999, sources: [{ url: "https://en.wikipedia.org/wiki/Snuba" }] },
  );
  assert.equal(relay.similarTo, "amazon-api-gateway", "a similar technology of another role is replaced by the role's standard one");
});

test("Groq's rate limit is waited out; if it stays busy, catalog matches still come back", async () => {
  const answer = { results: [{ technology: "Snuba", actsAs: "server", similarTo: "go-gin" }] };
  const waited = fakeApis(answer, { busy: 1 });
  const ok = await researchTechnologies(groqResearcher({ GROQ_API_KEY: "k" }, waited.fetchImpl)!, [{ technology: "Snuba", hint: "" }]);
  assert.equal(ok.outcomes[0]!.finding?.similarTo, "go-gin");
  assert.equal(waited.calls.filter((call) => call.startsWith("groq")).length, 2, "retried after the wait");

  const stuck = fakeApis(answer, { busy: 10 });
  const partial = await researchTechnologies(groqResearcher({ GROQ_API_KEY: "k" }, stuck.fetchImpl)!, [
    { technology: "ClickHouse", hint: "" },
    { technology: "Snuba", hint: "" },
  ]);
  assert.ok(partial.busy);
  assert.equal(partial.outcomes[0]!.finding?.implementation, "clickhouse");
  assert.equal(partial.outcomes[1]!.finding, null);
  assert.match(partial.outcomes[1]!.error!, /busy/);

  const refused = await researchTechnologies(groqResearcher({ GROQ_API_KEY: "k" }, fakeApis(answer, { refuse: true }).fetchImpl)!, [{ technology: "Snuba", hint: "" }]);
  assert.match(refused.outcomes[0]!.error!, /refused the request \(404\)/);
  assert.equal(groqResearcher({}), null);
});

test("only measurable roles are accepted, and models without JSON mode still work", async () => {
  assert.equal(checkResult("X", { actsAs: "client", similarTo: "web-browser" }, ""), null);
  assert.equal(checkResult("X", "nonsense", ""), null);
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (!url.includes("chat/completions")) return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init?.body));
    calls.push(`${body.model}${body.response_format ? "+json" : ""}`);
    if (body.response_format) return new Response(JSON.stringify({ error: { message: "response_format is not supported" } }), { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Sure: {"results":[{"technology":"Snuba","actsAs":"worker"}]}' } }] }), { status: 200 });
  }) as typeof fetch;
  const { outcomes } = await researchTechnologies(groqResearcher({ GROQ_API_KEY: "k", GROQ_MODEL: "qwen/qwen3-32b" }, fetchImpl)!, [{ technology: "Snuba", hint: "" }]);
  assert.deepEqual(calls, ["qwen/qwen3-32b+json", "qwen/qwen3-32b"]);
  assert.equal(outcomes[0]!.finding?.similarTo, "nodejs-worker", "no similar technology given: the role's standard one");
});

test("findings are written into the import file: known ones become that component, others get numbers", () => {
  const nodes = [
    { id: "users", position: { x: 0, y: 0 }, data: { type: "client", label: "Users" } },
    { id: "pgb", position: { x: 300, y: 0 }, data: { type: "custom", label: "Pgbouncer", properties: { technology: "Pgbouncer", actsAs: "load-balancer", image: "edoburu/pgbouncer", replicas: 2 } } },
    { id: "snuba", position: { x: 300, y: 100 }, data: { type: "custom", label: "Snuba Api", properties: { technology: "Snuba", actsAs: "server", latencyMs: 99, image: "$SNUBA_IMAGE" } } },
    { id: "kong", position: { x: 150, y: 0 }, data: { type: "custom", label: "Kong", properties: { technology: "Kong" } } },
  ];
  const yaml = toDockerCompose({ title: "t", nodes: nodes as never, edges: [{ source: "users", target: "pgb" }] }).yaml + "# my note\n";
  const updated = applyFindings(yaml, [
    { technology: "Pgbouncer", actsAs: "load-balancer", summary: "", implementation: "pgbouncer", sources: [] },
    { technology: "snuba", actsAs: "database", summary: "Query service.", similarTo: "clickhouse", capacity: 20_000, latencyMs: 15, costPerInstance: 180, availability: 0.999, sources: [{ url: "https://en.wikipedia.org/wiki/Snuba" }] },
  ])!;
  assert.match(updated, /# Recognized: PgBouncer, a load balancer \/ proxy in ARCHITECH's technology catalog\./);
  assert.match(updated, /# Looked up: snuba acts like a database\. Numbers are estimates from a similar technology, ClickHouse: 20000 req\/s per instance, 15 ms, \$180\/month per instance, 99\.9% uptime\.\n\s+# Query service\.\n\s+# Source: https:\/\/en\.wikipedia\.org\/wiki\/Snuba/);
  assert.match(updated, /# my note/);
  const read = designFromCompose(updated);
  assert.ok(read.ok, read.ok ? "" : read.error);
  const byId = new Map(read.graph.nodes.map((n) => [n.id, n.data]));
  assert.deepEqual(byId.get("pgb"), { type: "load-balancer", label: "Pgbouncer", implementation: "pgbouncer", properties: { image: "edoburu/pgbouncer", replicas: 2 } });
  assert.deepEqual(byId.get("snuba")?.properties, { technology: "Snuba", actsAs: "database", image: "$SNUBA_IMAGE", capacity: 20_000, latencyMs: 15, costPerInstance: 180, availability: 0.999 });
  assert.equal(byId.get("kong")?.type, "custom", "others are untouched");
  assert.equal(applyFindings("services: [oops", []), null);
});

test("only products are looked up, not the project's own services", () => {
  const block = (label: string, settings: Record<string, string>) => ({ id: label, position: { x: 0, y: 0 }, data: { type: "custom", label, properties: settings } });
  const yaml = toDockerCompose({
    title: "t",
    nodes: [
      block("Config Server", { technology: "Config Server", image: "springcommunity/spring-petclinic-config-server" }),
      block("Tracing Server", { technology: "Zipkin", image: "openzipkin/zipkin" }),
      block("Pgbouncer", { technology: "Pgbouncer", image: "edoburu/pgbouncer:v1" }),
      block("Relay", { technology: "Relay", image: "$RELAY_IMAGE" }),
      block("Worker", { technology: ".NET worker", build: "worker" }),
      block("Clickhouse", { technology: "ClickHouse", build: "clickhouse" }),
    ] as never,
    edges: [],
  }).yaml;
  assert.deepEqual(researchableTechnologies(yaml).map((item) => item.technology), ["Zipkin", "Pgbouncer", "Relay", "ClickHouse"]);
});
