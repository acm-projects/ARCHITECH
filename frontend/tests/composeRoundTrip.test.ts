import assert from "node:assert/strict";
import test from "node:test";

import { toDockerCompose } from "../src/lib/architecture/export/dockerCompose.ts";
import { designFromCompose } from "../src/lib/architecture/export/fromCompose.ts";

const node = (id: string, type: string, x: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "architecture" as const,
  position: { x, y: 40 },
  data: { type, label: id, ...extra },
});
const design = {
  title: "Shop",
  nodes: [
    node("users", "client", 0),
    node("cdn", "cdn", 200),
    node("api", "server", 400, { implementation: "go-service", properties: { replicas: 3 } }),
    node("orders-db", "database", 600, { implementation: "mysql", properties: { replicas: 2, image: "mysql:8.4" } }),
    node("analytics", "custom", 600, { label: "Analytics", properties: { technology: "ClickHouse", actsAs: "database", capacity: 4000, costPerInstance: 300, image: "clickhouse/clickhouse-server:24" } }),
    node("stripe", "custom", 800, { label: "Stripe", properties: { technology: "Stripe" } }),
    node("login", "auth", 800, { implementation: "auth0" }),
  ],
  edges: [
    { id: "a", source: "users", target: "cdn" },
    { id: "b", source: "cdn", target: "api" },
    { id: "c", source: "api", target: "orders-db" },
    { id: "d", source: "api", target: "analytics" },
    { id: "e", source: "api", target: "stripe" },
    { id: "f", source: "api", target: "login" },
  ],
  customTechnologies: [{ id: "stripe", name: "Stripe", evidence: ["package.json uses \"stripe\""], actsAs: "server" as const }],
};
const comparable = (graph: { nodes: { id: string; position: unknown; data: unknown }[]; edges: { source: string; target: string }[]; customTechnologies?: unknown }) => ({
  nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)).map((n) => ({ id: n.id, position: n.position, data: n.data })),
  edges: graph.edges.map((e) => `${e.source}>${e.target}`).sort(),
  customTechnologies: graph.customTechnologies ?? [],
});
const exported = () => toDockerCompose(design as never, new Date("2026-10-21T00:00:00Z")).yaml;

test("a design survives export and import unchanged, and the file still runs as compose", () => {
  const yaml = exported();
  const read = designFromCompose(yaml);
  assert.ok(read.ok, read.ok ? "" : read.error);
  assert.equal(read.title, "Shop");
  assert.deepEqual(read.warnings, []);
  assert.deepEqual(comparable(read.graph as never), comparable(design as never));
  // Imported components keep their images; a custom one that acts like a database runs as one.
  assert.match(yaml, /^ {2}orders-db:\n {4}image: mysql:8\.4$/m);
  assert.match(yaml, /^ {2}analytics:\n {4}image: clickhouse\/clickhouse-server:24$/m);
  // Users, the CDN, Stripe and Auth0 are not containers: they are kept under x-architech.
  assert.match(yaml, /^x-architech:\n {2}version: 1\n {2}title: Shop\n {2}components:\n {4}users:/m);
});

test("edits to the file change the design", () => {
  const yaml = exported()
    .replace("actsAs: database", "actsAs: cache")
    .replace('    - "api -> stripe"\n', "")
    .replace("services:\n", "services:\n  mailer:\n    image: nats:2\n    depends_on: [api]\n");
  const read = designFromCompose(yaml);
  assert.ok(read.ok, read.ok ? "" : read.error);
  const byId = new Map(read.graph.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get("analytics")?.data.properties?.actsAs, "cache");
  assert.ok(!read.graph.edges.some((e) => e.target === "stripe"), "the removed connection is gone");
  // A service added by hand is recognized and connected by its depends_on.
  assert.equal(byId.get("mailer")?.data.implementation, "nats");
  assert.ok(read.graph.edges.some((e) => e.source === "mailer" && e.target === "api"));
  assert.equal(read.warnings.length, 1);
  assert.match(read.warnings[0]!, /"mailer" has no x-architech/);
});

test("problems in the file are explained, never half-imported", () => {
  const yaml = exported();
  const fail = (text: string) => {
    const read = designFromCompose(text);
    assert.equal(read.ok, false, text.slice(0, 80));
    return read.ok ? "" : read.error;
  };
  assert.match(fail("services: [oops\n"), /not valid YAML/);
  assert.match(fail(yaml.replace("version: 1", "version: 9")), /version 9 is not supported/);
  assert.match(fail(yaml.replace("costPerInstance: 300", "costPerInstance: -5")), /not valid/);
  assert.match(fail(yaml.replace("    - \"api -> stripe\"", "    - \"api to stripe\"")), /must look like "source -> target"/);
  assert.match(fail(yaml.replace(/(analytics:\n(?:.*\n)*? {6}type: )custom/, "$1spaceship")), /not valid/);
  const missing = designFromCompose(yaml.replace('"api -> stripe"', '"api -> nowhere"'));
  assert.ok(missing.ok && missing.warnings.some((w) => /no component "nowhere"/.test(w)), "an unknown connection is skipped with a warning");
});

test("any other compose file is recognized, even one with only infrastructure", () => {
  const read = designFromCompose("services:\n  web:\n    image: nginx:1.27\n    ports: ['80:80']\n    depends_on: [db]\n  db:\n    image: postgres:16\n");
  assert.ok(read.ok);
  assert.deepEqual(read.graph.nodes.map((n) => n.data.type).sort(), ["client", "database", "load-balancer"]);
  assert.deepEqual(read.graph.edges.map((e) => `${e.source}>${e.target}`).sort(), ["client>web", "web>db"]);
});
