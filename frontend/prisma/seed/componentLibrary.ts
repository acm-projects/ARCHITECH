// Seed data for the component library: every component type the canvas supports, and the
// technologies (implementations) behind each one.
//
// Component types mirror src/components/workspace/componentCatalog.ts (same ids, labels,
// families and descriptions), so saved graphs keep working: a node's data.type is a
// ComponentType id.
//
// Each type has exactly one default implementation, and its numbers are identical to that
// type's SIMULATION_PROFILES entry in src/lib/architecture/evaluation/capabilities.ts, so
// the metrics engine gives the same results whether it reads the code or the database.
// The README's MVP components (frontend, backend, database, cache, queue, CDN, load
// balancer, authentication) also get alternatives for technology swapping. All numbers are
// educational estimates chosen to make designs compare sensibly, not benchmarks.

export type ComponentFamily = "general" | "frontend" | "backend" | "data" | "infrastructure";

export type ComponentTypeSeed = {
  id: string;
  label: string;
  family: ComponentFamily;
  description: string;
};

export type ComponentImplementationSeed = {
  id: string;
  componentTypeId: string;
  name: string;
  vendor: string | null;
  description: string;
  isDefault: boolean;
  capacityPerInstance: number | null;
  connectionsPerInstance: number | null;
  latencyMs: number;
  monthlyCostPerInstance: number;
  availability: number;
  hitRate: number | null;
  strengths: string[];
  tradeoffs: string[];
};

// Ordered by typical request path, as in the canvas library. sortOrder comes from the index.
export const COMPONENT_TYPES: readonly ComponentTypeSeed[] = [
  { id: "client", label: "Client", family: "frontend", description: "The user-facing device or application that starts a request." },
  { id: "web-app", label: "Web App", family: "frontend", description: "A browser-based frontend that renders the interface and calls backend APIs." },
  { id: "mobile-app", label: "Mobile App", family: "frontend", description: "A native iOS or Android application that calls backend APIs." },
  { id: "cdn", label: "CDN", family: "infrastructure", description: "Serves static content from edge locations close to the user." },
  { id: "dns", label: "DNS", family: "infrastructure", description: "Resolves domain names to the addresses of servers or load balancers." },
  { id: "server", label: "API Server", family: "backend", description: "Runs application logic and handles requests from clients." },
  { id: "api-gateway", label: "API Gateway", family: "backend", description: "Single entry point that routes, authenticates and rate-limits API traffic." },
  { id: "load-balancer", label: "Load Balancer", family: "infrastructure", description: "Distributes incoming traffic across multiple servers." },
  { id: "database", label: "Database", family: "data", description: "Stores persistent application data." },
  { id: "cache", label: "Cache", family: "data", description: "Stores frequently accessed data so requests can be served faster." },
  { id: "queue", label: "Message Queue", family: "data", description: "Buffers messages between services so work can be processed asynchronously." },
  { id: "worker", label: "Worker", family: "backend", description: "Processes background jobs taken from a queue." },
  { id: "object-storage", label: "Object Storage", family: "data", description: "Stores large files such as images, videos and backups." },
  { id: "search", label: "Search", family: "data", description: "Indexes data to answer full-text and filtered queries quickly." },
  { id: "auth", label: "Authentication", family: "backend", description: "Verifies who a user is and issues credentials for later requests." },
];

// Within a type, the default comes first and sortOrder follows array order.
export const COMPONENT_IMPLEMENTATIONS: readonly ComponentImplementationSeed[] = [
  // ---- Client ----
  {
    id: "web-browser", componentTypeId: "client", name: "Web Browser", vendor: null,
    description: "A user's browser or device sending requests.",
    isDefault: true, capacityPerInstance: null, connectionsPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1, hitRate: null,
    strengths: ["Represents real user traffic"],
    tradeoffs: ["Outside your control: slow networks and old devices add latency"],
  },

  // ---- Web App ----
  {
    id: "nextjs", componentTypeId: "web-app", name: "Next.js", vendor: "Vercel",
    description: "React framework with server-side rendering, static generation and API routes.",
    isDefault: true, capacityPerInstance: null, connectionsPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1, hitRate: null,
    strengths: ["Server rendering helps first-load speed and SEO", "Frontend and API routes in one project"],
    tradeoffs: ["Server rendering needs a running server, not just static hosting", "More framework conventions to learn than a plain SPA"],
  },
  {
    id: "react-spa", componentTypeId: "web-app", name: "React SPA (Vite)", vendor: "Meta",
    description: "Single-page React app built with Vite and served as static files.",
    isDefault: false, capacityPerInstance: null, connectionsPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1, hitRate: null,
    strengths: ["Static files: cheap to host and easy to put behind a CDN", "Simple build and deploy"],
    tradeoffs: ["Rendered in the browser, so the first load is slower", "Weaker SEO without extra work"],
  },

  // ---- Mobile App ----
  {
    id: "react-native", componentTypeId: "mobile-app", name: "React Native", vendor: "Meta",
    description: "Cross-platform iOS and Android apps written in React.",
    isDefault: true, capacityPerInstance: null, connectionsPerInstance: null, latencyMs: 0, monthlyCostPerInstance: 0, availability: 1, hitRate: null,
    strengths: ["One codebase for iOS and Android", "Shares skills with the React web app"],
    tradeoffs: ["Some features need native modules", "Releases go through app store review"],
  },

  // ---- CDN ----
  {
    id: "cloudflare-cdn", componentTypeId: "cdn", name: "Cloudflare CDN", vendor: "Cloudflare",
    description: "Global edge network that caches static content and absorbs traffic spikes.",
    isDefault: true, capacityPerInstance: 50_000, connectionsPerInstance: null, latencyMs: 10, monthlyCostPerInstance: 40, availability: 0.9999, hitRate: 0.5,
    strengths: ["Very large edge network", "DDoS protection included"],
    tradeoffs: ["Only helps content that can be cached", "Cache invalidation adds a deploy step"],
  },
  {
    id: "amazon-cloudfront", componentTypeId: "cdn", name: "Amazon CloudFront", vendor: "AWS",
    description: "AWS's CDN, integrated with S3 and other AWS services.",
    isDefault: false, capacityPerInstance: 50_000, connectionsPerInstance: null, latencyMs: 12, monthlyCostPerInstance: 45, availability: 0.9999, hitRate: 0.5,
    strengths: ["Tight integration with S3 and AWS load balancers", "Fine-grained cache rules"],
    tradeoffs: ["Pay-per-request pricing is harder to predict", "Ties the design more closely to AWS"],
  },

  // ---- DNS ----
  {
    id: "amazon-route-53", componentTypeId: "dns", name: "Amazon Route 53", vendor: "AWS",
    description: "Managed DNS with health checks and traffic routing policies.",
    isDefault: true, capacityPerInstance: 100_000, connectionsPerInstance: null, latencyMs: 5, monthlyCostPerInstance: 5, availability: 0.9999, hitRate: 0,
    strengths: ["Highly available managed service", "Health-check-based failover"],
    tradeoffs: ["Record changes take time to spread because of TTLs"],
  },

  // ---- API Server ----
  {
    id: "nodejs-express", componentTypeId: "server", name: "Node.js (Express)", vendor: "OpenJS Foundation",
    description: "JavaScript server on an event loop, good at many concurrent I/O-bound requests.",
    isDefault: true, capacityPerInstance: 2_500, connectionsPerInstance: 20_000, latencyMs: 20, monthlyCostPerInstance: 42, availability: 0.999, hitRate: null,
    strengths: ["Same language as the frontend", "Handles many concurrent I/O-bound requests well"],
    tradeoffs: ["CPU-heavy work blocks the event loop", "Uses one CPU core per process unless clustered"],
  },
  {
    id: "go-service", componentTypeId: "server", name: "Go (net/http)", vendor: "Google",
    description: "Compiled language with lightweight goroutines for high-throughput services.",
    isDefault: false, capacityPerInstance: 6_000, connectionsPerInstance: 20_000, latencyMs: 12, monthlyCostPerInstance: 42, availability: 0.999, hitRate: null,
    strengths: ["High throughput per instance", "Low memory use and fast startup"],
    tradeoffs: ["More verbose for business logic", "Smaller web ecosystem than Node.js"],
  },
  {
    id: "python-fastapi", componentTypeId: "server", name: "Python (FastAPI)", vendor: null,
    description: "Async Python API framework with automatic request validation and docs.",
    isDefault: false, capacityPerInstance: 1_800, connectionsPerInstance: 20_000, latencyMs: 25, monthlyCostPerInstance: 42, availability: 0.999, hitRate: null,
    strengths: ["Fast to develop", "Direct access to Python's data and ML libraries"],
    tradeoffs: ["Lower throughput per instance", "The GIL limits CPU-bound work in one process"],
  },
  {
    id: "java-spring-boot", componentTypeId: "server", name: "Java (Spring Boot)", vendor: "VMware",
    description: "Mature JVM framework widely used for large enterprise backends.",
    isDefault: false, capacityPerInstance: 4_000, connectionsPerInstance: 20_000, latencyMs: 15, monthlyCostPerInstance: 55, availability: 0.999, hitRate: null,
    strengths: ["Strong performance once warmed up", "Large, mature ecosystem"],
    tradeoffs: ["Higher memory use, so larger instances cost more", "Slower startup"],
  },

  // ---- API Gateway ----
  {
    id: "amazon-api-gateway", componentTypeId: "api-gateway", name: "Amazon API Gateway", vendor: "AWS",
    description: "Managed gateway for routing, authentication, throttling and API keys.",
    isDefault: true, capacityPerInstance: 10_000, connectionsPerInstance: 100_000, latencyMs: 8, monthlyCostPerInstance: 54, availability: 0.9995, hitRate: null,
    strengths: ["Fully managed, scales automatically", "Built-in throttling and auth"],
    tradeoffs: ["Adds a hop of latency to every request", "Per-request pricing at high volume"],
  },

  // ---- Load Balancer ----
  {
    id: "nginx", componentTypeId: "load-balancer", name: "NGINX", vendor: "F5",
    description: "Self-hosted reverse proxy and load balancer.",
    isDefault: true, capacityPerInstance: 12_000, connectionsPerInstance: 200_000, latencyMs: 4, monthlyCostPerInstance: 48, availability: 0.9999, hitRate: null,
    strengths: ["Very fast and widely used", "Can also serve static files and terminate TLS"],
    tradeoffs: ["You run, patch and scale it yourself", "It is a single point of failure unless you run two"],
  },
  {
    id: "aws-alb", componentTypeId: "load-balancer", name: "AWS Application Load Balancer", vendor: "AWS",
    description: "Managed layer-7 load balancer with path- and host-based routing.",
    isDefault: false, capacityPerInstance: 15_000, connectionsPerInstance: 250_000, latencyMs: 5, monthlyCostPerInstance: 40, availability: 0.9999, hitRate: null,
    strengths: ["Managed, with health checks and auto scaling built in", "Spread across availability zones automatically"],
    tradeoffs: ["AWS-specific", "Pricing depends on traffic, not just running time"],
  },
  {
    id: "haproxy", componentTypeId: "load-balancer", name: "HAProxy", vendor: "HAProxy Technologies",
    description: "High-performance self-hosted TCP and HTTP load balancer.",
    isDefault: false, capacityPerInstance: 14_000, connectionsPerInstance: 200_000, latencyMs: 3, monthlyCostPerInstance: 45, availability: 0.9999, hitRate: null,
    strengths: ["Very low added latency", "Detailed traffic control and statistics"],
    tradeoffs: ["Self-managed", "Configuration is harder to learn"],
  },

  // ---- Database ----
  {
    id: "postgresql", componentTypeId: "database", name: "PostgreSQL", vendor: "PostgreSQL Global Development Group",
    description: "Open-source relational database with strong consistency and rich SQL.",
    isDefault: true, capacityPerInstance: 5_000, connectionsPerInstance: null, latencyMs: 24, monthlyCostPerInstance: 90, availability: 0.999, hitRate: null,
    strengths: ["ACID transactions and strong consistency", "Powerful queries, joins and indexes", "Read replicas for scaling reads"],
    tradeoffs: ["Writes scale on one primary; sharding is manual", "Schema changes need migrations"],
  },
  {
    id: "mysql", componentTypeId: "database", name: "MySQL", vendor: "Oracle",
    description: "Widely used open-source relational database.",
    isDefault: false, capacityPerInstance: 5_500, connectionsPerInstance: null, latencyMs: 22, monthlyCostPerInstance: 85, availability: 0.999, hitRate: null,
    strengths: ["Fast for simple, read-heavy workloads", "Very widely hosted and supported"],
    tradeoffs: ["Fewer advanced SQL features than PostgreSQL", "Writes still scale on one primary"],
  },
  {
    id: "mongodb", componentTypeId: "database", name: "MongoDB", vendor: "MongoDB Inc.",
    description: "Document database storing flexible JSON-like records.",
    isDefault: false, capacityPerInstance: 6_500, connectionsPerInstance: null, latencyMs: 18, monthlyCostPerInstance: 110, availability: 0.999, hitRate: null,
    strengths: ["Flexible schema for changing data", "Built-in sharding for horizontal scale"],
    tradeoffs: ["Joins and multi-document transactions are weaker", "Easy to end up with inconsistent data shapes"],
  },

  // ---- Cache ----
  {
    id: "redis", componentTypeId: "cache", name: "Redis", vendor: "Redis Ltd.",
    description: "In-memory data store used as a cache, with optional persistence and replication.",
    isDefault: true, capacityPerInstance: 40_000, connectionsPerInstance: null, latencyMs: 1.5, monthlyCostPerInstance: 25, availability: 0.999, hitRate: 0.7,
    strengths: ["Sub-millisecond reads", "Rich data types (lists, sets, sorted sets)", "Replication and optional persistence"],
    tradeoffs: ["Data must fit in memory", "Stale data if invalidation is wrong"],
  },
  {
    id: "memcached", componentTypeId: "cache", name: "Memcached", vendor: null,
    description: "Simple, multithreaded in-memory key-value cache.",
    isDefault: false, capacityPerInstance: 50_000, connectionsPerInstance: null, latencyMs: 1.2, monthlyCostPerInstance: 20, availability: 0.995, hitRate: 0.65,
    strengths: ["Very simple and fast", "Uses multiple CPU cores well"],
    tradeoffs: ["No persistence or replication: a restart empties it", "Only plain key-value strings"],
  },

  // ---- Message Queue ----
  {
    id: "rabbitmq", componentTypeId: "queue", name: "RabbitMQ", vendor: "Broadcom",
    description: "Message broker with flexible routing and per-message acknowledgements.",
    isDefault: true, capacityPerInstance: 8_000, connectionsPerInstance: null, latencyMs: 6, monthlyCostPerInstance: 36, availability: 0.9995, hitRate: null,
    strengths: ["Flexible routing between producers and consumers", "Per-message acknowledgements and retries"],
    tradeoffs: ["Lower throughput than a log like Kafka", "Messages are gone once consumed"],
  },
  {
    id: "apache-kafka", componentTypeId: "queue", name: "Apache Kafka", vendor: "Apache Software Foundation",
    description: "Distributed event log built for very high-throughput streams.",
    isDefault: false, capacityPerInstance: 50_000, connectionsPerInstance: null, latencyMs: 10, monthlyCostPerInstance: 120, availability: 0.9995, hitRate: null,
    strengths: ["Very high throughput", "Keeps events so they can be replayed"],
    tradeoffs: ["More complex to run", "Costly for small workloads"],
  },
  {
    id: "amazon-sqs", componentTypeId: "queue", name: "Amazon SQS", vendor: "AWS",
    description: "Fully managed message queue.",
    isDefault: false, capacityPerInstance: 3_000, connectionsPerInstance: null, latencyMs: 20, monthlyCostPerInstance: 15, availability: 0.9999, hitRate: null,
    strengths: ["Nothing to run or patch", "Cheap at low volume"],
    tradeoffs: ["Higher latency per message", "Standard queues can deliver a message twice or out of order"],
  },

  // ---- Worker ----
  {
    id: "nodejs-worker", componentTypeId: "worker", name: "Node.js Worker", vendor: "OpenJS Foundation",
    description: "Background process that takes jobs from a queue and processes them.",
    isDefault: true, capacityPerInstance: 1_500, connectionsPerInstance: null, latencyMs: 15, monthlyCostPerInstance: 42, availability: 0.999, hitRate: null,
    strengths: ["Takes slow work off the request path", "Scales separately from the API"],
    tradeoffs: ["Jobs need retries and must be safe to run twice"],
  },

  // ---- Object Storage ----
  {
    id: "amazon-s3", componentTypeId: "object-storage", name: "Amazon S3", vendor: "AWS",
    description: "Durable object storage for files, images, videos and backups.",
    isDefault: true, capacityPerInstance: 12_000, connectionsPerInstance: null, latencyMs: 20, monthlyCostPerInstance: 20, availability: 0.9999, hitRate: null,
    strengths: ["Extremely durable", "Cheap per GB and scales without limits"],
    tradeoffs: ["Higher latency than a disk or cache", "Not a database: no queries over file contents"],
  },

  // ---- Search ----
  {
    id: "elasticsearch", componentTypeId: "search", name: "Elasticsearch", vendor: "Elastic",
    description: "Distributed search engine for full-text and filtered queries.",
    isDefault: true, capacityPerInstance: 1_500, connectionsPerInstance: null, latencyMs: 30, monthlyCostPerInstance: 90, availability: 0.999, hitRate: null,
    strengths: ["Fast full-text search and aggregations", "Scales by adding nodes"],
    tradeoffs: ["A second copy of the data that must be kept in sync", "Memory-hungry and costly to run"],
  },

  // ---- Authentication ----
  {
    id: "authjs", componentTypeId: "auth", name: "Auth.js (self-hosted)", vendor: null,
    description: "Open-source authentication library running inside your own app.",
    isDefault: true, capacityPerInstance: 4_000, connectionsPerInstance: null, latencyMs: 10, monthlyCostPerInstance: 30, availability: 0.999, hitRate: null,
    strengths: ["Free and keeps user data in your own database", "Supports many OAuth providers"],
    tradeoffs: ["You own security updates and session handling", "MFA and account recovery are extra work"],
  },
  {
    id: "auth0", componentTypeId: "auth", name: "Auth0", vendor: "Okta",
    description: "Hosted identity platform with login pages, MFA and social logins.",
    isDefault: false, capacityPerInstance: 5_000, connectionsPerInstance: null, latencyMs: 25, monthlyCostPerInstance: 70, availability: 0.9999, hitRate: null,
    strengths: ["MFA, social logins and account recovery out of the box", "Security handled by the provider"],
    tradeoffs: ["Cost grows with active users", "Every login depends on an outside service"],
  },
  {
    id: "amazon-cognito", componentTypeId: "auth", name: "Amazon Cognito", vendor: "AWS",
    description: "AWS-managed user directory and authentication.",
    isDefault: false, capacityPerInstance: 4_000, connectionsPerInstance: null, latencyMs: 20, monthlyCostPerInstance: 40, availability: 0.9999, hitRate: null,
    strengths: ["Integrates with other AWS services", "Generous free tier"],
    tradeoffs: ["Harder to customize than Auth0", "Ties user accounts to AWS"],
  },
];
