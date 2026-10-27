# How ARCHITECH estimates metrics

<!-- Generated from src/lib/architecture/evaluation (metricsDoc.ts). Do not edit by hand: run `npm run docs:metrics` in frontend/. -->

Real-world trade-offs depend on far more than a diagram, so ARCHITECH does not try to predict exact production numbers.
It uses a **transparent, weighted model** with the documented assumptions below. The goal is estimates that are
**directionally correct and explainable**: adding a replica, a cache or a queue, or swapping PostgreSQL for MongoDB,
moves the numbers the way it would in a real system, and every number can be traced back to this page.

The engine is a pure function over the graph JSON (`evaluateArchitecture`). It runs in the browser, so the live
metrics on the canvas update as components are added, removed, connected or reconfigured, without a server
request. Results are memoized by a fingerprint that ignores names and positions, and re-evaluation is debounced.

## Traffic

| Setting | Default | Meaning |
|---|---:|---|
| Requests per second | 1,000 | Peak load sent into the design (the live metrics' baseline). |
| Concurrent users | 5,000 | Used when no request rate is given: 0.2 req/s per user. |
| Dataset | 100 GB | Size of stored data: adds storage cost, and slows databases as it grows. |
| API reads | 80% | Read share of API requests; the rest are writes. |
| Static files | 60% | Share of all requests that are static files (images, scripts, video). |
| Client network | 40 ms | Round trip between the user and the system. |

## How requests flow

- Clients split their load evenly among what they connect to. Load balancers and gateways send each request to one downstream service.
- A service reads through its caches, writes through its queues, and otherwise goes to its data stores; several stores share the load.
- A cache answers its hit rate of reads and passes the rest on. A cache with no onward connection is cache-aside: misses go to the store.
- A queue accepts writes and hands them on at a smoothed rate: consumers see 60% of the peak. Work behind a queue is asynchronous and does not add to the user's latency.
- Static files never touch the database. A CDN answers its hit rate of them at the edge; object storage serves the rest when connected; otherwise the service serves them itself.
- Authentication is called for 5% of requests by default (JWTs are checked locally; only sign-ins and refreshes reach it). Search handles 10% of requests by default. Both are settings on the component.
- A write costs a database primary 2× a read. A dataset of 2,200 GB halves a database's capacity.
- Custom components (technologies ARCHITECH does not model, e.g. ClickHouse or Zipkin from an imported repository) are measured as the kind of component they act like ("Acts like" in their settings), with that kind's standard numbers unless their own capacity, latency, monthly cost per instance and per-instance uptime are set. A custom component that acts like nothing passes requests on and is not measured.
- Cycles are cut where they close. The flow is linear in the request rate, so it is computed once and scaled.

## Per component

- **Capacity:** instances × capacity per instance (the technology's number, or the component's own capacity setting).
  Replicas: up to 1,000 (a database's replicas are read replicas, up to 50); capacity settings up to 10,000,000.
- **Utilization:** load reaching the component ÷ its capacity. The design's capacity is the load at which the first component fills up (the limiting component).
- **Cost:** instances × monthly cost per instance,
  plus $0.10 per GB of the dataset on each database and $0.023 per GB on object storage.
- **Availability:** a component with n instances is down only when all of them are: 1 − (1 − a)ⁿ. Along a path availabilities multiply; alternatives (replicas, shards, several upstreams) are averaged by the share of traffic they carry.

## Latency

- Each component adds its technology's idle latency, and each hop adds 1.5 ms. The client's network adds 50% of its round trip.
- As a component fills up its latency rises: unchanged below 62% utilization, then a steady rise (divisor 42), a steeper one once overloaded (divisor 16), capped at 20× idle.
- p95 latency is the slowest common request path. Branches carrying less than 5% of a component's traffic do not shape it.

## Scores (0–100)

| Category | Weight | How it is scored |
|---|---:|---|
| Scalability | 30% | Capacity ÷ requested load: 2× or more is 100, exactly 1× is 70, below that it falls in proportion to what can be served. A queue backlog costs 15 points (5 if only close). |
| Reliability | 30% | 25 points per "nine" of uptime (99% = 2 nines), full marks at 4 nines. |
| Performance | 25% | p95 at or under 100 ms is 100; every doubling above costs the same, reaching 0 at 2,000 ms. |
| Cost efficiency | 15% | Against a reference of $200/month + $60 per 1,000 req/s: at or under it is 100, 4× it is 0. Multiplied by the share of load actually served. |

The overall score is the weighted average, minus up to 15 points for architecture findings (high 8, medium 4, low 1), so a structurally broken design cannot score well on its other numbers.

## Health

- **Critical:** a component at 120% of capacity or more, uptime below 99%, or p95 of 1,000 ms or more.
- **Warning:** a component at 80% of capacity or more, uptime below 99.9%, p95 of 400 ms or more, or a high-severity finding.

## Findings (thresholds)

- Slow path: p95 of 400 ms (medium) or 1,000 ms (high); a request path of 7 or more components.
- Low availability: below 99.9% (medium) or 99% (high); single points of failure (a single-instance component whose failure cuts off the request path; CDNs, DNS and custom components are excluded).
- Over-provisioned: a component below 15% utilization.
- Components that serve no requests: medium when their cost is 20% or more of the total, otherwise low.
- A cache when reads are under 30% of API requests; a service spending 25% or more of its work on static files.
- Structure: no client, no backend, unreachable components, questionable connections (e.g. a client straight to a database), cycles.

## Technologies

Each component's numbers come from its chosen technology. Swapping the technology re-evaluates the whole design;
the technology picker shows each option's effect on the design's score, p95, cost and uptime side by side.

### Client (`client`, role: entry)

The user-facing device or application that starts a request.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Web Browser (default) | no limit | 0 | $0 | 100% | Represents real user traffic | Outside your control: slow networks and old devices add latency |
| Desktop App | no limit | 0 | $0 | 100% | Rich offline-capable interface | Users update on their own schedule |
| IoT Device | no limit | 0 | $0 | 100% | Huge numbers of small, steady requests | Flaky networks: plan for retries and batching |
| CLI / Script | no limit | 0 | $0 | 100% | Simple to automate | Bursty, machine-speed traffic |
| Third-party Integration | no limit | 0 | $0 | 100% | Reaches users through partners | Traffic you do not control; rate-limit it |

### Web App (`web-app`, role: entry)

A browser-based frontend that renders the interface and calls backend APIs.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Next.js (default) | no limit | 0 | $0 | 100% | Server rendering helps first-load speed and SEO; Frontend and API routes in one project | Server rendering needs a running server, not just static hosting; More framework conventions to learn than a plain SPA |
| React SPA (Vite) | no limit | 0 | $0 | 100% | Static files: cheap to host and easy to put behind a CDN; Simple build and deploy | Rendered in the browser, so the first load is slower; Weaker SEO without extra work |
| Vue | no limit | 0 | $0 | 100% | Gentle learning curve; Small, fast runtime | Smaller job market than React |
| Nuxt | no limit | 0 | $0 | 100% | Server rendering for SEO; File-based routing | Server rendering needs a Node server |
| Angular | no limit | 0 | $0 | 100% | Batteries included; Strong structure for big teams | Steeper learning curve; Larger bundles |
| SvelteKit | no limit | 0 | $0 | 100% | Very small bundles; Simple reactive model | Smaller ecosystem |
| Svelte | no limit | 0 | $0 | 100% | No virtual DOM; tiny output | Smaller ecosystem |
| Remix / React Router | no limit | 0 | $0 | 100% | Fast data loading and forms; Progressive enhancement | Needs a server runtime |
| Astro | no limit | 0 | $0 | 100% | Very fast static pages; Mix React, Vue or Svelte islands | Less suited to app-like interfaces |
| Gatsby | no limit | 0 | $0 | 100% | Fast static sites; Large plugin ecosystem | Slow builds for big sites; Less active today |
| SolidJS | no limit | 0 | $0 | 100% | Excellent runtime performance | Smaller ecosystem |
| Qwik | no limit | 0 | $0 | 100% | Near-instant startup | New and less familiar |
| Ember.js | no limit | 0 | $0 | 100% | Stable conventions | Smaller community today |
| Static HTML/CSS/JS | no limit | 0 | $0 | 100% | Simplest to host and cache | Hard to scale to complex interfaces |
| htmx (server-rendered) | no limit | 0 | $0 | 100% | Little JavaScript; Logic stays on the server | Every interaction is a server round trip |
| Blazor | no limit | 0 | $0 | 100% | C# end to end | Larger first download (WebAssembly) |
| Flutter Web | no limit | 0 | $0 | 100% | One codebase with mobile | Large bundles; weaker SEO |

### Mobile App (`mobile-app`, role: entry)

A native iOS or Android application that calls backend APIs.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| React Native (default) | no limit | 0 | $0 | 100% | One codebase for iOS and Android; Shares skills with the React web app | Some features need native modules; Releases go through app store review |
| Swift (iOS native) | no limit | 0 | $0 | 100% | Best performance and platform features | iOS only |
| Kotlin (Android native) | no limit | 0 | $0 | 100% | Best performance and platform features | Android only |
| Flutter | no limit | 0 | $0 | 100% | One codebase for iOS and Android; Consistent UI | Dart is less common; Larger app size |
| Expo (React Native) | no limit | 0 | $0 | 100% | Fast setup and updates | Some native modules need custom builds |
| Ionic / Capacitor | no limit | 0 | $0 | 100% | Reuse web skills and code | Less native feel and performance |
| .NET MAUI | no limit | 0 | $0 | 100% | Share C# with the backend | Smaller mobile community |
| Kotlin Multiplatform | no limit | 0 | $0 | 100% | Native UI, shared business logic | Still two UIs to build |

### CDN (`cdn`, role: edge)

Serves static content from edge locations close to the user.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Hit rate | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Cloudflare CDN (default) | 50,000 | 10 | $40 | 99.99% | 95% | Very large edge network; DDoS protection included | Only helps content that can be cached; Cache invalidation adds a deploy step |
| Amazon CloudFront | 50,000 | 12 | $45 | 99.99% | 93% | Tight integration with S3 and AWS load balancers; Fine-grained cache rules | Pay-per-request pricing is harder to predict; Ties the design more closely to AWS |
| Fastly | 50,000 | 9 | $50 | 99.99% | 94% | Purges in milliseconds; Edge compute | Pricier at small scale |
| Akamai | 60,000 | 10 | $120 | 99.99% | 95% | Huge global footprint; Enterprise security | Expensive; enterprise contracts |
| Azure Front Door | 50,000 | 12 | $50 | 99.99% | 92% | Integrated with Azure; Built-in WAF | Best within Azure |
| Google Cloud CDN | 50,000 | 11 | $45 | 99.99% | 93% | Google's private network | Needs Google's load balancer |
| Bunny CDN | 40,000 | 12 | $15 | 99.95% | 93% | Very cheap; Simple to set up | Smaller network than the giants |
| Vercel Edge Network | 40,000 | 10 | $20 | 99.99% | 90% | Zero-config for Next.js | Tied to Vercel hosting |
| Netlify Edge | 35,000 | 12 | $19 | 99.95% | 90% | Simple static hosting | Tied to Netlify hosting |
| KeyCDN | 35,000 | 13 | $10 | 99.95% | 92% | Cheap and simple | Fewer features |
| Gcore CDN | 40,000 | 12 | $25 | 99.95% | 92% | Good regional coverage | Smaller ecosystem |
| Varnish Cache | 30,000 | 2 | $45 | 99.9% | 80% | Very fast; fully configurable (VCL); Runs anywhere | You run it; no global edge |

### DNS (`dns`, role: edge)

Resolves domain names to the addresses of servers or load balancers.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Hit rate | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Amazon Route 53 (default) | 100,000 | 5 | $5 | 99.99% | 0% | Highly available managed service; Health-check-based failover | Record changes take time to spread because of TTLs |
| Cloudflare DNS | 100,000 | 4 | $0 | 100% | 0% | Free tier; Very fast resolution | Advanced features need paid plans |
| Google Cloud DNS | 100,000 | 5 | $5 | 100% | 0% | 100% SLA | Best within Google Cloud |
| Azure DNS | 100,000 | 5 | $5 | 100% | 0% | Integrated with Azure | Best within Azure |
| NS1 (IBM) | 100,000 | 5 | $50 | 100% | 0% | Smart traffic routing | Pricey |
| DNSimple | 100,000 | 6 | $10 | 99.99% | 0% | Easy to use | Fewer routing features |
| CoreDNS | 50,000 | 2 | $20 | 99.9% | 0% | Flexible plugins; Service discovery in Kubernetes | You run and secure it |
| BIND | 40,000 | 3 | $20 | 99.9% | 0% | Mature and standard | Manual operation |

### API Server (`server`, role: compute)

Runs application logic and handles requests from clients.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Node.js (Express) (default) | 2,500 | 20 | $42 | 99.9% | 20,000 | Same language as the frontend; Handles many concurrent I/O-bound requests well | CPU-heavy work blocks the event loop; Uses one CPU core per process unless clustered |
| Go (net/http) | 6,000 | 12 | $42 | 99.9% | 20,000 | High throughput per instance; Low memory use and fast startup | More verbose for business logic; Smaller web ecosystem than Node.js |
| Python (FastAPI) | 1,800 | 25 | $42 | 99.9% | 20,000 | Fast to develop; Direct access to Python's data and ML libraries | Lower throughput per instance; The GIL limits CPU-bound work in one process |
| Java (Spring Boot) | 4,000 | 15 | $55 | 99.9% | 20,000 | Strong performance once warmed up; Large, mature ecosystem | Higher memory use, so larger instances cost more; Slower startup |
| Node.js (Fastify) | 4,000 | 15 | $42 | 99.9% | 20,000 | About twice Express's throughput; Schema-based validation | Smaller plugin ecosystem than Express |
| Node.js (NestJS) | 2,200 | 22 | $42 | 99.9% | 20,000 | Clear structure for big teams; TypeScript first | More boilerplate; Slightly slower than bare Express |
| Node.js (Koa) | 2,800 | 18 | $42 | 99.9% | 20,000 | Small and modern | Few batteries included |
| Hono | 5,000 | 12 | $42 | 99.9% | 20,000 | Runs everywhere; Very fast routing | Younger ecosystem |
| Bun | 6,000 | 10 | $42 | 99.9% | 20,000 | Very fast startup and HTTP | Not every Node package works |
| Deno | 4,000 | 14 | $42 | 99.9% | 20,000 | TypeScript out of the box; Secure by default | Smaller ecosystem than Node |
| Python (Django) | 900 | 40 | $42 | 99.9% | 20,000 | Admin, ORM and auth built in; Fast to build with | Lower throughput per instance |
| Python (Flask) | 1,100 | 32 | $42 | 99.9% | 20,000 | Simple and flexible | You assemble the pieces |
| Python (aiohttp) | 2,000 | 22 | $42 | 99.9% | 20,000 | Async I/O for many connections | Lower-level than Django |
| Ruby on Rails | 800 | 45 | $42 | 99.9% | 20,000 | Very productive; Mature ecosystem (gems) | Lower throughput per instance |
| Ruby (Sinatra) | 1,200 | 35 | $42 | 99.9% | 20,000 | Tiny and simple | Few batteries included |
| PHP (Laravel) | 900 | 40 | $42 | 99.9% | 20,000 | Very productive; Huge ecosystem | Each request boots the app (unless Octane) |
| PHP (Symfony) | 1,000 | 38 | $42 | 99.9% | 20,000 | Mature, reusable components | Verbose configuration |
| C# (ASP.NET Core) | 7,000 | 10 | $50 | 99.9% | 20,000 | Top-tier throughput; Great tooling | Heavier runtime than Go |
| Java (Quarkus) | 5,000 | 12 | $50 | 99.9% | 20,000 | Fast startup; Native images | Smaller ecosystem than Spring |
| Java (Micronaut) | 4,800 | 12 | $50 | 99.9% | 20,000 | Low memory, fast startup | Smaller community |
| Java (Vert.x) | 8,000 | 8 | $50 | 99.9% | 20,000 | Very high concurrency | Reactive code is harder to write |
| Kotlin (Ktor) | 5,000 | 11 | $50 | 99.9% | 20,000 | Concise Kotlin with coroutines | Smaller ecosystem |
| Scala (Play / Akka HTTP) | 5,000 | 12 | $55 | 99.9% | 20,000 | High concurrency | Scala's learning curve |
| Elixir (Phoenix) | 4,000 | 12 | $42 | 99.9% | 20,000 | Millions of connections (channels); Fault tolerant | Smaller hiring pool |
| Rust (Actix Web) | 10,000 | 6 | $42 | 99.9% | 20,000 | Among the fastest frameworks; Memory safe | Slower to write and compile |
| Rust (Axum) | 9,500 | 6 | $42 | 99.9% | 20,000 | Very fast, memory safe | Rust's learning curve |
| Go (Gin) | 6,500 | 11 | $42 | 99.9% | 20,000 | Fast and simple; Big community | Less structure for big apps |
| Go (Fiber) | 7,500 | 10 | $42 | 99.9% | 20,000 | Very fast | fasthttp is not fully net/http compatible |
| Go (Echo) | 6,500 | 11 | $42 | 99.9% | 20,000 | Fast with good middleware | Smaller than Gin |
| C++ (Drogon) | 12,000 | 5 | $42 | 99.9% | 20,000 | Extremely fast | C++ is slow to develop safely |
| Swift (Vapor) | 5,000 | 12 | $42 | 99.9% | 20,000 | Share Swift with iOS apps | Small server-side community |
| AWS Lambda | 1,000 | 35 | $30 | 99.95% | 1,000 | No servers to manage; Scales to zero | Cold starts add latency; Per-request cost grows with traffic |
| Google Cloud Run | 2,000 | 25 | $40 | 99.95% | 1,000 | Any container, scales to zero | Cold starts |
| Azure Functions | 1,000 | 35 | $30 | 99.95% | 1,000 | Integrated with Azure | Cold starts on the consumption plan |
| Cloudflare Workers | 3,000 | 5 | $25 | 99.99% | 10,000 | Runs near users; No cold starts to speak of | Limited CPU time per request; Not every Node API |
| Vercel Functions | 1,000 | 30 | $25 | 99.95% | 1,000 | Zero config with Next.js | Execution time limits |
| Container on Kubernetes | 2,500 | 20 | $60 | 99.9% | 20,000 | Portable, self-healing, autoscaling | Cluster operations are complex |

### API Gateway (`api-gateway`, role: ingress)

Single entry point that routes, authenticates and rate-limits API traffic.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Amazon API Gateway (default) | 10,000 | 8 | $54 | 99.95% | 100,000 | Fully managed, scales automatically; Built-in throttling and auth | Adds a hop of latency to every request; Per-request pricing at high volume |
| Kong Gateway | 12,000 | 4 | $60 | 99.95% | 100,000 | Huge plugin library; Self-host or cloud | Plugins add latency |
| Apigee | 10,000 | 10 | $500 | 99.99% | 100,000 | Analytics, monetization, policies | Expensive |
| Azure API Management | 8,000 | 10 | $150 | 99.95% | 100,000 | Developer portal included | Higher tiers are costly |
| Google API Gateway | 10,000 | 9 | $40 | 99.95% | 100,000 | Simple, pay per call | Fewer policies than Apigee |
| Tyk | 12,000 | 4 | $50 | 99.95% | 100,000 | Fast, batteries included | Dashboard needs a license |
| KrakenD | 20,000 | 2 | $45 | 99.95% | 100,000 | Very fast; combines responses | Configuration-file driven |
| Spring Cloud Gateway | 8,000 | 6 | $55 | 99.9% | 50,000 | Fits Spring and service discovery | JVM memory use |
| Zuul | 6,000 | 8 | $55 | 99.9% | 50,000 | Proven at Netflix scale | Superseded by Spring Cloud Gateway |
| Envoy Gateway | 15,000 | 3 | $50 | 99.95% | 100,000 | Modern, Kubernetes-native | Kubernetes required |
| AWS AppSync | 6,000 | 15 | $60 | 99.95% | 100,000 | Managed GraphQL and subscriptions | AWS-specific resolvers |
| Apollo Router | 10,000 | 4 | $50 | 99.95% | 100,000 | One graph over many services | Federation adds complexity |
| Gloo Gateway | 15,000 | 3 | $60 | 99.95% | 100,000 | Envoy performance, rich policies | Enterprise features are paid |

### Custom (`custom`, role: custom)

A technology ARCHITECH does not model, such as one found in an imported repository. Drawn and connected, but not measured.

Measured as the component type it acts like (its "Acts like" setting), using that type's standard technology unless its own capacity, latency, monthly cost per instance and per-instance uptime are set. With no "Acts like" it passes requests on with no capacity limit, latency, cost or downtime of its own.

### API (`api`, role: ingress)

How clients call your services: REST, GraphQL, gRPC or WebSocket. Pick the protocol as its technology.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| REST (default) | 8,000 | 3 | $30 | 99.95% | — | Simple and universally supported; Responses cache well with HTTP caching and CDNs | Screens often need several requests; Responses can include more data than needed |
| GraphQL | 5,000 | 6 | $36 | 99.95% | — | One request fetches exactly what the screen needs; Typed schema shared by frontend and backend | Planning and resolving queries costs more server work; Harder to cache than plain HTTP responses |
| gRPC | 15,000 | 1.5 | $30 | 99.95% | — | Lowest latency and smallest messages; Streaming and strict contracts between services | Browsers need a proxy (gRPC-Web); Binary messages are harder to inspect and debug |
| WebSocket | 10,000 | 2 | $40 | 99.9% | 50,000 | Real-time push (chat, live tracking, notifications); No polling overhead | Every connected user holds a connection open; Harder to load-balance and scale than requests |
| Server-Sent Events | 10,000 | 2 | $35 | 99.9% | 50,000 | Simple live updates; Works through proxies | Server to client only |
| tRPC | 7,000 | 3 | $30 | 99.95% | — | Types shared between client and server | TypeScript clients only |
| JSON-RPC | 8,000 | 3 | $30 | 99.95% | — | Simple and language-neutral | No caching semantics like REST |
| SOAP | 3,000 | 8 | $36 | 99.95% | — | Strict contracts; enterprise standard | Verbose XML, slow |
| MQTT | 20,000 | 2 | $40 | 99.9% | 100,000 | Tiny messages for IoT; Many persistent connections | Needs a broker |
| Webhooks | 5,000 | 5 | $30 | 99.9% | — | Push instead of polling | Receivers fail; needs retries |

### Load Balancer (`load-balancer`, role: ingress)

Distributes incoming traffic across multiple servers.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| NGINX (default) | 12,000 | 4 | $48 | 99.99% | 200,000 | Very fast and widely used; Can also serve static files and terminate TLS | You run, patch and scale it yourself; It is a single point of failure unless you run two |
| AWS Application Load Balancer | 15,000 | 5 | $40 | 99.99% | 250,000 | Managed, with health checks and auto scaling built in; Spread across availability zones automatically | AWS-specific; Pricing depends on traffic, not just running time |
| HAProxy | 14,000 | 3 | $45 | 99.99% | 200,000 | Very low added latency; Detailed traffic control and statistics | Self-managed; Configuration is harder to learn |
| Envoy | 15,000 | 2 | $48 | 99.99% | 200,000 | Advanced routing, retries, observability | Complex configuration |
| Traefik | 10,000 | 3 | $40 | 99.95% | 150,000 | Automatic service discovery and TLS | Lower peak throughput than NGINX |
| Caddy | 9,000 | 3 | $35 | 99.95% | 150,000 | HTTPS by default; Simple config | Smaller ecosystem than NGINX |
| AWS Network Load Balancer | 50,000 | 1 | $40 | 99.99% | 1,000,000 | Extremely high throughput, static IPs | No HTTP-level routing |
| Google Cloud Load Balancing | 20,000 | 4 | $40 | 99.99% | 300,000 | One global IP | Best within Google Cloud |
| Azure Application Gateway | 12,000 | 5 | $50 | 99.95% | 200,000 | Built-in WAF | Slower to change configuration |
| Azure Load Balancer | 40,000 | 1 | $25 | 99.99% | 1,000,000 | Fast and cheap | No HTTP routing |
| Kubernetes Ingress (NGINX) | 12,000 | 4 | $48 | 99.95% | 200,000 | Standard for Kubernetes | Kubernetes required |
| F5 BIG-IP | 30,000 | 2 | $400 | 99.995% | 1,000,000 | Hardware-grade performance and security | Very expensive |
| Cloudflare Load Balancing | 30,000 | 3 | $25 | 99.99% | 500,000 | Global failover | Traffic must go through Cloudflare |
| DigitalOcean Load Balancer | 10,000 | 4 | $12 | 99.99% | 100,000 | Cheap and simple | Fewer features |
| PgBouncer | 30,000 | 1 | $15 | 99.9% | 10,000 | Thousands of client connections onto few database ones | Transaction pooling limits some features |
| ProxySQL | 25,000 | 1 | $20 | 99.9% | 10,000 | Routes reads to replicas | Another layer to operate |
| Apache HTTP Server | 6,000 | 5 | $40 | 99.9% | 50,000 | Mature with many modules | Lower concurrency than NGINX |

### Database (`database`, role: database)

Stores persistent application data.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| PostgreSQL (default) | 5,000 | 24 | $90 | 99.9% | ACID transactions and strong consistency; Powerful queries, joins and indexes; Read replicas for scaling reads | Writes scale on one primary; sharding is manual; Schema changes need migrations |
| MySQL | 5,500 | 22 | $85 | 99.9% | Fast for simple, read-heavy workloads; Very widely hosted and supported | Fewer advanced SQL features than PostgreSQL; Writes still scale on one primary |
| MongoDB | 6,500 | 18 | $110 | 99.9% | Flexible schema for changing data; Built-in sharding for horizontal scale | Joins and multi-document transactions are weaker; Easy to end up with inconsistent data shapes |
| MariaDB | 5,500 | 22 | $80 | 99.9% | Drop-in MySQL replacement; Open governance | Diverging from MySQL over time |
| Microsoft SQL Server | 6,000 | 20 | $250 | 99.95% | Excellent tooling, strong enterprise features | Licensing cost |
| Oracle Database | 7,000 | 20 | $600 | 99.99% | Very mature, powerful features | Expensive licensing |
| Amazon Aurora (PostgreSQL) | 8,000 | 20 | $200 | 99.99% | Fast failover, up to 15 replicas; Storage grows automatically | Costlier than plain RDS |
| Amazon Aurora (MySQL) | 8,500 | 18 | $190 | 99.99% | Fast failover and replicas | Costlier than plain RDS |
| Amazon RDS for PostgreSQL | 5,000 | 24 | $120 | 99.95% | Backups and patching handled | Less flexible than self-hosting |
| Google Cloud SQL | 5,000 | 24 | $110 | 99.95% | Fully managed | Best within Google Cloud |
| Azure SQL Database | 6,000 | 20 | $150 | 99.99% | Serverless option; high SLA | SQL Server dialect |
| AlloyDB | 12,000 | 15 | $300 | 99.99% | Fast analytics on transactional data | Google Cloud only; pricey |
| CockroachDB | 4,000 | 30 | $250 | 99.99% | Horizontal writes with strong consistency; Multi-region | Higher latency per write; Costly at scale |
| YugabyteDB | 5,000 | 28 | $220 | 99.99% | PostgreSQL API with horizontal scale | More moving parts than PostgreSQL |
| TiDB | 6,000 | 25 | $220 | 99.99% | Scales out MySQL workloads | Several components to run |
| Google Cloud Spanner | 10,000 | 15 | $650 | 99.999% | Global consistency, five-nines SLA | Expensive; Google only |
| PlanetScale | 8,000 | 18 | $39 | 99.99% | Horizontal sharding (Vitess); Schema branching | No foreign keys by default |
| Neon | 4,000 | 25 | $19 | 99.95% | Scales to zero; branches per PR | Cold starts after idling |
| Supabase (PostgreSQL) | 4,000 | 25 | $25 | 99.9% | Full backend platform on Postgres | Platform coupling |
| Vitess | 20,000 | 20 | $300 | 99.95% | Massive horizontal MySQL | Complex to operate |
| SQLite | 2,000 | 2 | $0 | 99.5% | Zero setup, very fast locally | One writer at a time; one machine |
| Turso (libSQL) | 5,000 | 10 | $29 | 99.95% | SQLite close to users | SQLite's single-writer model |
| IBM Db2 | 6,000 | 20 | $500 | 99.99% | Mainframe-grade reliability | Expensive; niche skills |
| Apache Cassandra | 15,000 | 8 | $200 | 99.99% | Linear write scaling; No single point of failure | Queries must be designed up front; Eventual consistency |
| ScyllaDB | 40,000 | 3 | $250 | 99.99% | Several times Cassandra's throughput | Same data-modeling limits |
| Amazon DynamoDB | 20,000 | 8 | $150 | 99.999% | Single-digit ms at any scale; No servers to manage | Access patterns must be designed up front; Costs grow with traffic |
| Azure Cosmos DB | 15,000 | 10 | $200 | 99.999% | Global replication, tunable consistency | Request-unit pricing gets expensive |
| Google Firestore | 10,000 | 15 | $60 | 99.999% | Real-time listeners; Offline support | Limited queries; per-operation pricing |
| Google Bigtable | 10,000 | 6 | $470 | 99.99% | Petabyte scale, low latency | Minimum cluster cost |
| Couchbase | 20,000 | 4 | $180 | 99.95% | Fast key-value plus SQL-like queries | Memory hungry |
| Apache CouchDB | 3,000 | 15 | $60 | 99.9% | Multi-master sync | Slower queries |
| Apache HBase | 10,000 | 10 | $250 | 99.9% | Huge tables | Hadoop operations |
| Neo4j | 3,000 | 12 | $150 | 99.95% | Fast relationship queries (Cypher) | Harder to scale writes |
| ArangoDB | 5,000 | 10 | $120 | 99.9% | One engine for several models | Smaller community |
| RavenDB | 8,000 | 8 | $120 | 99.9% | ACID documents | .NET-centred community |
| SurrealDB | 5,000 | 10 | $80 | 99.9% | Documents, graphs and real-time queries | Young project |
| Fauna | 5,000 | 20 | $50 | 99.99% | Global consistency without servers | Proprietary query language |
| Aerospike | 100,000 | 1 | $300 | 99.995% | Millions of ops per second on SSDs | Enterprise features are paid |
| FoundationDB | 20,000 | 5 | $200 | 99.99% | Rock-solid transactions | Low-level: build your own layers |
| etcd | 10,000 | 3 | $40 | 99.99% | Strong consistency (Raft) | Small data only |
| Firebase Realtime Database | 5,000 | 20 | $25 | 99.95% | Real-time sync | Hard to query and scale |
| MongoDB Atlas | 8,000 | 15 | $60 | 99.95% | Fully managed, global clusters | Pricier than self-hosting |
| Amazon DocumentDB | 7,000 | 15 | $200 | 99.99% | Managed on AWS | Not every MongoDB feature |
| ClickHouse | 20,000 | 15 | $180 | 99.9% | Very fast aggregations over billions of rows; High compression | Not for frequent single-row updates; Limited joins |
| TimescaleDB | 8,000 | 15 | $120 | 99.9% | SQL plus time-series speed | Single-node writes |
| InfluxDB | 15,000 | 8 | $100 | 99.9% | High write rates, retention policies | Query language changed between versions |
| QuestDB | 40,000 | 5 | $90 | 99.9% | Very fast ingestion | Younger ecosystem |
| Apache Druid | 5,000 | 30 | $400 | 99.9% | Sub-second queries on streams | Many components to run |
| Apache Pinot | 10,000 | 20 | $400 | 99.9% | Low-latency analytics at high concurrency | Complex to operate |
| Snowflake | 200 | 800 | $2,000 | 99.9% | Elastic analytics with little tuning | Not for application traffic; Costs follow query volume |
| Google BigQuery | 100 | 1,500 | $1,000 | 99.99% | Petabyte SQL without servers | Seconds per query; not for app requests |
| Amazon Redshift | 200 | 900 | $1,200 | 99.9% | Deep AWS integration | Not for application traffic |
| DuckDB | 500 | 50 | $0 | 99.5% | Fast local analytics, zero setup | Single process |
| Pinecone | 2,000 | 25 | $70 | 99.95% | Managed vector search at scale | Proprietary; cost per pod |
| Weaviate | 2,500 | 20 | $80 | 99.9% | Vector plus keyword search | Memory hungry |
| Qdrant | 4,000 | 10 | $60 | 99.9% | Fast filtering with vectors | Younger ecosystem |
| Milvus | 5,000 | 15 | $150 | 99.9% | Scales to billions of vectors | Many components to run |
| Chroma | 1,000 | 15 | $30 | 99.5% | Easy to start with | Early for large production |
| PostgreSQL + pgvector | 2,000 | 30 | $90 | 99.9% | Vectors next to your relational data | Slower than dedicated vector stores at scale |

### Cache (`cache`, role: cache)

Stores frequently accessed data so requests can be served faster.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Hit rate | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Redis (default) | 40,000 | 1.5 | $25 | 99.9% | 70% | Sub-millisecond reads; Rich data types (lists, sets, sorted sets); Replication and optional persistence | Data must fit in memory; Stale data if invalidation is wrong |
| Memcached | 50,000 | 1.2 | $20 | 99.5% | 65% | Very simple and fast; Uses multiple CPU cores well | No persistence or replication: a restart empties it; Only plain key-value strings |
| Valkey | 40,000 | 1.5 | $25 | 99.9% | 70% | Redis-compatible, open license | Same single-thread limits as Redis |
| Dragonfly | 150,000 | 1 | $40 | 99.9% | 70% | Several times Redis's throughput per node | Younger project |
| KeyDB | 80,000 | 1.2 | $30 | 99.9% | 70% | Multi-threaded Redis | Less active development |
| Amazon ElastiCache (Redis/Valkey) | 40,000 | 1 | $50 | 99.99% | 70% | Managed failover and patching | Pricier than self-hosting |
| Amazon ElastiCache (Memcached) | 50,000 | 1 | $40 | 99.95% | 65% | Managed and simple | No persistence or replication |
| Azure Cache for Redis | 35,000 | 1.5 | $55 | 99.99% | 70% | Managed, zone redundant | Best within Azure |
| Google Memorystore | 35,000 | 1.5 | $50 | 99.99% | 70% | Fully managed | Best within Google Cloud |
| Upstash Redis | 10,000 | 5 | $10 | 99.95% | 70% | Pay per request, works from the edge | Higher latency than a local Redis |
| Hazelcast | 60,000 | 1 | $80 | 99.95% | 75% | Distributed maps and compute | JVM memory tuning |
| Apache Ignite | 50,000 | 1.5 | $90 | 99.95% | 75% | SQL over in-memory data | Complex to tune |
| Momento Cache | 20,000 | 3 | $20 | 99.99% | 70% | Nothing to provision | Proprietary service |
| In-process cache (Caffeine / LRU) | 500,000 | 0.05 | $0 | 99.9% | 60% | Fastest possible reads, free | Not shared between servers; lost on restart |
| Microsoft Garnet | 120,000 | 1 | $35 | 99.9% | 70% | Very high throughput | New project |

### Message Queue (`queue`, role: queue)

Buffers messages between services so work can be processed asynchronously.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| RabbitMQ (default) | 8,000 | 6 | $36 | 99.95% | Flexible routing between producers and consumers; Per-message acknowledgements and retries | Lower throughput than a log like Kafka; Messages are gone once consumed |
| Apache Kafka | 50,000 | 10 | $120 | 99.95% | Very high throughput; Keeps events so they can be replayed | More complex to run; Costly for small workloads |
| Amazon SQS | 3,000 | 20 | $15 | 99.99% | Nothing to run or patch; Cheap at low volume | Higher latency per message; Standard queues can deliver a message twice or out of order |
| Redpanda | 80,000 | 5 | $120 | 99.95% | Kafka API with lower latency | Source-available license |
| Amazon MSK | 50,000 | 10 | $250 | 99.95% | Managed Kafka brokers | Expensive minimum size |
| Confluent Cloud | 50,000 | 10 | $300 | 99.95% | Serverless Kafka with connectors | Costs grow with throughput |
| Apache Pulsar | 40,000 | 8 | $180 | 99.95% | Queues and streams in one; Geo-replication | More components than Kafka |
| NATS | 200,000 | 1 | $30 | 99.95% | Tiny, very fast pub/sub | Core NATS does not persist messages |
| NATS JetStream | 50,000 | 3 | $40 | 99.95% | Persistence with NATS's simplicity | Smaller ecosystem than Kafka |
| ActiveMQ Artemis | 20,000 | 4 | $40 | 99.95% | Standard JMS; many protocols | JVM tuning |
| Amazon MQ | 8,000 | 6 | $60 | 99.95% | Managed classic brokers | Lower scale than SQS |
| Amazon SNS | 30,000 | 25 | $10 | 99.99% | Fan out to many subscribers | Not a queue by itself |
| Amazon Kinesis Data Streams | 10,000 | 70 | $40 | 99.99% | Managed streaming with replay | Shard management |
| Amazon EventBridge | 10,000 | 50 | $10 | 99.99% | Rules route events with no code | Higher latency |
| Google Pub/Sub | 50,000 | 30 | $40 | 99.95% | Global and serverless | At-least-once delivery |
| Azure Service Bus | 10,000 | 15 | $50 | 99.99% | Sessions, transactions, dead letters | Best within Azure |
| Azure Event Hubs | 40,000 | 15 | $100 | 99.99% | Kafka-compatible and managed | Partitions sized up front |
| BullMQ / Bull (Redis) | 10,000 | 3 | $25 | 99.9% | Retries, delays and rate limits; Uses the Redis you already run | Bounded by Redis memory; Node.js only |
| Redis Streams | 30,000 | 2 | $25 | 99.9% | Simple if you already run Redis | Bounded by memory |
| ZeroMQ | 100,000 | 0.5 | $0 | 99.9% | Very fast, no broker to run | No persistence; you build delivery guarantees |
| Upstash QStash | 1,000 | 50 | $10 | 99.95% | Works from serverless and edge | HTTP delivery adds latency |
| beanstalkd | 10,000 | 2 | $20 | 99.9% | Very simple | No clustering |
| NSQ | 50,000 | 2 | $30 | 99.9% | Simple to scale out | No ordering guarantees |
| Temporal | 2,000 | 20 | $200 | 99.95% | Reliable long-running workflows | A cluster and new concepts to learn |

### Worker (`worker`, role: compute)

Processes background jobs taken from a queue.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Node.js Worker (default) | 1,500 | 15 | $42 | 99.9% | Takes slow work off the request path; Scales separately from the API | Jobs need retries and must be safe to run twice |
| Python (Celery) | 600 | 40 | $42 | 99.9% | Retries, scheduling and routing built in | Python is slower per task |
| Ruby (Sidekiq) | 1,000 | 25 | $42 | 99.9% | Efficient threads; Great Rails integration | Needs Redis |
| Go worker | 5,000 | 8 | $42 | 99.9% | High throughput, small memory | You build retries and scheduling |
| Java worker (Spring) | 3,500 | 12 | $55 | 99.9% | Mature libraries | Heavier memory use |
| .NET Worker Service | 4,500 | 10 | $50 | 99.9% | Fast and well tooled | Windows/.NET hosting knowledge |
| Rust worker | 8,000 | 5 | $42 | 99.9% | Highest throughput per instance | Slower to develop |
| PHP (Laravel Queues) | 500 | 40 | $42 | 99.9% | Built into Laravel | Low throughput per worker |
| Elixir (Oban) | 3,000 | 12 | $42 | 99.9% | Reliable, uses your database | Elixir only |
| .NET (Hangfire) | 1,500 | 20 | $50 | 99.9% | Easy scheduling and dashboard | Storage-backed: limited throughput |
| Temporal worker | 1,000 | 30 | $60 | 99.95% | Long-running, reliable workflows | Needs a Temporal cluster |
| AWS Lambda (event-driven) | 1,000 | 35 | $30 | 99.95% | No servers; scales with the queue | Time limits per invocation |
| Node.js (BullMQ) | 2,000 | 12 | $42 | 99.9% | Rate limiting, retries, delays | Needs Redis |

### Object Storage (`object-storage`, role: storage)

Stores large files such as images, videos and backups.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Amazon S3 (default) | 12,000 | 20 | $20 | 99.99% | Extremely durable; Cheap per GB and scales without limits | Higher latency than a disk or cache; Not a database: no queries over file contents |
| Google Cloud Storage | 12,000 | 20 | $20 | 99.99% | Strong consistency, global | Egress costs |
| Azure Blob Storage | 12,000 | 20 | $20 | 99.99% | Tiers from hot to archive | Egress costs |
| Cloudflare R2 | 10,000 | 25 | $15 | 99.99% | No egress fees; S3 API | Fewer features than S3 |
| Backblaze B2 | 5,000 | 40 | $6 | 99.9% | Very cheap storage | Higher latency |
| MinIO | 10,000 | 8 | $60 | 99.9% | S3 API anywhere; Fast on local disks | You operate the cluster |
| DigitalOcean Spaces | 5,000 | 30 | $5 | 99.9% | Cheap flat pricing | Lower rate limits |
| Wasabi | 5,000 | 35 | $7 | 99.9% | Cheap; no egress fees | 90-day minimum storage |
| Ceph (RADOS Gateway) | 15,000 | 10 | $200 | 99.95% | Block, file and object in one | Complex to operate |
| SeaweedFS | 20,000 | 5 | $50 | 99.9% | Very fast small files; S3 API | Smaller community |
| Supabase Storage | 3,000 | 30 | $25 | 99.9% | Row-level security on files | Platform coupling |
| UploadThing | 2,000 | 40 | $10 | 99.9% | Easy uploads from the browser | Fewer storage controls |

### Search (`search`, role: support)

Indexes data to answer full-text and filtered queries quickly.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Elasticsearch (default) | 1,500 | 30 | $90 | 99.9% | Fast full-text search and aggregations; Scales by adding nodes | A second copy of the data that must be kept in sync; Memory-hungry and costly to run |
| OpenSearch | 1,500 | 30 | $85 | 99.9% | Elasticsearch API, open license | Same JVM tuning as Elasticsearch |
| Amazon OpenSearch Service | 1,500 | 30 | $150 | 99.99% | Managed clusters | Pricier than self-hosting |
| Elastic Cloud | 1,800 | 28 | $180 | 99.99% | Managed, latest features | Costs grow with data |
| Apache Solr | 1,200 | 30 | $80 | 99.9% | Powerful relevance tuning | Older tooling |
| Meilisearch | 2,000 | 15 | $30 | 99.9% | Great results out of the box; Simple to run | Not for huge datasets |
| Typesense | 3,000 | 10 | $40 | 99.9% | Very fast instant search | Data must fit in memory |
| Algolia | 5,000 | 10 | $100 | 99.99% | Fast, hosted, great UI widgets | Expensive per record and search |
| Azure AI Search | 1,500 | 30 | $250 | 99.95% | Vector and semantic search | Best within Azure |
| Vespa | 3,000 | 20 | $200 | 99.95% | Ranking and serving at large scale | Steep learning curve |
| Manticore Search | 3,000 | 10 | $50 | 99.9% | Very fast full-text | Smaller ecosystem |
| PostgreSQL full-text search | 800 | 40 | $0 | 99.9% | No extra system | Weaker relevance, slows the database |
| ZincSearch | 1,000 | 20 | $25 | 99.5% | Small and simple | Fewer features |

### Authentication (`auth`, role: support)

Verifies who a user is and issues credentials for later requests.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Auth.js (self-hosted) (default) | 4,000 | 10 | $30 | 99.9% | Free and keeps user data in your own database; Supports many OAuth providers | You own security updates and session handling; MFA and account recovery are extra work |
| Auth0 | 5,000 | 25 | $70 | 99.99% | MFA, social logins and account recovery out of the box; Security handled by the provider | Cost grows with active users; Every login depends on an outside service |
| Amazon Cognito | 4,000 | 20 | $40 | 99.99% | Integrates with other AWS services; Generous free tier | Harder to customize than Auth0; Ties user accounts to AWS |
| Okta | 5,000 | 30 | $150 | 99.99% | Enterprise SSO and directories | Expensive |
| Clerk | 5,000 | 20 | $25 | 99.99% | Prebuilt sign-in UI | Costs per active user |
| Firebase Authentication | 5,000 | 25 | $10 | 99.99% | Free for most apps; Many providers | Tied to Firebase |
| Supabase Auth | 3,000 | 25 | $25 | 99.9% | Integrated with Postgres row-level security | Platform coupling |
| Keycloak | 2,000 | 20 | $60 | 99.9% | SSO, OIDC, SAML; self-hosted and free | Heavy JVM app to run |
| Ory Kratos | 4,000 | 10 | $40 | 99.9% | API-first, lightweight | You build the UI |
| Microsoft Entra ID | 5,000 | 30 | $60 | 99.99% | Enterprise and Microsoft 365 sign-in | Complex configuration |
| Google Identity Platform | 5,000 | 25 | $30 | 99.99% | Scales with Google | Best within Google Cloud |
| WorkOS | 4,000 | 25 | $125 | 99.99% | SAML/SSO in a few lines | Per-connection pricing |
| Stytch | 4,000 | 25 | $50 | 99.99% | Passkeys and magic links | Costs per user |
| authentik | 1,500 | 20 | $40 | 99.9% | Self-hosted SSO | You run and secure it |
| Authelia | 3,000 | 8 | $20 | 99.9% | Light, works with Traefik/NGINX | Not a full identity platform |
| FusionAuth | 3,000 | 15 | $50 | 99.9% | Free self-hosted community edition | Advanced features paid |
| ZITADEL | 3,000 | 15 | $50 | 99.95% | Multi-tenant out of the box | Younger ecosystem |
| Better Auth | 4,000 | 8 | $0 | 99.9% | Runs inside your app; free | You maintain it |
| Passport.js / JWT (in-app) | 4,000 | 5 | $0 | 99.9% | No extra service | Security is on you |
| HashiCorp Vault | 3,000 | 10 | $100 | 99.95% | Central secrets and dynamic credentials | Complex to operate |
