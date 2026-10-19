import { roleOf } from "../analysis.ts";
import { COMPONENT_IMPLEMENTATIONS, COMPONENT_TYPES } from "../componentLibrary.ts";
import { ASSUMPTIONS, AUTH_CHECK_RATE_DEFAULT, CAPACITY_MAX, DATABASE_REPLICAS_MAX, REPLICAS_MAX, SEARCH_RATE_DEFAULT } from "./capabilities.ts";
import { FINDING_THRESHOLDS } from "./findings.ts";
import { ARCHITECTURE_PENALTY, COST_REFERENCE, HEALTH_THRESHOLDS, SCORE_WEIGHTS, SCORING_RULES } from "./scoring.ts";
import { DEFAULT_TRAFFIC, REQUESTS_PER_USER_PER_SECOND } from "./traffic.ts";

// Renders docs/metrics-model.md from the engine's own constants, so the documented
// assumptions can never drift from what the engine does. Regenerate with
// `npm run docs:metrics`; a test fails when the file is out of date.

const n = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 3 });
const pct = (fraction: number) => `${n(Math.round(fraction * 100_000) / 1_000)}%`;
const money = (value: number) =>
  `$${value.toLocaleString("en-US", Number.isInteger(value) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const cell = (value: string) => value.replace(/\|/g, "\\|");

function technologyTables(): string[] {
  const out: string[] = [];
  for (const type of COMPONENT_TYPES) {
    const options = COMPONENT_IMPLEMENTATIONS.filter((implementation) => implementation.componentType === type.name);
    if (options.length === 0) continue;
    out.push(`### ${type.label} (\`${type.name}\`, role: ${roleOf(type.name)})`, "", type.description, "");
    if (type.name === "custom") {
      out.push("Not measured: passes requests on with no capacity limit, latency, cost or downtime of its own.", "");
      continue;
    }
    const hasHit = options.some((option) => option.hitRate !== null);
    const hasConnections = options.some((option) => option.connectionsPerInstance !== null);
    out.push(
      `| Technology | Capacity / instance (req/s) | Latency (ms) | Cost / instance / month | Availability / instance${hasHit ? " | Hit rate" : ""}${hasConnections ? " | Connections / instance" : ""} | Strengths | Trade-offs |`,
      `|---|---:|---:|---:|---:${hasHit ? "|---:" : ""}${hasConnections ? "|---:" : ""}|---|---|`,
    );
    for (const option of options) {
      out.push(
        [
          `${cell(option.name)}${option.isDefault ? " (default)" : ""}`,
          option.capacityPerInstance === null ? "no limit" : n(option.capacityPerInstance),
          n(option.latencyMs),
          money(option.monthlyCostPerInstance),
          pct(option.availability),
          ...(hasHit ? [option.hitRate === null ? "—" : pct(option.hitRate)] : []),
          ...(hasConnections ? [option.connectionsPerInstance === null ? "—" : n(option.connectionsPerInstance)] : []),
          cell(option.strengths.join("; ")),
          cell(option.tradeoffs.join("; ")),
        ].join(" | ").replace(/^/, "| ").concat(" |"),
      );
    }
    out.push("");
  }
  return out;
}

export function renderMetricsDoc(): string {
  const t = DEFAULT_TRAFFIC;
  const w = SCORE_WEIGHTS;
  const h = HEALTH_THRESHOLDS;
  const f = FINDING_THRESHOLDS;
  const a = ASSUMPTIONS;
  return [
    "# How ARCHITECH estimates metrics",
    "",
    "<!-- Generated from src/lib/architecture/evaluation (metricsDoc.ts). Do not edit by hand: run `npm run docs:metrics` in frontend/. -->",
    "",
    "Real-world trade-offs depend on far more than a diagram, so ARCHITECH does not try to predict exact production numbers.",
    "It uses a **transparent, weighted model** with the documented assumptions below. The goal is estimates that are",
    "**directionally correct and explainable**: adding a replica, a cache or a queue, or swapping PostgreSQL for MongoDB,",
    "moves the numbers the way it would in a real system, and every number can be traced back to this page.",
    "",
    "The engine is a pure function over the graph JSON (`evaluateArchitecture`). It runs in the browser, so the live",
    "metrics on the canvas update as components are added, removed, connected or reconfigured, without a server",
    "request. Results are memoized by a fingerprint that ignores names and positions, and re-evaluation is debounced.",
    "",
    "## Traffic",
    "",
    "| Setting | Default | Meaning |",
    "|---|---:|---|",
    `| Requests per second | ${n(t.requestsPerSecond)} | Peak load sent into the design (the live metrics' baseline). |`,
    `| Concurrent users | ${n(t.concurrentUsers)} | Used when no request rate is given: ${n(REQUESTS_PER_USER_PER_SECOND)} req/s per user. |`,
    `| Dataset | ${n(t.datasetGb)} GB | Size of stored data: adds storage cost, and slows databases as it grows. |`,
    `| API reads | ${n(t.readRatio)}% | Read share of API requests; the rest are writes. |`,
    `| Static files | ${n(t.staticShare)}% | Share of all requests that are static files (images, scripts, video). |`,
    `| Client network | ${n(t.networkLatencyMs)} ms | Round trip between the user and the system. |`,
    "",
    "## How requests flow",
    "",
    "- Clients split their load evenly among what they connect to. Load balancers and gateways send each request to one downstream service.",
    "- A service reads through its caches, writes through its queues, and otherwise goes to its data stores; several stores share the load.",
    "- A cache answers its hit rate of reads and passes the rest on. A cache with no onward connection is cache-aside: misses go to the store.",
    `- A queue accepts writes and hands them on at a smoothed rate: consumers see ${pct(a.queueSmoothing)} of the peak. Work behind a queue is asynchronous and does not add to the user's latency.`,
    "- Static files never touch the database. A CDN answers its hit rate of them at the edge; object storage serves the rest when connected; otherwise the service serves them itself.",
    `- Authentication is called for ${pct(AUTH_CHECK_RATE_DEFAULT)} of requests by default (JWTs are checked locally; only sign-ins and refreshes reach it). Search handles ${pct(SEARCH_RATE_DEFAULT)} of requests by default. Both are settings on the component.`,
    `- A write costs a database primary ${n(a.databaseWriteCost)}× a read. A dataset of ${n(a.databaseDatasetHalvingGb)} GB halves a database's capacity.`,
    "- Custom components (technologies ARCHITECH does not model, e.g. from an imported repository) pass requests on and are not measured.",
    "- Cycles are cut where they close. The flow is linear in the request rate, so it is computed once and scaled.",
    "",
    "## Per component",
    "",
    "- **Capacity:** instances × capacity per instance (the technology's number, or the component's own capacity setting).",
    `  Replicas: up to ${n(REPLICAS_MAX)} (a database's replicas are read replicas, up to ${n(DATABASE_REPLICAS_MAX)}); capacity settings up to ${n(CAPACITY_MAX)}.`,
    "- **Utilization:** load reaching the component ÷ its capacity. The design's capacity is the load at which the first component fills up (the limiting component).",
    "- **Cost:** instances × monthly cost per instance,",
    `  plus ${money(a.databaseCostPerGb)} per GB of the dataset on each database and ${money(a.storageCostPerGb)} per GB on object storage.`,
    "- **Availability:** a component with n instances is down only when all of them are: 1 − (1 − a)ⁿ. Along a path availabilities multiply; alternatives (replicas, shards, several upstreams) are averaged by the share of traffic they carry.",
    "",
    "## Latency",
    "",
    `- Each component adds its technology's idle latency, and each hop adds ${n(a.hopLatencyMs)} ms. The client's network adds ${pct(a.clientNetworkFactor)} of its round trip.`,
    `- As a component fills up its latency rises: unchanged below ${n(a.latencyKneePercent)}% utilization, then a steady rise (divisor ${n(a.latencyPressureDivisor)}), a steeper one once overloaded (divisor ${n(a.latencyOverloadDivisor)}), capped at ${n(a.latencyMaxMultiplier)}× idle.`,
    `- p95 latency is the slowest common request path. Branches carrying less than ${pct(a.p95BranchCutoff)} of a component's traffic do not shape it.`,
    "",
    "## Scores (0–100)",
    "",
    "| Category | Weight | How it is scored |",
    "|---|---:|---|",
    `| Scalability | ${pct(w.scalability)} | Capacity ÷ requested load: 2× or more is 100, exactly 1× is 70, below that it falls in proportion to what can be served. A queue backlog costs 15 points (5 if only close). |`,
    `| Reliability | ${pct(w.reliability)} | ${n(100 / SCORING_RULES.ninesForFullScore)} points per "nine" of uptime (99% = 2 nines), full marks at ${n(SCORING_RULES.ninesForFullScore)} nines. |`,
    `| Performance | ${pct(w.performance)} | p95 at or under ${n(SCORING_RULES.latencyFullScoreMs)} ms is 100; every doubling above costs the same, reaching 0 at ${n(SCORING_RULES.latencyZeroMs)} ms. |`,
    `| Cost efficiency | ${pct(w.costEfficiency)} | Against a reference of ${money(COST_REFERENCE.baseMonthly)}/month + ${money(COST_REFERENCE.perThousandRps)} per 1,000 req/s: at or under it is 100, ${n(SCORING_RULES.costZeroMultiple)}× it is 0. Multiplied by the share of load actually served. |`,
    "",
    `The overall score is the weighted average, minus up to ${n(ARCHITECTURE_PENALTY.max)} points for architecture findings (high ${n(ARCHITECTURE_PENALTY.high)}, medium ${n(ARCHITECTURE_PENALTY.medium)}, low ${n(ARCHITECTURE_PENALTY.low)}), so a structurally broken design cannot score well on its other numbers.`,
    "",
    "## Health",
    "",
    `- **Critical:** a component at ${pct(h.criticalUtilization)} of capacity or more, uptime below ${pct(h.criticalAvailability)}, or p95 of ${n(h.criticalLatencyMs)} ms or more.`,
    `- **Warning:** a component at ${pct(a.nearCapacityUtilization)} of capacity or more, uptime below ${pct(h.warningAvailability)}, p95 of ${n(h.warningLatencyMs)} ms or more, or a high-severity finding.`,
    "",
    "## Findings (thresholds)",
    "",
    `- Slow path: p95 of ${n(f.slowMediumMs)} ms (medium) or ${n(f.slowHighMs)} ms (high); a request path of ${n(f.longPathComponents)} or more components.`,
    `- Low availability: below ${pct(f.lowAvailability)} (medium) or ${pct(f.veryLowAvailability)} (high); single points of failure (a single-instance component whose failure cuts off the request path; CDNs, DNS and custom components are excluded).`,
    `- Over-provisioned: a component below ${pct(f.overprovisionedUtilization)} utilization.`,
    `- Components that serve no requests: medium when their cost is ${pct(f.idleCostShareForMedium)} or more of the total, otherwise low.`,
    `- A cache when reads are under ${pct(f.lowReadShare)} of API requests; a service spending ${pct(f.staticOnServerShare)} or more of its work on static files.`,
    "- Structure: no client, no backend, unreachable components, questionable connections (e.g. a client straight to a database), cycles.",
    "",
    "## Technologies",
    "",
    "Each component's numbers come from its chosen technology. Swapping the technology re-evaluates the whole design;",
    "the technology picker shows each option's effect on the design's score, p95, cost and uptime side by side.",
    "",
    ...technologyTables(),
  ].join("\n");
}
