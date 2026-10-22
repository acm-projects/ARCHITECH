import assert from "node:assert/strict";
import test from "node:test";

import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { composeDesign, readComposeServices } from "../src/lib/github/composeDesign.ts";
import { validateGraph } from "../src/lib/projects/projectPayload.ts";

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));
const edgesOf = (design: NonNullable<ReturnType<typeof composeDesign>>) =>
  new Set(design.graph.edges.map((edge) => `${edge.source}>${edge.target}`));
const node = (design: NonNullable<ReturnType<typeof composeDesign>>, id: string) =>
  design.graph.nodes.find((candidate) => candidate.id === id);

test("each compose service becomes a component, wired the way the services depend on each other", () => {
  const design = composeDesign(
    files({
      "docker-compose.yml": `services:
  vote:
    build: ./vote
    depends_on: [redis]
    ports: ["8080:80"]
  result:
    build: { context: ./result }
    depends_on:
      db: { condition: service_healthy }
    ports: ["8081:80"]
  worker:
    build: ./worker
    depends_on: [redis, db]
  redis:
    image: redis:alpine
  db:
    image: postgres:15-alpine
  seed:
    build: ./seed-data
    profiles: ["seed"]
`,
      "vote/requirements.txt": "flask\nredis\n",
      "result/package.json": JSON.stringify({ dependencies: { express: "4", pg: "8" } }),
      "worker/Dockerfile": "FROM mcr.microsoft.com/dotnet/sdk:7.0\n",
    }),
    ["vote", "result", "worker", "seed-data"],
  )!;
  assert.ok(design);
  assert.deepEqual(design.graph.nodes.map((n) => n.id).sort(), ["client", "db", "redis", "result", "vote", "worker"], "the optional seed job is left out");
  assert.equal(node(design, "vote")?.data.implementation, "python-flask");
  assert.equal(node(design, "result")?.data.implementation, "nodejs-express");
  assert.deepEqual(node(design, "worker")?.data.properties, { technology: ".NET worker", actsAs: "worker", build: "worker" }, "and where it is built, for export");
  assert.equal(node(design, "db")?.data.properties?.image, "postgres:15-alpine");
  assert.deepEqual(
    [...edgesOf(design)].sort(),
    ["client>result", "client>vote", "result>db", "vote>redis", "worker>db", "worker>redis"],
  );
  assert.equal(validateGraph(JSON.parse(JSON.stringify(design.graph))).ok, true);
  // Every component is measured: only the users cost nothing.
  const evaluation = evaluateArchitecture({ graph: design.graph as never, traffic: { requestsPerSecond: 1_000 } });
  assert.deepEqual(evaluation.nodes.filter((n) => n.monthlyCost === 0).map((n) => n.nodeId), ["client"]);
});

test("services found through discovery are reached through the gateway; operations tools are placed but not wired", () => {
  const design = composeDesign(
    files({
      "docker-compose.yml": `services:
  config-server:
    image: acme/petshop-config-server
    ports: ["8888:8888"]
  discovery-server:
    image: acme/petshop-discovery-server
    depends_on: [config-server]
    ports: ["8761:8761"]
  customers-service:
    image: acme/petshop-customers-service
    depends_on: [config-server, discovery-server]
    ports: ["8081:8081"]
  vets-service:
    image: acme/petshop-vets-service
    depends_on: [config-server, discovery-server]
    ports: ["8083:8083"]
  api-gateway:
    image: acme/petshop-api-gateway
    depends_on: [config-server, discovery-server]
    ports: ["8080:8080"]
  tracing-server:
    image: openzipkin/zipkin
    ports: ["9411:9411"]
`,
      "petshop-customers-service/pom.xml": "<artifactId>spring-boot-starter-web</artifactId><artifactId>mysql-connector-j</artifactId>",
      "petshop-vets-service/pom.xml": "<artifactId>spring-boot-starter-web</artifactId>",
    }),
    ["petshop-customers-service", "petshop-vets-service", "petshop-api-gateway", "petshop-config-server"],
  )!;
  const edges = edgesOf(design);
  assert.deepEqual([...edges].filter((edge) => edge.startsWith("client>")), ["client>api-gateway"], "users come in through the gateway only");
  assert.ok(edges.has("api-gateway>customers-service") && edges.has("api-gateway>vets-service"));
  assert.ok(edges.has("customers-service>mysql") && !edges.has("vets-service>mysql"), "the database goes to the service whose code uses it");
  for (const ops of ["config-server", "discovery-server", "tracing-server"]) {
    assert.ok(![...edges].some((edge) => edge.includes(ops)), `${ops} is not on the request path`);
    assert.equal(node(design, ops)?.data.properties?.actsAs, "server", `${ops} is still costed`);
  }
  assert.equal(node(design, "tracing-server")?.data.properties?.technology, "Zipkin");
  assert.equal(node(design, "config-server")?.data.properties?.technology, "Config Server");
  assert.equal(node(design, "api-gateway")?.data.properties?.actsAs, "api-gateway");
  assert.equal(node(design, "customers-service")?.data.implementation, "java-spring-boot");
});

test("repeated consumers become one worker fed by the queue; environment URLs connect services", () => {
  const design = composeDesign(
    files({
      "docker-compose.yml": `x-defaults: &defaults
  image: "$SNUBA_IMAGE"
  depends_on: [kafka, clickhouse]
services:
  snuba-api:
    <<: *defaults
    environment:
      REDIS_URL: redis://redis:6379/0
  errors-consumer: { <<: *defaults }
  outcomes-consumer: { <<: *defaults }
  replays-consumer: { <<: *defaults }
  web:
    build: ./sentry
    ports: ["9000:9000"]
    environment: ["SNUBA=http://snuba-api:1218"]
  kafka:
    image: confluentinc/cp-kafka:7.6
  clickhouse:
    image: clickhouse/clickhouse-server:24
  redis:
    image: redis:7
`,
    }),
    ["sentry"],
  )!;
  const workers = design.graph.nodes.filter((n) => n.data.properties?.actsAs === "worker");
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0]!.data.properties, { technology: "Snuba worker", actsAs: "worker", image: "$SNUBA_IMAGE", replicas: 3 });
  const edges = edgesOf(design);
  assert.ok(edges.has(`kafka>${workers[0]!.id}`), "the queue feeds the consumers");
  assert.ok(edges.has("snuba-api>redis"), "found in REDIS_URL");
  assert.ok(edges.has("web>snuba-api"), "found in SNUBA=http://snuba-api:1218");
  assert.equal(node(design, "clickhouse")?.data.implementation, "clickhouse", "a technology in the catalog is that component");
  assert.equal(node(design, "snuba-api")?.data.properties?.technology, "Snuba");
});

test("a compose file that only starts local databases leaves the design to the code's libraries", () => {
  assert.equal(composeDesign(files({ "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n" })), null);
  assert.equal(composeDesign(files({ "docker-compose.yml": "services: [oops\n" })), null);
  assert.deepEqual(readComposeServices(files({ "docker-compose.yml": "not: compose\n" })), []);
});

test("the compose variant that runs the system is used (Kutt: the Postgres file, not the SQLite-only main file)", async () => {
  const { chooseComposeFile } = await import("../src/lib/github/composeDesign.ts");
  const kutt = files({
    "docker-compose.yml": "services:\n  server:\n    build: .\n    ports: ['3000:3000']\n",
    "docker-compose.postgres.yml": "services:\n  server:\n    build: .\n    depends_on: [postgres, redis]\n    ports: ['3000:3000']\n  postgres:\n    image: postgres\n  redis:\n    image: redis:alpine\n",
    "docker-compose.mariadb.yml": "services:\n  server:\n    build: .\n    depends_on: [mariadb, redis]\n  mariadb:\n    image: mariadb\n  redis:\n    image: redis:alpine\n",
    "docker-compose.ci.yml": "services:\n  a: {image: x}\n  b: {image: y}\n  c: {image: z}\n  d: {image: w}\n",
    "package.json": JSON.stringify({ dependencies: { express: "4", pg: "8", mysql2: "3", "better-sqlite3": "9", ioredis: "5", bull: "4", passport: "0.7" } }),
  });
  assert.equal(chooseComposeFile(kutt), "docker-compose.postgres.yml", "most services wins; CI files are not the system; ties go to PostgreSQL");
  const design = composeDesign(kutt, [])!;
  const kinds = design.graph.nodes.map((n) => `${n.data.type}${n.data.implementation ? `:${n.data.implementation}` : ""}`).sort();
  // The code's MySQL and SQLite drivers are alternatives; bull is a Redis-backed job queue; passport is login inside the app.
  assert.deepEqual(kinds, ["cache:redis", "client", "database:postgresql", "queue:bullmq-queue", "server:nodejs-express"]);
});

test("a test matrix of databases and several runs of the same app become one of each", () => {
  const design = composeDesign(
    files({
      "docker-compose.yml": `services:
  shlink_nginx:
    image: nginx:1.25-alpine
    ports: ["8800:80"]
    depends_on: [shlink_php]
  shlink_php:
    build: { context: . }
    depends_on: [shlink_db_mysql, shlink_db_postgres, shlink_db_maria, shlink_db_ms, shlink_redis]
  shlink_roadrunner:
    build: { context: . }
    ports: ["8888:8080"]
    depends_on: [shlink_db_postgres]
  shlink_db_mysql: { image: "mysql:8.0" }
  shlink_db_postgres: { image: "postgres:16.3-alpine" }
  shlink_db_maria: { image: "mariadb:12.3" }
  shlink_db_ms: { image: "mcr.microsoft.com/mssql/server:2022-latest" }
  shlink_redis: { image: "redis:7.4-alpine" }
`,
      "composer.json": "{}",
    }),
    [],
  )!;
  const ids = design.graph.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, ["client", "shlink-db-postgres", "shlink-nginx", "shlink-php", "shlink-redis"]);
  const edges = edgesOf(design);
  assert.ok(edges.has("client>shlink-nginx") && edges.has("shlink-nginx>shlink-php") && edges.has("shlink-php>shlink-db-postgres"));
  assert.ok(![...edges].some((edge) => edge.startsWith("client>shlink-php")), "the other runs of the app are not separate entry points");
  const evidence = design.detected.find((d) => d.nodeId === "shlink-db-postgres")!.evidence.join(" ");
  assert.match(evidence, /also sets up MySQL, MariaDB, Microsoft SQL Server as alternatives/);
  assert.match(design.detected.find((d) => d.nodeId === "shlink-php")!.evidence.join(" "), /shlink_roadrunner run the same code another way/);
});

test("image paths: a generic image name is matched by its path", async () => {
  const { imagePath, modeledImage } = await import("../src/lib/github/detectStack.ts");
  assert.equal(imagePath("mcr.microsoft.com/mssql/server:2022-latest"), "mssql/server");
  assert.equal(imagePath("localhost:5000/team/api@sha256:abc"), "team/api");
  assert.equal(modeledImage("mcr.microsoft.com/mssql/server:2022-latest")?.implementation, "sql-server");
  assert.equal(modeledImage("acme/server:1"), null, "not every image called server is SQL Server");
  assert.equal(modeledImage("valkey/valkey:8")?.implementation, "valkey");
});
