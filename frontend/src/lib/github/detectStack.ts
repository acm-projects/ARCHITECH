import type { ArchitectureNodeType } from "../architecture/types.ts";
import type { CustomTechnology } from "../projects/customTechnologies.ts";

// Detection rules: which components and technologies a repository uses, from its stack files
// (package.json, docker-compose, Prisma schema, requirements.txt, go.mod, pom.xml...). Pure:
// file contents in, components out, each with the evidence that produced it.
//
// It finds what a repository is built WITH. It cannot know real traffic or exactly how the
// parts talk to each other, so the design built from it is a starting draft to adjust.

export type DetectedComponent = {
  type: ArchitectureNodeType;
  // A component_implementations id, or undefined for the type's default technology.
  implementation?: string;
  label: string;
  // Why it was detected, e.g. 'backend/package.json uses "ioredis"'.
  evidence: string[];
};

type Rule = {
  type: ArchitectureNodeType;
  implementation?: string;
  label: string;
  npm?: string[];
  npmPrefix?: string[];
  python?: string[];
  go?: string[];
  // Matched as text inside pom.xml / build.gradle.
  java?: string[];
  // docker-compose image names (last path segment, without tag).
  images?: string[];
  // Prisma datasource provider.
  prisma?: string[];
};

// Order matters only for labels: the first rule that matches a component names it.
const RULES: Rule[] = [
  // Frontends
  { type: "web-app", implementation: "nextjs", label: "Next.js app", npm: ["next"] },
  { type: "web-app", implementation: "react-spa", label: "React app", npm: ["react-scripts", "@vitejs/plugin-react", "@vitejs/plugin-react-swc"] },
  { type: "mobile-app", label: "Mobile app", npm: ["react-native", "expo"] },
  // API styles
  { type: "api", implementation: "graphql-api", label: "GraphQL API", npm: ["@apollo/server", "apollo-server", "apollo-server-express", "graphql-yoga", "mercurius", "type-graphql", "@nestjs/graphql", "@pothos/core"], python: ["graphene", "strawberry-graphql", "ariadne"], go: ["github.com/99designs/gqlgen", "github.com/graphql-go/graphql"], java: ["spring-boot-starter-graphql", "graphql-java"] },
  { type: "api", implementation: "grpc-api", label: "gRPC API", npm: ["@grpc/grpc-js", "grpc"], python: ["grpcio"], go: ["google.golang.org/grpc"], java: ["grpc-netty", "grpc-stub", "grpc-spring-boot-starter"] },
  { type: "api", implementation: "websocket-api", label: "WebSocket API", npm: ["socket.io", "ws", "@socket.io/redis-adapter"], python: ["websockets", "channels", "python-socketio"], go: ["github.com/gorilla/websocket"], java: ["spring-boot-starter-websocket"] },
  // Services
  { type: "server", implementation: "nodejs-express", label: "Node.js API", npm: ["express", "fastify", "koa", "@nestjs/core", "hono", "@hapi/hapi", "restify"] },
  { type: "server", implementation: "python-fastapi", label: "Python API", python: ["fastapi", "django", "flask", "starlette", "sanic", "aiohttp"] },
  { type: "server", implementation: "go-service", label: "Go service", go: ["github.com/gin-gonic/gin", "github.com/labstack/echo", "github.com/gofiber/fiber", "github.com/go-chi/chi", "github.com/gorilla/mux"] },
  { type: "server", implementation: "java-spring-boot", label: "Spring Boot service", java: ["spring-boot-starter-web", "spring-boot-starter-webflux"] },
  // Front doors
  { type: "load-balancer", implementation: "nginx", label: "NGINX", images: ["nginx"] },
  { type: "load-balancer", implementation: "haproxy", label: "HAProxy", images: ["haproxy"] },
  // Data
  { type: "database", implementation: "postgresql", label: "PostgreSQL", npm: ["pg", "postgres", "@neondatabase/serverless", "@vercel/postgres"], python: ["psycopg2", "psycopg2-binary", "psycopg", "asyncpg"], go: ["github.com/lib/pq", "github.com/jackc/pgx"], java: ["org.postgresql", "postgresql"], images: ["postgres", "postgis"], prisma: ["postgresql"] },
  { type: "database", implementation: "mysql", label: "MySQL", npm: ["mysql", "mysql2"], python: ["pymysql", "mysqlclient"], go: ["github.com/go-sql-driver/mysql"], java: ["mysql-connector"], images: ["mysql", "mariadb"], prisma: ["mysql"] },
  { type: "database", implementation: "mongodb", label: "MongoDB", npm: ["mongodb", "mongoose"], python: ["pymongo", "motor", "mongoengine"], go: ["go.mongodb.org/mongo-driver"], java: ["spring-boot-starter-data-mongodb"], images: ["mongo"], prisma: ["mongodb"] },
  { type: "cache", implementation: "redis", label: "Redis", npm: ["redis", "ioredis", "@upstash/redis"], python: ["redis", "django-redis"], go: ["github.com/redis/go-redis", "github.com/go-redis/redis"], java: ["spring-boot-starter-data-redis", "jedis", "lettuce"], images: ["redis", "valkey"] },
  { type: "cache", implementation: "memcached", label: "Memcached", npm: ["memjs", "memcached"], python: ["pymemcache", "python-memcached"], images: ["memcached"] },
  { type: "queue", implementation: "apache-kafka", label: "Kafka", npm: ["kafkajs", "@confluentinc/kafka-javascript"], python: ["kafka-python", "confluent-kafka", "aiokafka"], go: ["github.com/segmentio/kafka-go", "github.com/IBM/sarama", "github.com/confluentinc/confluent-kafka-go"], java: ["spring-kafka", "kafka-clients"], images: ["kafka", "cp-kafka", "redpanda"] },
  { type: "queue", implementation: "rabbitmq", label: "RabbitMQ", npm: ["amqplib", "amqp-connection-manager"], python: ["pika", "aio-pika", "celery"], go: ["github.com/rabbitmq/amqp091-go", "github.com/streadway/amqp"], java: ["spring-boot-starter-amqp"], images: ["rabbitmq"] },
  { type: "queue", implementation: "amazon-sqs", label: "Amazon SQS", npm: ["@aws-sdk/client-sqs", "sqs-consumer"] },
  { type: "queue", label: "Job queue", npm: ["bullmq", "bull", "bee-queue", "agenda"] },
  { type: "object-storage", implementation: "amazon-s3", label: "Object storage", npm: ["@aws-sdk/client-s3", "@google-cloud/storage", "minio", "@vercel/blob", "@azure/storage-blob"], python: ["boto3", "minio", "google-cloud-storage"], go: ["github.com/aws/aws-sdk-go-v2/service/s3", "github.com/minio/minio-go"], java: ["software.amazon.awssdk:s3", "aws-java-sdk-s3"], images: ["minio", "localstack"] },
  { type: "search", implementation: "elasticsearch", label: "Search", npm: ["@elastic/elasticsearch", "@opensearch-project/opensearch", "meilisearch", "algoliasearch", "typesense"], python: ["elasticsearch", "opensearch-py", "meilisearch"], go: ["github.com/elastic/go-elasticsearch"], java: ["spring-boot-starter-data-elasticsearch"], images: ["elasticsearch", "opensearch", "meilisearch", "typesense"] },
  { type: "auth", implementation: "authjs", label: "Auth.js", npm: ["next-auth", "@auth/core", "lucia", "better-auth", "passport"] },
  { type: "auth", implementation: "auth0", label: "Auth0", npm: ["@auth0/nextjs-auth0", "@auth0/auth0-react", "auth0", "express-openid-connect"] },
  { type: "auth", implementation: "amazon-cognito", label: "Amazon Cognito", npm: ["amazon-cognito-identity-js", "@aws-sdk/client-cognito-identity-provider", "aws-amplify"] },
];

// ---- Reading each kind of file ----

function npmDependencies(text: string): string[] {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const block = json[field];
      if (block && typeof block === "object") for (const name of Object.keys(block)) names.add(name);
    }
    return [...names];
  } catch {
    return [];
  }
}

const PY_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;
function pythonRequirements(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#") && !line.trim().startsWith("-"))
    .map((line) => PY_NAME.exec(line)?.[1]?.toLowerCase())
    .filter((name): name is string => Boolean(name));
}
function pyprojectDependencies(text: string): string[] {
  // Quoted requirement strings ("fastapi>=0.110") and Poetry-style keys (fastapi = "^0.110").
  const quoted = [...text.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=~!;].*?)?["']/g)].map((m) => m[1]);
  const keys = [...text.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:["'{])/gm)].map((m) => m[1]);
  return [...quoted, ...keys].map((name) => name.toLowerCase());
}
function goModules(text: string): string[] {
  return [...text.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+v/gim)].map((m) => m[1]);
}
function composeImages(text: string): string[] {
  return [...text.matchAll(/^\s*image:\s*["']?([^\s"']+)/gm)].map((m) => {
    const withoutTag = m[1].split("@")[0].replace(/:[^/]*$/, "");
    return withoutTag.split("/").pop()!.toLowerCase();
  });
}
function prismaProviders(text: string): string[] {
  const datasource = /datasource\s+\w+\s*\{([\s\S]*?)\}/.exec(text)?.[1] ?? "";
  const provider = /provider\s*=\s*"([^"]+)"/.exec(datasource)?.[1];
  return provider ? [provider] : [];
}

const fileName = (path: string) => path.split("/").pop() ?? path;

// ---- Detection ----

export function detectStack(files: ReadonlyMap<string, string>): DetectedComponent[] {
  const found = new Map<string, DetectedComponent>();
  const add = (rule: Rule, evidence: string) => {
    const key = `${rule.type}:${rule.implementation ?? ""}`;
    const existing = found.get(key);
    if (existing) {
      if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    } else {
      found.set(key, {
        type: rule.type,
        ...(rule.implementation ? { implementation: rule.implementation } : {}),
        label: rule.label,
        evidence: [evidence],
      });
    }
  };

  const paths = [...files.keys()].sort();
  for (const path of paths) {
    const text = files.get(path) as string;
    const name = fileName(path);
    if (name === "package.json") {
      const deps = npmDependencies(text);
      for (const rule of RULES) {
        for (const dep of deps) {
          if (rule.npm?.includes(dep) || rule.npmPrefix?.some((prefix) => dep.startsWith(prefix))) {
            add(rule, `${path} uses "${dep}"`);
          }
        }
      }
    } else if (name === "requirements.txt" || name === "pyproject.toml") {
      const deps = new Set(name === "requirements.txt" ? pythonRequirements(text) : pyprojectDependencies(text));
      for (const rule of RULES) for (const dep of rule.python ?? []) if (deps.has(dep)) add(rule, `${path} uses "${dep}"`);
    } else if (name === "go.mod") {
      const modules = goModules(text);
      let matchedServer = false;
      for (const rule of RULES) {
        for (const prefix of rule.go ?? []) {
          const used = modules.find((m) => m === prefix || m.startsWith(`${prefix}/`) || m.startsWith(`${prefix}v`));
          if (used) {
            add(rule, `${path} uses "${prefix}"`);
            if (rule.type === "server") matchedServer = true;
          }
        }
      }
      // A Go module with no known web framework is still a Go service (net/http).
      if (!matchedServer) add(RULES.find((rule) => rule.implementation === "go-service") as Rule, `${path} is a Go module`);
    } else if (name === "pom.xml" || name.startsWith("build.gradle")) {
      for (const rule of RULES) for (const artifact of rule.java ?? []) if (text.includes(artifact)) add(rule, `${path} uses "${artifact}"`);
    } else if (/^(docker-)?compose\.ya?ml$/.test(name)) {
      const images = new Set(composeImages(text));
      for (const rule of RULES) for (const image of rule.images ?? []) if (images.has(image)) add(rule, `${path} runs the "${image}" image`);
    } else if (name === "schema.prisma") {
      const providers = prismaProviders(text);
      for (const rule of RULES) for (const provider of rule.prisma ?? []) if (providers.includes(provider)) add(rule, `${path} uses provider "${provider}"`);
    }
  }

  const components = [...found.values()];
  const has = (type: ArchitectureNodeType) => components.some((component) => component.type === type);

  // A Next.js app with data but no separate backend serves its API from route handlers.
  const next = components.find((component) => component.implementation === "nextjs");
  const hasData = ["database", "cache", "queue", "object-storage", "search", "auth"].some((type) => has(type as ArchitectureNodeType));
  if (next && !has("server") && hasData) {
    components.push({
      type: "server",
      implementation: "nodejs-express",
      label: "Next.js API routes",
      evidence: [`${next.evidence[0]}: its route handlers act as the backend`],
    });
  }
  // A queue needs something to consume it.
  if (has("queue") && !has("worker")) {
    components.push({ type: "worker", label: "Worker", evidence: ["Consumes the queue (added so queued jobs have a consumer)"] });
  }
  return components;
}

// ---- Technologies the app does not model ----
// Offered in the project's sidebar ("From your repo") as custom components, never placed or
// measured automatically: unknown docker-compose services, and apps written in stacks the
// app has no technology for.

// Base and runtime images that say how something is built, not what runs in the system.
const BUILD_IMAGES = new Set([
  "node", "python", "golang", "go", "alpine", "ubuntu", "debian", "busybox", "centos", "fedora", "amazonlinux",
  "openjdk", "eclipse-temurin", "amazoncorretto", "maven", "gradle", "ruby", "php", "rust", "gcc", "scratch",
  "sdk", "aspnet", "runtime", "runtime-deps", "distroless", "static", "base", "bash", "curl",
]);
// Friendly names for common services the app has no component for.
const KNOWN_NAMES: Record<string, string> = {
  traefik: "Traefik", "clickhouse-server": "ClickHouse", clickhouse: "ClickHouse", keycloak: "Keycloak",
  grafana: "Grafana", prometheus: "Prometheus", jaeger: "Jaeger", "all-in-one": "Jaeger", kong: "Kong",
  consul: "Consul", vault: "Vault", nats: "NATS", zookeeper: "ZooKeeper", "cp-zookeeper": "ZooKeeper",
  cassandra: "Cassandra", neo4j: "Neo4j", influxdb: "InfluxDB", mailhog: "MailHog", mailpit: "Mailpit",
  adminer: "Adminer", pgadmin4: "pgAdmin", envoy: "Envoy", caddy: "Caddy", temporal: "Temporal",
  "cockroach": "CockroachDB", "couchdb": "CouchDB", "etcd": "etcd", "loki": "Loki", "otel-collector": "OpenTelemetry Collector",
  "opentelemetry-collector": "OpenTelemetry Collector", "opentelemetry-collector-contrib": "OpenTelemetry Collector",
};
// Images matched by a detection rule, so they are not "unknown".
const MODELED_IMAGES = new Set(RULES.flatMap((rule) => rule.images ?? []));

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "custom";
const titleCase = (text: string) => text.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.indexOf("/")) : "");

function stackOf(name: string, text: string): string | null {
  if (name === "Cargo.toml") return "Rust service";
  if (name === "Gemfile") return /\brails\b/.test(text) ? "Ruby on Rails app" : "Ruby service";
  if (name === "composer.json") return /laravel\/framework/.test(text) ? "PHP (Laravel)" : /symfony\//.test(text) ? "PHP (Symfony)" : "PHP service";
  if (name === "mix.exs") return /:phoenix\b/.test(text) ? "Elixir (Phoenix)" : "Elixir service";
  if (name === "CMakeLists.txt") return "C++ service";
  if (name === "Dockerfile") {
    const base = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/im.exec(text)?.[1]?.toLowerCase() ?? "";
    if (base.includes("dotnet")) return ".NET service";
    if (/^(rust|.*\/rust)(:|$)/.test(base)) return "Rust service";
    if (/^(elixir|.*\/elixir)(:|$)/.test(base)) return "Elixir service";
    if (/^(ruby|.*\/ruby)(:|$)/.test(base)) return "Ruby service";
    if (/^(php|.*\/php)(:|$)/.test(base)) return "PHP service";
  }
  return null;
}

export function detectUnmodeled(
  files: ReadonlyMap<string, string>,
  repo: { owner: string; name: string } = { owner: "", name: "" },
): CustomTechnology[] {
  const found = new Map<string, CustomTechnology>();
  const add = (name: string, evidence: string) => {
    const id = slug(name);
    const existing = found.get(id);
    if (existing) {
      if (!existing.evidence.includes(evidence) && existing.evidence.length < 5) existing.evidence.push(evidence);
    } else {
      found.set(id, { id, name: name.slice(0, 60), evidence: [evidence] });
    }
  };
  // The repository's own images (e.g. "acme/shop_api") are its code, not a separate service.
  const ownNames = [squash(repo.owner), squash(repo.name)].filter((name) => name.length >= 3);

  for (const path of [...files.keys()].sort()) {
    const text = files.get(path) as string;
    const name = fileName(path);
    if (/^(docker-)?compose\.ya?ml$/.test(name)) {
      for (const match of text.matchAll(/^\s*image:\s*["']?([^\s"']+)/gm)) {
        const image = match[1].split("@")[0].replace(/:[^/]*$/, "");
        const last = image.split("/").pop()!.toLowerCase();
        if (MODELED_IMAGES.has(last) || BUILD_IMAGES.has(last)) continue;
        if (ownNames.some((own) => squash(image).includes(own))) continue;
        add(KNOWN_NAMES[last] ?? titleCase(last), `${path} runs the "${image}" image`);
      }
    } else {
      const stack = stackOf(name, text);
      if (!stack) continue;
      const folder = folderOf(path);
      add(folder ? `${stack} (${folder})` : stack, name === "Dockerfile" ? `${path} builds on a ${stack.replace(/ service$/, "")} image` : `${path} defines a ${stack.replace(/ (service|app)$/, "")} project`);
    }
  }
  return [...found.values()].slice(0, 30);
}
