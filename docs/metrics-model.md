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
- Custom components (technologies ARCHITECH does not model, e.g. from an imported repository) pass requests on and are not measured.
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

### Web App (`web-app`, role: entry)

A browser-based frontend that renders the interface and calls backend APIs.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Next.js (default) | no limit | 0 | $0 | 100% | Server rendering helps first-load speed and SEO; Frontend and API routes in one project | Server rendering needs a running server, not just static hosting; More framework conventions to learn than a plain SPA |
| React SPA (Vite) | no limit | 0 | $0 | 100% | Static files: cheap to host and easy to put behind a CDN; Simple build and deploy | Rendered in the browser, so the first load is slower; Weaker SEO without extra work |

### Mobile App (`mobile-app`, role: entry)

A native iOS or Android application that calls backend APIs.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| React Native (default) | no limit | 0 | $0 | 100% | One codebase for iOS and Android; Shares skills with the React web app | Some features need native modules; Releases go through app store review |

### CDN (`cdn`, role: edge)

Serves static content from edge locations close to the user.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Hit rate | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Cloudflare CDN (default) | 50,000 | 10 | $40 | 99.99% | 95% | Very large edge network; DDoS protection included | Only helps content that can be cached; Cache invalidation adds a deploy step |
| Amazon CloudFront | 50,000 | 12 | $45 | 99.99% | 93% | Tight integration with S3 and AWS load balancers; Fine-grained cache rules | Pay-per-request pricing is harder to predict; Ties the design more closely to AWS |

### DNS (`dns`, role: edge)

Resolves domain names to the addresses of servers or load balancers.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Hit rate | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Amazon Route 53 (default) | 100,000 | 5 | $5 | 99.99% | 0% | Highly available managed service; Health-check-based failover | Record changes take time to spread because of TTLs |

### API Server (`server`, role: compute)

Runs application logic and handles requests from clients.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Node.js (Express) (default) | 2,500 | 20 | $42 | 99.9% | 20,000 | Same language as the frontend; Handles many concurrent I/O-bound requests well | CPU-heavy work blocks the event loop; Uses one CPU core per process unless clustered |
| Go (net/http) | 6,000 | 12 | $42 | 99.9% | 20,000 | High throughput per instance; Low memory use and fast startup | More verbose for business logic; Smaller web ecosystem than Node.js |
| Python (FastAPI) | 1,800 | 25 | $42 | 99.9% | 20,000 | Fast to develop; Direct access to Python's data and ML libraries | Lower throughput per instance; The GIL limits CPU-bound work in one process |
| Java (Spring Boot) | 4,000 | 15 | $55 | 99.9% | 20,000 | Strong performance once warmed up; Large, mature ecosystem | Higher memory use, so larger instances cost more; Slower startup |

### API Gateway (`api-gateway`, role: ingress)

Single entry point that routes, authenticates and rate-limits API traffic.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Amazon API Gateway (default) | 10,000 | 8 | $54 | 99.95% | 100,000 | Fully managed, scales automatically; Built-in throttling and auth | Adds a hop of latency to every request; Per-request pricing at high volume |

### Custom (`custom`, role: custom)

A technology ARCHITECH does not model, such as one found in an imported repository. Drawn and connected, but not measured.

Not measured: passes requests on with no capacity limit, latency, cost or downtime of its own.

### API (`api`, role: ingress)

How clients call your services: REST, GraphQL, gRPC or WebSocket. Pick the protocol as its technology.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| REST (default) | 8,000 | 3 | $30 | 99.95% | — | Simple and universally supported; Responses cache well with HTTP caching and CDNs | Screens often need several requests; Responses can include more data than needed |
| GraphQL | 5,000 | 6 | $36 | 99.95% | — | One request fetches exactly what the screen needs; Typed schema shared by frontend and backend | Planning and resolving queries costs more server work; Harder to cache than plain HTTP responses |
| gRPC | 15,000 | 1.5 | $30 | 99.95% | — | Lowest latency and smallest messages; Streaming and strict contracts between services | Browsers need a proxy (gRPC-Web); Binary messages are harder to inspect and debug |
| WebSocket | 10,000 | 2 | $40 | 99.9% | 50,000 | Real-time push (chat, live tracking, notifications); No polling overhead | Every connected user holds a connection open; Harder to load-balance and scale than requests |

### Load Balancer (`load-balancer`, role: ingress)

Distributes incoming traffic across multiple servers.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Connections / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| NGINX (default) | 12,000 | 4 | $48 | 99.99% | 200,000 | Very fast and widely used; Can also serve static files and terminate TLS | You run, patch and scale it yourself; It is a single point of failure unless you run two |
| AWS Application Load Balancer | 15,000 | 5 | $40 | 99.99% | 250,000 | Managed, with health checks and auto scaling built in; Spread across availability zones automatically | AWS-specific; Pricing depends on traffic, not just running time |
| HAProxy | 14,000 | 3 | $45 | 99.99% | 200,000 | Very low added latency; Detailed traffic control and statistics | Self-managed; Configuration is harder to learn |

### Database (`database`, role: database)

Stores persistent application data.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| PostgreSQL (default) | 5,000 | 24 | $90 | 99.9% | ACID transactions and strong consistency; Powerful queries, joins and indexes; Read replicas for scaling reads | Writes scale on one primary; sharding is manual; Schema changes need migrations |
| MySQL | 5,500 | 22 | $85 | 99.9% | Fast for simple, read-heavy workloads; Very widely hosted and supported | Fewer advanced SQL features than PostgreSQL; Writes still scale on one primary |
| MongoDB | 6,500 | 18 | $110 | 99.9% | Flexible schema for changing data; Built-in sharding for horizontal scale | Joins and multi-document transactions are weaker; Easy to end up with inconsistent data shapes |

### Cache (`cache`, role: cache)

Stores frequently accessed data so requests can be served faster.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Hit rate | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---:|---|---|
| Redis (default) | 40,000 | 1.5 | $25 | 99.9% | 70% | Sub-millisecond reads; Rich data types (lists, sets, sorted sets); Replication and optional persistence | Data must fit in memory; Stale data if invalidation is wrong |
| Memcached | 50,000 | 1.2 | $20 | 99.5% | 65% | Very simple and fast; Uses multiple CPU cores well | No persistence or replication: a restart empties it; Only plain key-value strings |

### Message Queue (`queue`, role: queue)

Buffers messages between services so work can be processed asynchronously.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| RabbitMQ (default) | 8,000 | 6 | $36 | 99.95% | Flexible routing between producers and consumers; Per-message acknowledgements and retries | Lower throughput than a log like Kafka; Messages are gone once consumed |
| Apache Kafka | 50,000 | 10 | $120 | 99.95% | Very high throughput; Keeps events so they can be replayed | More complex to run; Costly for small workloads |
| Amazon SQS | 3,000 | 20 | $15 | 99.99% | Nothing to run or patch; Cheap at low volume | Higher latency per message; Standard queues can deliver a message twice or out of order |

### Worker (`worker`, role: compute)

Processes background jobs taken from a queue.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Node.js Worker (default) | 1,500 | 15 | $42 | 99.9% | Takes slow work off the request path; Scales separately from the API | Jobs need retries and must be safe to run twice |

### Object Storage (`object-storage`, role: storage)

Stores large files such as images, videos and backups.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Amazon S3 (default) | 12,000 | 20 | $20 | 99.99% | Extremely durable; Cheap per GB and scales without limits | Higher latency than a disk or cache; Not a database: no queries over file contents |

### Search (`search`, role: support)

Indexes data to answer full-text and filtered queries quickly.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Elasticsearch (default) | 1,500 | 30 | $90 | 99.9% | Fast full-text search and aggregations; Scales by adding nodes | A second copy of the data that must be kept in sync; Memory-hungry and costly to run |

### Authentication (`auth`, role: support)

Verifies who a user is and issues credentials for later requests.

| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance | Strengths | Trade-offs |
|---|---:|---:|---:|---:|---|---|
| Auth.js (self-hosted) (default) | 4,000 | 10 | $30 | 99.9% | Free and keeps user data in your own database; Supports many OAuth providers | You own security updates and session handling; MFA and account recovery are extra work |
| Auth0 | 5,000 | 25 | $70 | 99.99% | MFA, social logins and account recovery out of the box; Security handled by the provider | Cost grows with active users; Every login depends on an outside service |
| Amazon Cognito | 4,000 | 20 | $40 | 99.99% | Integrates with other AWS services; Generous free tier | Harder to customize than Auth0; Ties user accounts to AWS |
