import type { ArchitectureNodeType } from "./types.ts";

// The wider technology catalog: hundreds of real technologies behind each component type, so a
// design (or an imported repository) can name what it actually runs, and live metrics measure it.
// Appended to the core library in componentLibrary.ts, which stays the single source of truth.
//
// Numbers are educational estimates on the same scale as the core library, not benchmarks:
//   capacity   requests (or operations) per second one instance handles on a typical
//              production machine for that technology (null: not a bottleneck)
//   latencyMs  added per request when not busy
//   cost       US dollars per month for one instance (a managed service's typical small
//              production tier, or a VM sized for it when self-hosted)
//   uptime     availability of one instance (a managed SLA where published)
//   hitRate    caches and CDNs: share of reads answered there
//   connections  concurrent connections one instance holds, where that is its limit
// `detect` says how a repository import recognizes it (npm, Python, Go and Java packages,
// docker images by name without registry or tag).

export type Detect = { npm?: string[]; python?: string[]; go?: string[]; java?: string[]; images?: string[] };

export type CatalogEntry = {
  id: string;
  componentType: ArchitectureNodeType;
  name: string;
  vendor: string | null;
  description: string;
  isDefault: false;
  capacityPerInstance: number | null;
  connectionsPerInstance: number | null;
  latencyMs: number;
  monthlyCostPerInstance: number;
  availability: number;
  hitRate: number | null;
  strengths: string[];
  tradeoffs: string[];
  detect?: Detect;
};

// [capacity, latencyMs, cost, uptime, hitRate?, connections?]
type Numbers = [number | null, number, number, number, (number | null)?, (number | null)?];

function t(
  componentType: ArchitectureNodeType,
  id: string,
  name: string,
  vendor: string | null,
  description: string,
  [capacity, latencyMs, cost, availability, hitRate = null, connections = null]: Numbers,
  strengths: string[],
  tradeoffs: string[],
  detect?: Detect,
): CatalogEntry {
  return {
    id, componentType, name, vendor, description, isDefault: false,
    capacityPerInstance: capacity, connectionsPerInstance: connections, latencyMs, monthlyCostPerInstance: cost, availability, hitRate,
    strengths, tradeoffs, ...(detect ? { detect } : {}),
  };
}

const FRONTEND: Numbers = [null, 0, 0, 1];
const SERVER_CONNECTIONS = 20_000;
const server = (capacity: number, latencyMs: number, cost = 42): Numbers => [capacity, latencyMs, cost, 0.999, null, SERVER_CONNECTIONS];

export const TECHNOLOGY_CATALOG: readonly CatalogEntry[] = [
  // ---- Clients ----
  t("client", "desktop-app", "Desktop App", null, "A desktop application (Electron, native) calling your APIs.", FRONTEND, ["Rich offline-capable interface"], ["Users update on their own schedule"]),
  t("client", "iot-device", "IoT Device", null, "A sensor or embedded device sending data to your backend.", FRONTEND, ["Huge numbers of small, steady requests"], ["Flaky networks: plan for retries and batching"]),
  t("client", "cli-tool", "CLI / Script", null, "A command-line tool or automated script calling your APIs.", FRONTEND, ["Simple to automate"], ["Bursty, machine-speed traffic"]),
  t("client", "third-party-integration", "Third-party Integration", null, "Another company's system calling your public API or webhooks.", FRONTEND, ["Reaches users through partners"], ["Traffic you do not control; rate-limit it"]),

  // ---- Web apps ----
  t("web-app", "vue", "Vue", "Vue.js team", "Progressive JavaScript framework for interactive single-page apps.", FRONTEND, ["Gentle learning curve", "Small, fast runtime"], ["Smaller job market than React"], { npm: ["vue"] }),
  t("web-app", "nuxt", "Nuxt", "NuxtLabs", "Vue framework with server rendering and static generation.", FRONTEND, ["Server rendering for SEO", "File-based routing"], ["Server rendering needs a Node server"], { npm: ["nuxt"] }),
  t("web-app", "angular", "Angular", "Google", "Full framework for large single-page apps, in TypeScript.", FRONTEND, ["Batteries included", "Strong structure for big teams"], ["Steeper learning curve", "Larger bundles"], { npm: ["@angular/core"] }),
  t("web-app", "sveltekit", "SvelteKit", "Svelte team", "Svelte's app framework: compiled components with server rendering.", FRONTEND, ["Very small bundles", "Simple reactive model"], ["Smaller ecosystem"], { npm: ["@sveltejs/kit"] }),
  t("web-app", "svelte", "Svelte", "Svelte team", "Compiler-based UI framework for single-page apps.", FRONTEND, ["No virtual DOM; tiny output"], ["Smaller ecosystem"], { npm: ["svelte"] }),
  t("web-app", "remix", "Remix / React Router", "Shopify", "React framework built on web standards with server-side data loading.", FRONTEND, ["Fast data loading and forms", "Progressive enhancement"], ["Needs a server runtime"], { npm: ["@remix-run/react", "@react-router/dev"] }),
  t("web-app", "astro", "Astro", "Astro", "Content-focused site framework shipping little JavaScript.", FRONTEND, ["Very fast static pages", "Mix React, Vue or Svelte islands"], ["Less suited to app-like interfaces"], { npm: ["astro"] }),
  t("web-app", "gatsby", "Gatsby", "Netlify", "React static-site generator with a GraphQL data layer.", FRONTEND, ["Fast static sites", "Large plugin ecosystem"], ["Slow builds for big sites", "Less active today"], { npm: ["gatsby"] }),
  t("web-app", "solidjs", "SolidJS", null, "Reactive UI library with fine-grained updates.", FRONTEND, ["Excellent runtime performance"], ["Smaller ecosystem"], { npm: ["solid-js"] }),
  t("web-app", "qwik", "Qwik", "Builder.io", "Framework that resumes apps instead of hydrating them.", FRONTEND, ["Near-instant startup"], ["New and less familiar"], { npm: ["@builder.io/qwik"] }),
  t("web-app", "ember", "Ember.js", null, "Convention-driven framework for ambitious web apps.", FRONTEND, ["Stable conventions"], ["Smaller community today"], { npm: ["ember-source"] }),
  t("web-app", "static-html", "Static HTML/CSS/JS", null, "Plain web pages with no framework.", FRONTEND, ["Simplest to host and cache"], ["Hard to scale to complex interfaces"]),
  t("web-app", "htmx", "htmx (server-rendered)", null, "Server-rendered HTML with htmx for interactivity.", FRONTEND, ["Little JavaScript", "Logic stays on the server"], ["Every interaction is a server round trip"], { npm: ["htmx.org"] }),
  t("web-app", "blazor", "Blazor", "Microsoft", ".NET web UI framework running in WebAssembly or on the server.", FRONTEND, ["C# end to end"], ["Larger first download (WebAssembly)"]),
  t("web-app", "flutter-web", "Flutter Web", "Google", "Flutter apps compiled for the browser.", FRONTEND, ["One codebase with mobile"], ["Large bundles; weaker SEO"]),

  // ---- Mobile apps ----
  t("mobile-app", "swift-ios", "Swift (iOS native)", "Apple", "Native iOS app in Swift / SwiftUI.", FRONTEND, ["Best performance and platform features"], ["iOS only"]),
  t("mobile-app", "kotlin-android", "Kotlin (Android native)", "Google", "Native Android app in Kotlin / Jetpack Compose.", FRONTEND, ["Best performance and platform features"], ["Android only"]),
  t("mobile-app", "flutter", "Flutter", "Google", "Cross-platform UI toolkit in Dart.", FRONTEND, ["One codebase for iOS and Android", "Consistent UI"], ["Dart is less common", "Larger app size"]),
  t("mobile-app", "expo", "Expo (React Native)", "Expo", "React Native with managed builds and over-the-air updates.", FRONTEND, ["Fast setup and updates"], ["Some native modules need custom builds"], { npm: ["expo"] }),
  t("mobile-app", "ionic-capacitor", "Ionic / Capacitor", "Ionic", "Web app packaged as a native mobile app.", FRONTEND, ["Reuse web skills and code"], ["Less native feel and performance"], { npm: ["@capacitor/core", "@ionic/react", "@ionic/angular"] }),
  t("mobile-app", "dotnet-maui", ".NET MAUI", "Microsoft", "Cross-platform native apps in C#.", FRONTEND, ["Share C# with the backend"], ["Smaller mobile community"]),
  t("mobile-app", "kotlin-multiplatform", "Kotlin Multiplatform", "JetBrains", "Shared Kotlin logic with native UIs on each platform.", FRONTEND, ["Native UI, shared business logic"], ["Still two UIs to build"]),

  // ---- CDNs ----
  t("cdn", "fastly", "Fastly", "Fastly", "Programmable edge cloud and CDN with instant purging.", [50_000, 9, 50, 0.9999, 0.94], ["Purges in milliseconds", "Edge compute"], ["Pricier at small scale"]),
  t("cdn", "akamai", "Akamai", "Akamai", "The largest CDN, with deep enterprise security features.", [60_000, 10, 120, 0.9999, 0.95], ["Huge global footprint", "Enterprise security"], ["Expensive; enterprise contracts"]),
  t("cdn", "azure-front-door", "Azure Front Door", "Microsoft", "Azure's global CDN and application delivery network.", [50_000, 12, 50, 0.9999, 0.92], ["Integrated with Azure", "Built-in WAF"], ["Best within Azure"]),
  t("cdn", "google-cloud-cdn", "Google Cloud CDN", "Google", "CDN on Google's edge network, in front of Cloud Load Balancing.", [50_000, 11, 45, 0.9999, 0.93], ["Google's private network"], ["Needs Google's load balancer"]),
  t("cdn", "bunny-cdn", "Bunny CDN", "BunnyWay", "Low-cost CDN with simple per-GB pricing.", [40_000, 12, 15, 0.9995, 0.93], ["Very cheap", "Simple to set up"], ["Smaller network than the giants"]),
  t("cdn", "vercel-edge", "Vercel Edge Network", "Vercel", "Vercel's CDN for frontends deployed on Vercel.", [40_000, 10, 20, 0.9999, 0.9], ["Zero-config for Next.js"], ["Tied to Vercel hosting"]),
  t("cdn", "netlify-edge", "Netlify Edge", "Netlify", "Netlify's CDN for sites deployed on Netlify.", [35_000, 12, 19, 0.9995, 0.9], ["Simple static hosting"], ["Tied to Netlify hosting"]),
  t("cdn", "keycdn", "KeyCDN", "proinity", "Pay-as-you-go CDN.", [35_000, 13, 10, 0.9995, 0.92], ["Cheap and simple"], ["Fewer features"]),
  t("cdn", "gcore-cdn", "Gcore CDN", "Gcore", "Global CDN with strong coverage in Europe and Asia.", [40_000, 12, 25, 0.9995, 0.92], ["Good regional coverage"], ["Smaller ecosystem"]),
  t("cdn", "varnish", "Varnish Cache", "Varnish Software", "Self-hosted HTTP accelerator caching responses in front of your servers.", [30_000, 2, 45, 0.999, 0.8], ["Very fast; fully configurable (VCL)", "Runs anywhere"], ["You run it; no global edge"], { images: ["varnish"] }),

  // ---- DNS ----
  t("dns", "cloudflare-dns", "Cloudflare DNS", "Cloudflare", "Fast authoritative DNS on Cloudflare's network.", [100_000, 4, 0, 1, 0], ["Free tier", "Very fast resolution"], ["Advanced features need paid plans"]),
  t("dns", "google-cloud-dns", "Google Cloud DNS", "Google", "Managed authoritative DNS on Google Cloud.", [100_000, 5, 5, 1, 0], ["100% SLA"], ["Best within Google Cloud"]),
  t("dns", "azure-dns", "Azure DNS", "Microsoft", "Managed DNS hosting in Azure.", [100_000, 5, 5, 1, 0], ["Integrated with Azure"], ["Best within Azure"]),
  t("dns", "ns1", "NS1 (IBM)", "IBM", "Managed DNS with traffic steering.", [100_000, 5, 50, 1, 0], ["Smart traffic routing"], ["Pricey"]),
  t("dns", "dnsimple", "DNSimple", "DNSimple", "Simple managed DNS and domain registration.", [100_000, 6, 10, 0.9999, 0], ["Easy to use"], ["Fewer routing features"]),
  t("dns", "coredns", "CoreDNS", "CNCF", "Self-hosted DNS server, Kubernetes' default.", [50_000, 2, 20, 0.999, 0], ["Flexible plugins", "Service discovery in Kubernetes"], ["You run and secure it"], { images: ["coredns"] }),
  t("dns", "bind", "BIND", "ISC", "The classic self-hosted DNS server.", [40_000, 3, 20, 0.999, 0], ["Mature and standard"], ["Manual operation"], { images: ["bind9"] }),
  // ---- API servers: frameworks and runtimes ----
  t("server", "nodejs-fastify", "Node.js (Fastify)", "OpenJS Foundation", "Fast, low-overhead Node.js web framework.", server(4_000, 15), ["About twice Express's throughput", "Schema-based validation"], ["Smaller plugin ecosystem than Express"], { npm: ["fastify"] }),
  t("server", "nodejs-nestjs", "Node.js (NestJS)", null, "Structured Node.js framework with modules and dependency injection.", server(2_200, 22), ["Clear structure for big teams", "TypeScript first"], ["More boilerplate", "Slightly slower than bare Express"], { npm: ["@nestjs/core"] }),
  t("server", "nodejs-koa", "Node.js (Koa)", null, "Minimal Node.js framework from the Express team.", server(2_800, 18), ["Small and modern"], ["Few batteries included"], { npm: ["koa"] }),
  t("server", "hono", "Hono", null, "Ultrafast web framework for Node, Bun, Deno and edge runtimes.", server(5_000, 12), ["Runs everywhere", "Very fast routing"], ["Younger ecosystem"], { npm: ["hono"] }),
  t("server", "bun", "Bun", "Oven", "Fast JavaScript runtime with a built-in HTTP server.", server(6_000, 10), ["Very fast startup and HTTP"], ["Not every Node package works"], { npm: ["@types/bun", "elysia"] }),
  t("server", "deno", "Deno", "Deno Land", "Secure TypeScript runtime with built-in tooling.", server(4_000, 14), ["TypeScript out of the box", "Secure by default"], ["Smaller ecosystem than Node"]),
  t("server", "python-django", "Python (Django)", "Django Software Foundation", "Batteries-included Python web framework.", server(900, 40), ["Admin, ORM and auth built in", "Fast to build with"], ["Lower throughput per instance"], { python: ["django", "djangorestframework"] }),
  t("server", "python-flask", "Python (Flask)", "Pallets", "Lightweight Python web framework.", server(1_100, 32), ["Simple and flexible"], ["You assemble the pieces"], { python: ["flask"] }),
  t("server", "python-aiohttp", "Python (aiohttp)", null, "Asynchronous Python HTTP server and client.", server(2_000, 22), ["Async I/O for many connections"], ["Lower-level than Django"], { python: ["aiohttp", "sanic"] }),
  t("server", "ruby-on-rails", "Ruby on Rails", "Rails Foundation", "Convention-over-configuration Ruby web framework.", server(800, 45), ["Very productive", "Mature ecosystem (gems)"], ["Lower throughput per instance"]),
  t("server", "ruby-sinatra", "Ruby (Sinatra)", null, "Minimal Ruby web framework.", server(1_200, 35), ["Tiny and simple"], ["Few batteries included"]),
  t("server", "php-laravel", "PHP (Laravel)", "Laravel", "Full-featured PHP framework.", server(900, 40), ["Very productive", "Huge ecosystem"], ["Each request boots the app (unless Octane)"]),
  t("server", "php-symfony", "PHP (Symfony)", "SensioLabs", "Component-based PHP framework.", server(1_000, 38), ["Mature, reusable components"], ["Verbose configuration"]),
  t("server", "dotnet-aspnet-core", "C# (ASP.NET Core)", "Microsoft", "Microsoft's cross-platform web framework.", server(7_000, 10, 50), ["Top-tier throughput", "Great tooling"], ["Heavier runtime than Go"]),
  t("server", "java-quarkus", "Java (Quarkus)", "Red Hat", "Kubernetes-native Java with fast startup and low memory.", server(5_000, 12, 50), ["Fast startup", "Native images"], ["Smaller ecosystem than Spring"], { java: ["io.quarkus"] }),
  t("server", "java-micronaut", "Java (Micronaut)", "Oracle Labs", "JVM framework with compile-time dependency injection.", server(4_800, 12, 50), ["Low memory, fast startup"], ["Smaller community"], { java: ["io.micronaut"] }),
  t("server", "java-vertx", "Java (Vert.x)", "Eclipse Foundation", "Reactive, event-driven JVM toolkit.", server(8_000, 8, 50), ["Very high concurrency"], ["Reactive code is harder to write"], { java: ["io.vertx"] }),
  t("server", "kotlin-ktor", "Kotlin (Ktor)", "JetBrains", "Asynchronous Kotlin web framework.", server(5_000, 11, 50), ["Concise Kotlin with coroutines"], ["Smaller ecosystem"], { java: ["io.ktor"] }),
  t("server", "scala-play", "Scala (Play / Akka HTTP)", "Lightbend", "Reactive Scala web frameworks.", server(5_000, 12, 55), ["High concurrency"], ["Scala's learning curve"], { java: ["com.typesafe.play", "akka-http"] }),
  t("server", "elixir-phoenix", "Elixir (Phoenix)", null, "Elixir web framework on the Erlang VM.", server(4_000, 12), ["Millions of connections (channels)", "Fault tolerant"], ["Smaller hiring pool"]),
  t("server", "rust-actix", "Rust (Actix Web)", null, "High-performance Rust web framework.", server(10_000, 6), ["Among the fastest frameworks", "Memory safe"], ["Slower to write and compile"]),
  t("server", "rust-axum", "Rust (Axum)", "Tokio", "Ergonomic Rust web framework on Tokio.", server(9_500, 6), ["Very fast, memory safe"], ["Rust's learning curve"]),
  t("server", "go-gin", "Go (Gin)", null, "The most popular Go web framework.", server(6_500, 11), ["Fast and simple", "Big community"], ["Less structure for big apps"], { go: ["github.com/gin-gonic/gin"] }),
  t("server", "go-fiber", "Go (Fiber)", null, "Express-style Go framework on fasthttp.", server(7_500, 10), ["Very fast"], ["fasthttp is not fully net/http compatible"], { go: ["github.com/gofiber/fiber"] }),
  t("server", "go-echo", "Go (Echo)", "LabStack", "Minimal, fast Go web framework.", server(6_500, 11), ["Fast with good middleware"], ["Smaller than Gin"], { go: ["github.com/labstack/echo"] }),
  t("server", "cpp-drogon", "C++ (Drogon)", null, "High-performance C++ web framework.", server(12_000, 5), ["Extremely fast"], ["C++ is slow to develop safely"]),
  t("server", "swift-vapor", "Swift (Vapor)", null, "Server-side Swift web framework.", server(5_000, 12), ["Share Swift with iOS apps"], ["Small server-side community"]),
  t("server", "aws-lambda", "AWS Lambda", "AWS", "Serverless functions that scale per request; you pay per call.", [1_000, 35, 30, 0.9995, null, 1_000], ["No servers to manage", "Scales to zero"], ["Cold starts add latency", "Per-request cost grows with traffic"]),
  t("server", "google-cloud-run", "Google Cloud Run", "Google", "Serverless containers that scale with requests.", [2_000, 25, 40, 0.9995, null, 1_000], ["Any container, scales to zero"], ["Cold starts"]),
  t("server", "azure-functions", "Azure Functions", "Microsoft", "Serverless functions on Azure.", [1_000, 35, 30, 0.9995, null, 1_000], ["Integrated with Azure"], ["Cold starts on the consumption plan"]),
  t("server", "cloudflare-workers", "Cloudflare Workers", "Cloudflare", "Serverless JavaScript at the edge, close to users.", [3_000, 5, 25, 0.9999, null, 10_000], ["Runs near users", "No cold starts to speak of"], ["Limited CPU time per request", "Not every Node API"], { npm: ["wrangler"] }),
  t("server", "vercel-functions", "Vercel Functions", "Vercel", "Serverless functions deployed with a Vercel frontend.", [1_000, 30, 25, 0.9995, null, 1_000], ["Zero config with Next.js"], ["Execution time limits"]),
  t("server", "kubernetes-pod", "Container on Kubernetes", "CNCF", "Your service as containers in a Kubernetes cluster.", server(2_500, 20, 60), ["Portable, self-healing, autoscaling"], ["Cluster operations are complex"]),

  // ---- Workers ----
  t("worker", "python-celery", "Python (Celery)", null, "Distributed task queue workers for Python.", [600, 40, 42, 0.999], ["Retries, scheduling and routing built in"], ["Python is slower per task"], { python: ["celery", "rq", "dramatiq"] }),
  t("worker", "ruby-sidekiq", "Ruby (Sidekiq)", "Contributed Systems", "Background job workers for Ruby on Redis.", [1_000, 25, 42, 0.999], ["Efficient threads", "Great Rails integration"], ["Needs Redis"]),
  t("worker", "go-worker", "Go worker", "Google", "Background workers written in Go.", [5_000, 8, 42, 0.999], ["High throughput, small memory"], ["You build retries and scheduling"]),
  t("worker", "java-worker", "Java worker (Spring)", "VMware", "JVM background consumers (Spring Kafka, Spring Batch).", [3_500, 12, 55, 0.999], ["Mature libraries"], ["Heavier memory use"], { java: ["spring-batch-core"] }),
  t("worker", "dotnet-worker", ".NET Worker Service", "Microsoft", "Background services in C#.", [4_500, 10, 50, 0.999], ["Fast and well tooled"], ["Windows/.NET hosting knowledge"]),
  t("worker", "rust-worker", "Rust worker", null, "Background workers written in Rust.", [8_000, 5, 42, 0.999], ["Highest throughput per instance"], ["Slower to develop"]),
  t("worker", "php-laravel-queue", "PHP (Laravel Queues)", "Laravel", "Laravel's queue workers.", [500, 40, 42, 0.999], ["Built into Laravel"], ["Low throughput per worker"]),
  t("worker", "elixir-oban", "Elixir (Oban)", null, "Job processing for Elixir on PostgreSQL.", [3_000, 12, 42, 0.999], ["Reliable, uses your database"], ["Elixir only"]),
  t("worker", "dotnet-hangfire", ".NET (Hangfire)", null, "Background jobs for .NET with a dashboard.", [1_500, 20, 50, 0.999], ["Easy scheduling and dashboard"], ["Storage-backed: limited throughput"]),
  t("worker", "temporal-worker", "Temporal worker", "Temporal Technologies", "Durable workflow workers that survive crashes and retries.", [1_000, 30, 60, 0.9995], ["Long-running, reliable workflows"], ["Needs a Temporal cluster"], { npm: ["@temporalio/worker"], python: ["temporalio"], go: ["go.temporal.io/sdk"], java: ["io.temporal"] }),
  t("worker", "aws-lambda-worker", "AWS Lambda (event-driven)", "AWS", "Functions triggered by queue messages or events.", [1_000, 35, 30, 0.9995], ["No servers; scales with the queue"], ["Time limits per invocation"]),
  t("worker", "bullmq-worker", "Node.js (BullMQ)", "Taskforce.sh", "Redis-backed job workers for Node.js.", [2_000, 12, 42, 0.999], ["Rate limiting, retries, delays"], ["Needs Redis"], { npm: ["bullmq", "bull"] }),

  // ---- API gateways ----
  t("api-gateway", "kong", "Kong Gateway", "Kong", "Open-source API gateway on NGINX with plugins.", [12_000, 4, 60, 0.9995, null, 100_000], ["Huge plugin library", "Self-host or cloud"], ["Plugins add latency"], { images: ["kong", "kong-gateway"] }),
  t("api-gateway", "apigee", "Apigee", "Google", "Google's enterprise API management platform.", [10_000, 10, 500, 0.9999, null, 100_000], ["Analytics, monetization, policies"], ["Expensive"]),
  t("api-gateway", "azure-api-management", "Azure API Management", "Microsoft", "Azure's managed API gateway and developer portal.", [8_000, 10, 150, 0.9995, null, 100_000], ["Developer portal included"], ["Higher tiers are costly"]),
  t("api-gateway", "google-api-gateway", "Google API Gateway", "Google", "Managed gateway for Google Cloud backends.", [10_000, 9, 40, 0.9995, null, 100_000], ["Simple, pay per call"], ["Fewer policies than Apigee"]),
  t("api-gateway", "tyk", "Tyk", "Tyk Technologies", "Open-source API gateway written in Go.", [12_000, 4, 50, 0.9995, null, 100_000], ["Fast, batteries included"], ["Dashboard needs a license"], { images: ["tyk-gateway"] }),
  t("api-gateway", "krakend", "KrakenD", "KrakenD", "Stateless, high-performance API gateway that aggregates backends.", [20_000, 2, 45, 0.9995, null, 100_000], ["Very fast; combines responses"], ["Configuration-file driven"], { images: ["krakend"] }),
  t("api-gateway", "spring-cloud-gateway", "Spring Cloud Gateway", "VMware", "API gateway for Spring microservices.", [8_000, 6, 55, 0.999, null, 50_000], ["Fits Spring and service discovery"], ["JVM memory use"], { java: ["spring-cloud-starter-gateway"] }),
  t("api-gateway", "netflix-zuul", "Zuul", "Netflix", "Netflix's JVM edge gateway.", [6_000, 8, 55, 0.999, null, 50_000], ["Proven at Netflix scale"], ["Superseded by Spring Cloud Gateway"], { java: ["spring-cloud-starter-netflix-zuul"] }),
  t("api-gateway", "envoy-gateway", "Envoy Gateway", "CNCF", "Kubernetes Gateway API on Envoy.", [15_000, 3, 50, 0.9995, null, 100_000], ["Modern, Kubernetes-native"], ["Kubernetes required"]),
  t("api-gateway", "aws-appsync", "AWS AppSync", "AWS", "Managed GraphQL API with real-time subscriptions.", [6_000, 15, 60, 0.9995, null, 100_000], ["Managed GraphQL and subscriptions"], ["AWS-specific resolvers"]),
  t("api-gateway", "apollo-router", "Apollo Router", "Apollo", "GraphQL federation gateway joining many subgraphs.", [10_000, 4, 50, 0.9995, null, 100_000], ["One graph over many services"], ["Federation adds complexity"]),
  t("api-gateway", "gloo-gateway", "Gloo Gateway", "Solo.io", "Envoy-based API gateway for Kubernetes.", [15_000, 3, 60, 0.9995, null, 100_000], ["Envoy performance, rich policies"], ["Enterprise features are paid"]),

  // ---- API protocols ----
  t("api", "sse-api", "Server-Sent Events", null, "One-way streaming from server to browser over HTTP.", [10_000, 2, 35, 0.999, null, 50_000], ["Simple live updates", "Works through proxies"], ["Server to client only"]),
  t("api", "trpc-api", "tRPC", null, "End-to-end typed APIs for TypeScript apps.", [7_000, 3, 30, 0.9995], ["Types shared between client and server"], ["TypeScript clients only"], { npm: ["@trpc/server"] }),
  t("api", "json-rpc-api", "JSON-RPC", null, "Remote procedure calls encoded as JSON.", [8_000, 3, 30, 0.9995], ["Simple and language-neutral"], ["No caching semantics like REST"]),
  t("api", "soap-api", "SOAP", null, "XML web services with formal contracts (WSDL).", [3_000, 8, 36, 0.9995], ["Strict contracts; enterprise standard"], ["Verbose XML, slow"]),
  t("api", "mqtt-api", "MQTT", "OASIS", "Lightweight publish/subscribe protocol for devices.", [20_000, 2, 40, 0.999, null, 100_000], ["Tiny messages for IoT", "Many persistent connections"], ["Needs a broker"]),
  t("api", "webhooks-api", "Webhooks", null, "Your service calls other systems when events happen.", [5_000, 5, 30, 0.999], ["Push instead of polling"], ["Receivers fail; needs retries"]),

  // ---- Load balancers and proxies ----
  t("load-balancer", "envoy", "Envoy", "CNCF", "High-performance L7 proxy used by service meshes.", [15_000, 2, 48, 0.9999, null, 200_000], ["Advanced routing, retries, observability"], ["Complex configuration"], { images: ["envoy", "envoyproxy"] }),
  t("load-balancer", "traefik", "Traefik", "Traefik Labs", "Cloud-native reverse proxy that configures itself from Docker and Kubernetes.", [10_000, 3, 40, 0.9995, null, 150_000], ["Automatic service discovery and TLS"], ["Lower peak throughput than NGINX"], { images: ["traefik"] }),
  t("load-balancer", "caddy", "Caddy", null, "Web server and reverse proxy with automatic HTTPS.", [9_000, 3, 35, 0.9995, null, 150_000], ["HTTPS by default", "Simple config"], ["Smaller ecosystem than NGINX"], { images: ["caddy"] }),
  t("load-balancer", "aws-nlb", "AWS Network Load Balancer", "AWS", "Layer-4 load balancer for millions of requests per second.", [50_000, 1, 40, 0.9999, null, 1_000_000], ["Extremely high throughput, static IPs"], ["No HTTP-level routing"]),
  t("load-balancer", "gcp-load-balancer", "Google Cloud Load Balancing", "Google", "Global anycast load balancing on Google's network.", [20_000, 4, 40, 0.9999, null, 300_000], ["One global IP"], ["Best within Google Cloud"]),
  t("load-balancer", "azure-application-gateway", "Azure Application Gateway", "Microsoft", "Azure's L7 load balancer with WAF.", [12_000, 5, 50, 0.9995, null, 200_000], ["Built-in WAF"], ["Slower to change configuration"]),
  t("load-balancer", "azure-load-balancer", "Azure Load Balancer", "Microsoft", "Azure's layer-4 load balancer.", [40_000, 1, 25, 0.9999, null, 1_000_000], ["Fast and cheap"], ["No HTTP routing"]),
  t("load-balancer", "ingress-nginx", "Kubernetes Ingress (NGINX)", "CNCF", "NGINX as the Kubernetes ingress controller.", [12_000, 4, 48, 0.9995, null, 200_000], ["Standard for Kubernetes"], ["Kubernetes required"]),
  t("load-balancer", "f5-big-ip", "F5 BIG-IP", "F5", "Enterprise application delivery controller.", [30_000, 2, 400, 0.99995, null, 1_000_000], ["Hardware-grade performance and security"], ["Very expensive"]),
  t("load-balancer", "cloudflare-load-balancing", "Cloudflare Load Balancing", "Cloudflare", "Global load balancing with health checks at Cloudflare's edge.", [30_000, 3, 25, 0.9999, null, 500_000], ["Global failover"], ["Traffic must go through Cloudflare"]),
  t("load-balancer", "digitalocean-lb", "DigitalOcean Load Balancer", "DigitalOcean", "Simple managed load balancer.", [10_000, 4, 12, 0.9999, null, 100_000], ["Cheap and simple"], ["Fewer features"]),
  t("load-balancer", "pgbouncer", "PgBouncer", null, "Connection pooler in front of PostgreSQL.", [30_000, 1, 15, 0.999, null, 10_000], ["Thousands of client connections onto few database ones"], ["Transaction pooling limits some features"], { images: ["pgbouncer"] }),
  t("load-balancer", "proxysql", "ProxySQL", "ProxySQL", "MySQL-aware proxy for pooling and read/write splitting.", [25_000, 1, 20, 0.999, null, 10_000], ["Routes reads to replicas"], ["Another layer to operate"], { images: ["proxysql"] }),
  t("load-balancer", "apache-httpd", "Apache HTTP Server", "Apache Software Foundation", "The classic web server as a reverse proxy.", [6_000, 5, 40, 0.999, null, 50_000], ["Mature with many modules"], ["Lower concurrency than NGINX"], { images: ["httpd"] }),
  // ---- Databases: relational ----
  t("database", "mariadb", "MariaDB", "MariaDB Foundation", "Community fork of MySQL.", [5_500, 22, 80, 0.999], ["Drop-in MySQL replacement", "Open governance"], ["Diverging from MySQL over time"], { images: ["mariadb"] }),
  t("database", "sql-server", "Microsoft SQL Server", "Microsoft", "Enterprise relational database from Microsoft.", [6_000, 20, 250, 0.9995], ["Excellent tooling, strong enterprise features"], ["Licensing cost"], { images: ["mssql/server", "mssql-server"], npm: ["mssql", "tedious"], python: ["pyodbc", "pymssql"], java: ["mssql-jdbc"] }),
  t("database", "oracle-database", "Oracle Database", "Oracle", "Enterprise relational database.", [7_000, 20, 600, 0.9999], ["Very mature, powerful features"], ["Expensive licensing"], { npm: ["oracledb"], python: ["oracledb", "cx_oracle"], java: ["ojdbc"] }),
  t("database", "amazon-aurora-postgresql", "Amazon Aurora (PostgreSQL)", "AWS", "AWS's managed PostgreSQL-compatible database with fast replicas.", [8_000, 20, 200, 0.9999], ["Fast failover, up to 15 replicas", "Storage grows automatically"], ["Costlier than plain RDS"]),
  t("database", "amazon-aurora-mysql", "Amazon Aurora (MySQL)", "AWS", "AWS's managed MySQL-compatible database.", [8_500, 18, 190, 0.9999], ["Fast failover and replicas"], ["Costlier than plain RDS"]),
  t("database", "amazon-rds-postgresql", "Amazon RDS for PostgreSQL", "AWS", "Managed PostgreSQL on AWS.", [5_000, 24, 120, 0.9995], ["Backups and patching handled"], ["Less flexible than self-hosting"]),
  t("database", "google-cloud-sql", "Google Cloud SQL", "Google", "Managed PostgreSQL, MySQL or SQL Server on Google Cloud.", [5_000, 24, 110, 0.9995], ["Fully managed"], ["Best within Google Cloud"]),
  t("database", "azure-sql", "Azure SQL Database", "Microsoft", "Managed SQL Server in Azure.", [6_000, 20, 150, 0.9999], ["Serverless option; high SLA"], ["SQL Server dialect"]),
  t("database", "alloydb", "AlloyDB", "Google", "Google's high-performance PostgreSQL-compatible database.", [12_000, 15, 300, 0.9999], ["Fast analytics on transactional data"], ["Google Cloud only; pricey"]),
  t("database", "cockroachdb", "CockroachDB", "Cockroach Labs", "Distributed SQL database that survives zone and region failures.", [4_000, 30, 250, 0.9999], ["Horizontal writes with strong consistency", "Multi-region"], ["Higher latency per write", "Costly at scale"], { images: ["cockroach"], go: ["github.com/cockroachdb/cockroach-go"] }),
  t("database", "yugabytedb", "YugabyteDB", "Yugabyte", "Distributed PostgreSQL-compatible database.", [5_000, 28, 220, 0.9999], ["PostgreSQL API with horizontal scale"], ["More moving parts than PostgreSQL"], { images: ["yugabyte"] }),
  t("database", "tidb", "TiDB", "PingCAP", "Distributed MySQL-compatible database for transactions and analytics.", [6_000, 25, 220, 0.9999], ["Scales out MySQL workloads"], ["Several components to run"], { images: ["tidb"] }),
  t("database", "google-spanner", "Google Cloud Spanner", "Google", "Globally distributed, strongly consistent relational database.", [10_000, 15, 650, 0.99999], ["Global consistency, five-nines SLA"], ["Expensive; Google only"]),
  t("database", "planetscale", "PlanetScale", "PlanetScale", "Serverless MySQL (Vitess) with branching.", [8_000, 18, 39, 0.9999], ["Horizontal sharding (Vitess)", "Schema branching"], ["No foreign keys by default"], { npm: ["@planetscale/database"] }),
  t("database", "neon", "Neon", "Databricks", "Serverless PostgreSQL that scales to zero, with branching.", [4_000, 25, 19, 0.9995], ["Scales to zero; branches per PR"], ["Cold starts after idling"], { npm: ["@neondatabase/serverless"] }),
  t("database", "supabase-postgres", "Supabase (PostgreSQL)", "Supabase", "Hosted PostgreSQL with auth, storage and APIs.", [4_000, 25, 25, 0.999], ["Full backend platform on Postgres"], ["Platform coupling"], { npm: ["@supabase/supabase-js"], python: ["supabase"] }),
  t("database", "vitess", "Vitess", "CNCF", "Sharding layer for MySQL, born at YouTube.", [20_000, 20, 300, 0.9995], ["Massive horizontal MySQL"], ["Complex to operate"], { images: ["vitess"] }),
  t("database", "sqlite", "SQLite", null, "Embedded file-based SQL database.", [2_000, 2, 0, 0.995], ["Zero setup, very fast locally"], ["One writer at a time; one machine"], { npm: ["better-sqlite3", "sqlite3"], python: ["aiosqlite"] }),
  t("database", "turso", "Turso (libSQL)", "Turso", "Distributed SQLite with edge replicas.", [5_000, 10, 29, 0.9995], ["SQLite close to users"], ["SQLite's single-writer model"], { npm: ["@libsql/client"] }),
  t("database", "ibm-db2", "IBM Db2", "IBM", "Enterprise relational database.", [6_000, 20, 500, 0.9999], ["Mainframe-grade reliability"], ["Expensive; niche skills"]),

  // ---- Databases: NoSQL ----
  t("database", "cassandra", "Apache Cassandra", "Apache Software Foundation", "Wide-column database for huge write volumes across data centers.", [15_000, 8, 200, 0.9999], ["Linear write scaling", "No single point of failure"], ["Queries must be designed up front", "Eventual consistency"], { images: ["cassandra"], npm: ["cassandra-driver"], python: ["cassandra-driver"], go: ["github.com/gocql/gocql"], java: ["java-driver-core", "spring-boot-starter-data-cassandra"] }),
  t("database", "scylladb", "ScyllaDB", "ScyllaDB", "Cassandra-compatible database rewritten in C++ for speed.", [40_000, 3, 250, 0.9999], ["Several times Cassandra's throughput"], ["Same data-modeling limits"], { images: ["scylla"] }),
  t("database", "amazon-dynamodb", "Amazon DynamoDB", "AWS", "Serverless key-value and document database.", [20_000, 8, 150, 0.99999], ["Single-digit ms at any scale", "No servers to manage"], ["Access patterns must be designed up front", "Costs grow with traffic"], { npm: ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb", "dynamoose"], python: ["pynamodb"], go: ["github.com/aws/aws-sdk-go-v2/service/dynamodb"], images: ["dynamodb-local"] }),
  t("database", "azure-cosmos-db", "Azure Cosmos DB", "Microsoft", "Globally distributed multi-model database.", [15_000, 10, 200, 0.99999], ["Global replication, tunable consistency"], ["Request-unit pricing gets expensive"], { npm: ["@azure/cosmos"], python: ["azure-cosmos"] }),
  t("database", "google-firestore", "Google Firestore", "Google", "Serverless document database with real-time sync.", [10_000, 15, 60, 0.99999], ["Real-time listeners", "Offline support"], ["Limited queries; per-operation pricing"], { npm: ["firebase-admin", "@google-cloud/firestore"], python: ["google-cloud-firestore"] }),
  t("database", "google-bigtable", "Google Bigtable", "Google", "Wide-column database for huge analytical and time-series loads.", [10_000, 6, 470, 0.9999], ["Petabyte scale, low latency"], ["Minimum cluster cost"]),
  t("database", "couchbase", "Couchbase", "Couchbase", "Document database with a built-in memory cache.", [20_000, 4, 180, 0.9995], ["Fast key-value plus SQL-like queries"], ["Memory hungry"], { images: ["couchbase"], npm: ["couchbase"] }),
  t("database", "couchdb", "Apache CouchDB", "Apache Software Foundation", "Document database built for replication and offline sync.", [3_000, 15, 60, 0.999], ["Multi-master sync"], ["Slower queries"], { images: ["couchdb"], npm: ["nano"] }),
  t("database", "apache-hbase", "Apache HBase", "Apache Software Foundation", "Wide-column store on Hadoop.", [10_000, 10, 250, 0.999], ["Huge tables"], ["Hadoop operations"], { images: ["hbase"] }),
  t("database", "neo4j", "Neo4j", "Neo4j", "Graph database for highly connected data.", [3_000, 12, 150, 0.9995], ["Fast relationship queries (Cypher)"], ["Harder to scale writes"], { images: ["neo4j"], npm: ["neo4j-driver"], python: ["neo4j"], java: ["neo4j-java-driver"] }),
  t("database", "arangodb", "ArangoDB", "ArangoDB", "Multi-model database: documents, graphs and key-value.", [5_000, 10, 120, 0.999], ["One engine for several models"], ["Smaller community"], { images: ["arangodb"], npm: ["arangojs"] }),
  t("database", "ravendb", "RavenDB", "Hibernating Rhinos", "Document database for .NET with ACID transactions.", [8_000, 8, 120, 0.999], ["ACID documents"], [".NET-centred community"], { images: ["ravendb"] }),
  t("database", "surrealdb", "SurrealDB", "SurrealDB", "Multi-model database with a SQL-like query language.", [5_000, 10, 80, 0.999], ["Documents, graphs and real-time queries"], ["Young project"], { images: ["surrealdb"], npm: ["surrealdb"] }),
  t("database", "faunadb", "Fauna", "Fauna", "Serverless, globally consistent document database.", [5_000, 20, 50, 0.9999], ["Global consistency without servers"], ["Proprietary query language"], { npm: ["faunadb", "fauna"] }),
  t("database", "aerospike", "Aerospike", "Aerospike", "Flash-optimized key-value store for real-time workloads.", [100_000, 1, 300, 0.99995], ["Millions of ops per second on SSDs"], ["Enterprise features are paid"], { images: ["aerospike"] }),
  t("database", "foundationdb", "FoundationDB", "Apple", "Ordered key-value store with ACID transactions.", [20_000, 5, 200, 0.9999], ["Rock-solid transactions"], ["Low-level: build your own layers"], { images: ["foundationdb"] }),
  t("database", "etcd-store", "etcd", "CNCF", "Consistent key-value store for configuration and coordination.", [10_000, 3, 40, 0.9999], ["Strong consistency (Raft)"], ["Small data only"]),
  t("database", "firebase-realtime-database", "Firebase Realtime Database", "Google", "JSON tree database synced in real time to clients.", [5_000, 20, 25, 0.9995], ["Real-time sync"], ["Hard to query and scale"]),
  t("database", "mongodb-atlas", "MongoDB Atlas", "MongoDB Inc.", "Managed MongoDB in the cloud.", [8_000, 15, 60, 0.9995], ["Fully managed, global clusters"], ["Pricier than self-hosting"]),
  t("database", "amazon-documentdb", "Amazon DocumentDB", "AWS", "AWS's MongoDB-compatible document database.", [7_000, 15, 200, 0.9999], ["Managed on AWS"], ["Not every MongoDB feature"]),

  // ---- Databases: analytics, time series and vectors ----
  t("database", "clickhouse", "ClickHouse", "ClickHouse Inc.", "Column-oriented database for fast analytics over event data.", [20_000, 15, 180, 0.999], ["Very fast aggregations over billions of rows", "High compression"], ["Not for frequent single-row updates", "Limited joins"], { images: ["clickhouse-server", "clickhouse"], npm: ["@clickhouse/client"], python: ["clickhouse-connect", "clickhouse-driver"], go: ["github.com/ClickHouse/clickhouse-go"] }),
  t("database", "timescaledb", "TimescaleDB", "Timescale", "PostgreSQL extension for time-series data.", [8_000, 15, 120, 0.999], ["SQL plus time-series speed"], ["Single-node writes"], { images: ["timescaledb", "timescaledb-ha"] }),
  t("database", "influxdb", "InfluxDB", "InfluxData", "Time-series database for metrics and events.", [15_000, 8, 100, 0.999], ["High write rates, retention policies"], ["Query language changed between versions"], { images: ["influxdb"], npm: ["@influxdata/influxdb-client"], python: ["influxdb-client"] }),
  t("database", "questdb", "QuestDB", "QuestDB", "Fast SQL time-series database.", [40_000, 5, 90, 0.999], ["Very fast ingestion"], ["Younger ecosystem"], { images: ["questdb"] }),
  t("database", "apache-druid", "Apache Druid", "Apache Software Foundation", "Real-time analytics database for interactive dashboards.", [5_000, 30, 400, 0.999], ["Sub-second queries on streams"], ["Many components to run"], { images: ["druid"] }),
  t("database", "apache-pinot", "Apache Pinot", "Apache Software Foundation", "Real-time OLAP for user-facing analytics.", [10_000, 20, 400, 0.999], ["Low-latency analytics at high concurrency"], ["Complex to operate"], { images: ["pinot"] }),
  t("database", "snowflake", "Snowflake", "Snowflake", "Cloud data warehouse separating storage and compute.", [200, 800, 2_000, 0.999], ["Elastic analytics with little tuning"], ["Not for application traffic", "Costs follow query volume"], { python: ["snowflake-connector-python"], npm: ["snowflake-sdk"] }),
  t("database", "google-bigquery", "Google BigQuery", "Google", "Serverless data warehouse.", [100, 1_500, 1_000, 0.9999], ["Petabyte SQL without servers"], ["Seconds per query; not for app requests"], { python: ["google-cloud-bigquery"], npm: ["@google-cloud/bigquery"] }),
  t("database", "amazon-redshift", "Amazon Redshift", "AWS", "AWS's data warehouse.", [200, 900, 1_200, 0.999], ["Deep AWS integration"], ["Not for application traffic"]),
  t("database", "duckdb", "DuckDB", "DuckDB Foundation", "Embedded analytical database.", [500, 50, 0, 0.995], ["Fast local analytics, zero setup"], ["Single process"], { python: ["duckdb"], npm: ["duckdb", "@duckdb/node-api"] }),
  t("database", "pinecone", "Pinecone", "Pinecone", "Managed vector database for similarity search.", [2_000, 25, 70, 0.9995], ["Managed vector search at scale"], ["Proprietary; cost per pod"], { npm: ["@pinecone-database/pinecone"], python: ["pinecone", "pinecone-client"] }),
  t("database", "weaviate", "Weaviate", "Weaviate", "Open-source vector database with hybrid search.", [2_500, 20, 80, 0.999], ["Vector plus keyword search"], ["Memory hungry"], { images: ["weaviate"], npm: ["weaviate-client", "weaviate-ts-client"], python: ["weaviate-client"] }),
  t("database", "qdrant", "Qdrant", "Qdrant", "Vector database written in Rust.", [4_000, 10, 60, 0.999], ["Fast filtering with vectors"], ["Younger ecosystem"], { images: ["qdrant"], npm: ["@qdrant/js-client-rest"], python: ["qdrant-client"] }),
  t("database", "milvus", "Milvus", "Zilliz", "Distributed vector database for billions of vectors.", [5_000, 15, 150, 0.999], ["Scales to billions of vectors"], ["Many components to run"], { images: ["milvus"], python: ["pymilvus"] }),
  t("database", "chroma", "Chroma", "Chroma", "Open-source embedding database for AI apps.", [1_000, 15, 30, 0.995], ["Easy to start with"], ["Early for large production"], { images: ["chroma"], python: ["chromadb"], npm: ["chromadb"] }),
  t("database", "pgvector", "PostgreSQL + pgvector", null, "Vector similarity search inside PostgreSQL.", [2_000, 30, 90, 0.999], ["Vectors next to your relational data"], ["Slower than dedicated vector stores at scale"], { images: ["pgvector"], python: ["pgvector"], npm: ["pgvector"] }),
  // ---- Caches ----
  t("cache", "valkey", "Valkey", "Linux Foundation", "Open-source fork of Redis.", [40_000, 1.5, 25, 0.999, 0.7], ["Redis-compatible, open license"], ["Same single-thread limits as Redis"], { images: ["valkey"], npm: ["iovalkey", "@valkey/valkey-glide"] }),
  t("cache", "dragonfly", "Dragonfly", "DragonflyDB", "Multi-threaded Redis- and Memcached-compatible cache.", [150_000, 1, 40, 0.999, 0.7], ["Several times Redis's throughput per node"], ["Younger project"], { images: ["dragonfly"] }),
  t("cache", "keydb", "KeyDB", "Snap", "Multi-threaded fork of Redis.", [80_000, 1.2, 30, 0.999, 0.7], ["Multi-threaded Redis"], ["Less active development"], { images: ["keydb"] }),
  t("cache", "amazon-elasticache-redis", "Amazon ElastiCache (Redis/Valkey)", "AWS", "Managed Redis or Valkey on AWS.", [40_000, 1, 50, 0.9999, 0.7], ["Managed failover and patching"], ["Pricier than self-hosting"]),
  t("cache", "amazon-elasticache-memcached", "Amazon ElastiCache (Memcached)", "AWS", "Managed Memcached on AWS.", [50_000, 1, 40, 0.9995, 0.65], ["Managed and simple"], ["No persistence or replication"]),
  t("cache", "azure-cache-redis", "Azure Cache for Redis", "Microsoft", "Managed Redis in Azure.", [35_000, 1.5, 55, 0.9999, 0.7], ["Managed, zone redundant"], ["Best within Azure"]),
  t("cache", "google-memorystore", "Google Memorystore", "Google", "Managed Redis, Valkey and Memcached on Google Cloud.", [35_000, 1.5, 50, 0.9999, 0.7], ["Fully managed"], ["Best within Google Cloud"]),
  t("cache", "upstash-redis", "Upstash Redis", "Upstash", "Serverless Redis priced per request.", [10_000, 5, 10, 0.9995, 0.7], ["Pay per request, works from the edge"], ["Higher latency than a local Redis"], { npm: ["@upstash/redis"] }),
  t("cache", "hazelcast", "Hazelcast", "Hazelcast", "Distributed in-memory data grid for the JVM.", [60_000, 1, 80, 0.9995, 0.75], ["Distributed maps and compute"], ["JVM memory tuning"], { images: ["hazelcast"], java: ["com.hazelcast"] }),
  t("cache", "apache-ignite", "Apache Ignite", "Apache Software Foundation", "Distributed in-memory database and cache.", [50_000, 1.5, 90, 0.9995, 0.75], ["SQL over in-memory data"], ["Complex to tune"], { images: ["ignite"], java: ["org.apache.ignite"] }),
  t("cache", "momento", "Momento Cache", "Momento", "Serverless cache with no clusters to size.", [20_000, 3, 20, 0.9999, 0.7], ["Nothing to provision"], ["Proprietary service"], { npm: ["@gomomento/sdk"] }),
  t("cache", "caffeine", "In-process cache (Caffeine / LRU)", null, "A cache inside each server's memory.", [500_000, 0.05, 0, 0.999, 0.6], ["Fastest possible reads, free"], ["Not shared between servers; lost on restart"]),
  t("cache", "garnet", "Microsoft Garnet", "Microsoft", "High-throughput cache speaking the Redis protocol.", [120_000, 1, 35, 0.999, 0.7], ["Very high throughput"], ["New project"], { images: ["garnet"] }),

  // ---- Message queues and streams ----
  t("queue", "redpanda", "Redpanda", "Redpanda Data", "Kafka-compatible streaming platform in C++ without ZooKeeper.", [80_000, 5, 120, 0.9995], ["Kafka API with lower latency"], ["Source-available license"], { images: ["redpanda"] }),
  t("queue", "amazon-msk", "Amazon MSK", "AWS", "Managed Apache Kafka on AWS.", [50_000, 10, 250, 0.9995], ["Managed Kafka brokers"], ["Expensive minimum size"]),
  t("queue", "confluent-cloud", "Confluent Cloud", "Confluent", "Fully managed Kafka from Kafka's creators.", [50_000, 10, 300, 0.9995], ["Serverless Kafka with connectors"], ["Costs grow with throughput"], { npm: ["@confluentinc/kafka-javascript"] }),
  t("queue", "apache-pulsar", "Apache Pulsar", "Apache Software Foundation", "Messaging and streaming with tiered storage and multi-tenancy.", [40_000, 8, 180, 0.9995], ["Queues and streams in one", "Geo-replication"], ["More components than Kafka"], { images: ["pulsar"], npm: ["pulsar-client"], python: ["pulsar-client"], java: ["pulsar-client"] }),
  t("queue", "nats", "NATS", "Synadia", "Lightweight, very fast messaging system.", [200_000, 1, 30, 0.9995], ["Tiny, very fast pub/sub"], ["Core NATS does not persist messages"], { images: ["nats"], npm: ["nats"], python: ["nats-py"], go: ["github.com/nats-io/nats.go"] }),
  t("queue", "nats-jetstream", "NATS JetStream", "Synadia", "Persistent streams and queues on NATS.", [50_000, 3, 40, 0.9995], ["Persistence with NATS's simplicity"], ["Smaller ecosystem than Kafka"]),
  t("queue", "activemq-artemis", "ActiveMQ Artemis", "Apache Software Foundation", "JMS message broker for Java systems.", [20_000, 4, 40, 0.9995], ["Standard JMS; many protocols"], ["JVM tuning"], { images: ["activemq-artemis", "activemq"], java: ["artemis-jms-client", "activemq-client"] }),
  t("queue", "amazon-mq", "Amazon MQ", "AWS", "Managed RabbitMQ or ActiveMQ on AWS.", [8_000, 6, 60, 0.9995], ["Managed classic brokers"], ["Lower scale than SQS"]),
  t("queue", "amazon-sns", "Amazon SNS", "AWS", "Managed publish/subscribe fan-out.", [30_000, 25, 10, 0.9999], ["Fan out to many subscribers"], ["Not a queue by itself"], { npm: ["@aws-sdk/client-sns"] }),
  t("queue", "amazon-kinesis", "Amazon Kinesis Data Streams", "AWS", "Managed real-time data streams.", [10_000, 70, 40, 0.9999], ["Managed streaming with replay"], ["Shard management"], { npm: ["@aws-sdk/client-kinesis"] }),
  t("queue", "amazon-eventbridge", "Amazon EventBridge", "AWS", "Serverless event bus routing events between services.", [10_000, 50, 10, 0.9999], ["Rules route events with no code"], ["Higher latency"], { npm: ["@aws-sdk/client-eventbridge"] }),
  t("queue", "google-pubsub", "Google Pub/Sub", "Google", "Global, serverless messaging.", [50_000, 30, 40, 0.9995], ["Global and serverless"], ["At-least-once delivery"], { npm: ["@google-cloud/pubsub"], python: ["google-cloud-pubsub"], go: ["cloud.google.com/go/pubsub"] }),
  t("queue", "azure-service-bus", "Azure Service Bus", "Microsoft", "Enterprise message broker in Azure.", [10_000, 15, 50, 0.9999], ["Sessions, transactions, dead letters"], ["Best within Azure"], { npm: ["@azure/service-bus"], python: ["azure-servicebus"] }),
  t("queue", "azure-event-hubs", "Azure Event Hubs", "Microsoft", "Big-data event streaming with a Kafka endpoint.", [40_000, 15, 100, 0.9999], ["Kafka-compatible and managed"], ["Partitions sized up front"], { npm: ["@azure/event-hubs"] }),
  t("queue", "bullmq-queue", "BullMQ / Bull (Redis)", "Taskforce.sh", "Job queue for Node.js that keeps its jobs in Redis.", [10_000, 3, 25, 0.999], ["Retries, delays and rate limits", "Uses the Redis you already run"], ["Bounded by Redis memory", "Node.js only"]),
  t("queue", "redis-streams", "Redis Streams", "Redis Ltd.", "Append-only streams with consumer groups in Redis.", [30_000, 2, 25, 0.999], ["Simple if you already run Redis"], ["Bounded by memory"]),
  t("queue", "zeromq", "ZeroMQ", null, "Brokerless messaging library.", [100_000, 0.5, 0, 0.999], ["Very fast, no broker to run"], ["No persistence; you build delivery guarantees"], { npm: ["zeromq"], python: ["pyzmq"] }),
  t("queue", "upstash-qstash", "Upstash QStash", "Upstash", "HTTP-based serverless message queue.", [1_000, 50, 10, 0.9995], ["Works from serverless and edge"], ["HTTP delivery adds latency"], { npm: ["@upstash/qstash"] }),
  t("queue", "beanstalkd", "beanstalkd", null, "Simple, fast work queue.", [10_000, 2, 20, 0.999], ["Very simple"], ["No clustering"], { images: ["beanstalkd"] }),
  t("queue", "nsq", "NSQ", null, "Distributed real-time messaging platform from Bitly.", [50_000, 2, 30, 0.999], ["Simple to scale out"], ["No ordering guarantees"], { images: ["nsq"] }),
  t("queue", "temporal", "Temporal", "Temporal Technologies", "Durable workflow engine that queues and retries work.", [2_000, 20, 200, 0.9995], ["Reliable long-running workflows"], ["A cluster and new concepts to learn"], { images: ["temporal", "auto-setup"] }),

  // ---- Object storage ----
  t("object-storage", "google-cloud-storage", "Google Cloud Storage", "Google", "Google's object storage.", [12_000, 20, 20, 0.9999], ["Strong consistency, global"], ["Egress costs"], { npm: ["@google-cloud/storage"], python: ["google-cloud-storage"] }),
  t("object-storage", "azure-blob-storage", "Azure Blob Storage", "Microsoft", "Azure's object storage.", [12_000, 20, 20, 0.9999], ["Tiers from hot to archive"], ["Egress costs"], { npm: ["@azure/storage-blob"], python: ["azure-storage-blob"] }),
  t("object-storage", "cloudflare-r2", "Cloudflare R2", "Cloudflare", "S3-compatible object storage with no egress fees.", [10_000, 25, 15, 0.9999], ["No egress fees", "S3 API"], ["Fewer features than S3"]),
  t("object-storage", "backblaze-b2", "Backblaze B2", "Backblaze", "Low-cost S3-compatible object storage.", [5_000, 40, 6, 0.999], ["Very cheap storage"], ["Higher latency"], { npm: ["backblaze-b2"] }),
  t("object-storage", "minio", "MinIO", "MinIO", "Self-hosted S3-compatible object storage.", [10_000, 8, 60, 0.999], ["S3 API anywhere", "Fast on local disks"], ["You operate the cluster"], { images: ["minio"], npm: ["minio"], python: ["minio"], go: ["github.com/minio/minio-go"] }),
  t("object-storage", "digitalocean-spaces", "DigitalOcean Spaces", "DigitalOcean", "S3-compatible storage with a built-in CDN.", [5_000, 30, 5, 0.999], ["Cheap flat pricing"], ["Lower rate limits"]),
  t("object-storage", "wasabi", "Wasabi", "Wasabi", "Hot cloud storage with no egress fees.", [5_000, 35, 7, 0.999], ["Cheap; no egress fees"], ["90-day minimum storage"]),
  t("object-storage", "ceph", "Ceph (RADOS Gateway)", "Red Hat", "Self-hosted distributed storage with an S3 API.", [15_000, 10, 200, 0.9995], ["Block, file and object in one"], ["Complex to operate"], { images: ["ceph"] }),
  t("object-storage", "seaweedfs", "SeaweedFS", null, "Fast distributed file and object store for billions of files.", [20_000, 5, 50, 0.999], ["Very fast small files", "S3 API"], ["Smaller community"], { images: ["seaweedfs"] }),
  t("object-storage", "supabase-storage", "Supabase Storage", "Supabase", "S3-compatible storage tied to Supabase auth.", [3_000, 30, 25, 0.999], ["Row-level security on files"], ["Platform coupling"]),
  t("object-storage", "uploadthing", "UploadThing", "Ping Labs", "File uploads as a service for TypeScript apps.", [2_000, 40, 10, 0.999], ["Easy uploads from the browser"], ["Fewer storage controls"], { npm: ["uploadthing"] }),

  // ---- Search ----
  t("search", "opensearch", "OpenSearch", "Linux Foundation", "Open-source fork of Elasticsearch.", [1_500, 30, 85, 0.999], ["Elasticsearch API, open license"], ["Same JVM tuning as Elasticsearch"], { images: ["opensearch"], npm: ["@opensearch-project/opensearch"], python: ["opensearch-py"] }),
  t("search", "amazon-opensearch-service", "Amazon OpenSearch Service", "AWS", "Managed OpenSearch on AWS.", [1_500, 30, 150, 0.9999], ["Managed clusters"], ["Pricier than self-hosting"]),
  t("search", "elastic-cloud", "Elastic Cloud", "Elastic", "Managed Elasticsearch from Elastic.", [1_800, 28, 180, 0.9999], ["Managed, latest features"], ["Costs grow with data"]),
  t("search", "apache-solr", "Apache Solr", "Apache Software Foundation", "Mature Lucene-based search server.", [1_200, 30, 80, 0.999], ["Powerful relevance tuning"], ["Older tooling"], { images: ["solr"], python: ["pysolr"] }),
  t("search", "meilisearch", "Meilisearch", "Meili", "Fast, typo-tolerant search engine that is easy to run.", [2_000, 15, 30, 0.999], ["Great results out of the box", "Simple to run"], ["Not for huge datasets"], { images: ["meilisearch"], npm: ["meilisearch"], python: ["meilisearch"] }),
  t("search", "typesense", "Typesense", "Typesense", "In-memory, typo-tolerant search engine.", [3_000, 10, 40, 0.999], ["Very fast instant search"], ["Data must fit in memory"], { images: ["typesense"], npm: ["typesense"], python: ["typesense"] }),
  t("search", "algolia", "Algolia", "Algolia", "Hosted search-as-a-service with instant results.", [5_000, 10, 100, 0.9999], ["Fast, hosted, great UI widgets"], ["Expensive per record and search"], { npm: ["algoliasearch"], python: ["algoliasearch"] }),
  t("search", "azure-ai-search", "Azure AI Search", "Microsoft", "Managed search with vector and semantic ranking.", [1_500, 30, 250, 0.9995], ["Vector and semantic search"], ["Best within Azure"]),
  t("search", "vespa", "Vespa", "Vespa.ai", "Engine for search, recommendation and vector ranking at scale.", [3_000, 20, 200, 0.9995], ["Ranking and serving at large scale"], ["Steep learning curve"], { images: ["vespa"] }),
  t("search", "manticore", "Manticore Search", "Manticore Software", "Fast full-text search with SQL.", [3_000, 10, 50, 0.999], ["Very fast full-text"], ["Smaller ecosystem"], { images: ["manticore", "manticoresearch"] }),
  t("search", "postgres-full-text", "PostgreSQL full-text search", null, "Search inside PostgreSQL with tsvector indexes.", [800, 40, 0, 0.999], ["No extra system"], ["Weaker relevance, slows the database"]),
  t("search", "zincsearch", "ZincSearch", null, "Lightweight Elasticsearch alternative in Go.", [1_000, 20, 25, 0.995], ["Small and simple"], ["Fewer features"], { images: ["zincsearch", "zinc"] }),

  // ---- Authentication ----
  t("auth", "okta", "Okta", "Okta", "Enterprise identity and single sign-on.", [5_000, 30, 150, 0.9999], ["Enterprise SSO and directories"], ["Expensive"], { npm: ["@okta/okta-auth-js", "@okta/okta-react"] }),
  t("auth", "clerk", "Clerk", "Clerk", "Drop-in authentication and user management for web apps.", [5_000, 20, 25, 0.9999], ["Prebuilt sign-in UI"], ["Costs per active user"], { npm: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/backend"] }),
  t("auth", "firebase-auth", "Firebase Authentication", "Google", "Hosted sign-in with email, phone and social providers.", [5_000, 25, 10, 0.9999], ["Free for most apps", "Many providers"], ["Tied to Firebase"], { npm: ["firebase"] }),
  t("auth", "supabase-auth", "Supabase Auth", "Supabase", "Authentication built into Supabase.", [3_000, 25, 25, 0.999], ["Integrated with Postgres row-level security"], ["Platform coupling"]),
  t("auth", "keycloak", "Keycloak", "Red Hat", "Open-source identity and access management server.", [2_000, 20, 60, 0.999], ["SSO, OIDC, SAML; self-hosted and free"], ["Heavy JVM app to run"], { images: ["keycloak"], npm: ["keycloak-js", "keycloak-connect"] }),
  t("auth", "ory-kratos", "Ory Kratos", "Ory", "Headless identity server written in Go.", [4_000, 10, 40, 0.999], ["API-first, lightweight"], ["You build the UI"], { images: ["kratos"] }),
  t("auth", "microsoft-entra-id", "Microsoft Entra ID", "Microsoft", "Microsoft's identity platform (formerly Azure AD).", [5_000, 30, 60, 0.9999], ["Enterprise and Microsoft 365 sign-in"], ["Complex configuration"], { npm: ["@azure/msal-browser", "@azure/msal-node"], python: ["msal"] }),
  t("auth", "google-identity-platform", "Google Identity Platform", "Google", "Customer identity on Google Cloud.", [5_000, 25, 30, 0.9999], ["Scales with Google"], ["Best within Google Cloud"]),
  t("auth", "workos", "WorkOS", "WorkOS", "Enterprise SSO and directory sync for B2B apps.", [4_000, 25, 125, 0.9999], ["SAML/SSO in a few lines"], ["Per-connection pricing"], { npm: ["@workos-inc/node"] }),
  t("auth", "stytch", "Stytch", "Stytch", "Passwordless authentication APIs.", [4_000, 25, 50, 0.9999], ["Passkeys and magic links"], ["Costs per user"], { npm: ["stytch"] }),
  t("auth", "authentik", "authentik", "Authentik Security", "Open-source identity provider.", [1_500, 20, 40, 0.999], ["Self-hosted SSO"], ["You run and secure it"]),
  t("auth", "authelia", "Authelia", null, "Self-hosted single sign-on and 2FA portal for reverse proxies.", [3_000, 8, 20, 0.999], ["Light, works with Traefik/NGINX"], ["Not a full identity platform"], { images: ["authelia"] }),
  t("auth", "fusionauth", "FusionAuth", "FusionAuth", "Self-hostable customer identity platform.", [3_000, 15, 50, 0.999], ["Free self-hosted community edition"], ["Advanced features paid"], { images: ["fusionauth-app"] }),
  t("auth", "zitadel", "ZITADEL", "ZITADEL", "Cloud-native identity platform in Go.", [3_000, 15, 50, 0.9995], ["Multi-tenant out of the box"], ["Younger ecosystem"], { images: ["zitadel"] }),
  t("auth", "better-auth", "Better Auth", null, "TypeScript authentication library running in your app.", [4_000, 8, 0, 0.999], ["Runs inside your app; free"], ["You maintain it"], { npm: ["better-auth"] }),
  t("auth", "passport-jwt", "Passport.js / JWT (in-app)", null, "Authentication handled by your own server code.", [4_000, 5, 0, 0.999], ["No extra service"], ["Security is on you"]),
  t("auth", "hashicorp-vault", "HashiCorp Vault", "HashiCorp", "Secrets management and identity-based access.", [3_000, 10, 100, 0.9995], ["Central secrets and dynamic credentials"], ["Complex to operate"], { images: ["vault"] }),
];
