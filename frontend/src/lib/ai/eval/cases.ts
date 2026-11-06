import type { GraphDocument } from "../../projects/projectPayload.ts";

// The AI Architect regression set: reference designs, each with one known problem, a question
// a learner would ask, and what a good answer must contain. Used twice:
//   - tests/aiEvalCases.test.ts (always): the engine's pre-checks find the problem and it reaches
//     the prompt, naming the right component. Deterministic, no AI call.
//   - scripts/eval-ai.ts (npm run eval:ai): asks the configured AI and scores its answers.
// Component labels are distinctive so an answer can be checked for naming the right one.

export type EvalCase = {
  id: string;
  problem: string;
  graph: GraphDocument;
  traffic?: Record<string, number>;
  question: string;
  focus?: string[];
  // The engine finding (id prefix) that must flag the problem; "" means none of high severity.
  finding: string;
  // Labels the answer must name, and patterns it must match (case-insensitive).
  mustMention: string[];
  mustMatch: RegExp[];
  // When a suggestion is made: it must include one of these kinds of change (of this component
  // type, for add_component) and must not worsen this metric.
  suggestion?: { ops: string[]; type?: string; improves: "score" | "capacityRps" | "p95LatencyMs" | "uptimePercent" };
};

let x = 0;
const node = (id: string, type: string, label: string, properties?: Record<string, number>, implementation?: string) => ({
  id,
  type: "architecture" as const,
  position: { x: (x += 200), y: 0 },
  data: { type, label, ...(implementation ? { implementation } : {}), ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });
const graph = (nodes: ReturnType<typeof node>[], edges: [string, string][]): GraphDocument =>
  ({ schemaVersion: 1, nodes, edges: edges.map(([s, t]) => edge(s, t)) }) as GraphDocument;

const users = node("client-1", "client", "Shoppers");

export const EVAL_CASES: EvalCase[] = [
  {
    id: "spof-single-server",
    problem: "One API server: if it fails, everything behind it is cut off.",
    graph: graph(
      [users, node("server-1", "server", "Checkout API"), node("database-1", "database", "Orders DB", { replicas: 2 })],
      [["client-1", "server-1"], ["server-1", "database-1"]],
    ),
    question: "What is the biggest reliability risk in my design?",
    finding: "spof",
    mustMention: ["Checkout API"],
    mustMatch: [/single point of failure|redundan|replica|(second|another|more) instance/i],
    suggestion: { ops: ["set_setting", "add_component"], improves: "uptimePercent" },
  },
  {
    id: "saturated-server",
    problem: "One server at 6,000 req/s is far over capacity.",
    graph: graph(
      [users, node("server-1", "server", "Ticket API"), node("database-1", "database", "Tickets DB", { replicas: 2 })],
      [["client-1", "server-1"], ["server-1", "database-1"]],
    ),
    traffic: { requestsPerSecond: 6_000 },
    question: "What breaks first as traffic grows?",
    finding: "saturated-server-1",
    mustMention: ["Ticket API"],
    mustMatch: [/capacity|overload|saturat|bottleneck|can'?t keep up|limit/i, /replica|instance|scale/i],
    suggestion: { ops: ["set_setting", "add_component"], improves: "capacityRps" },
  },
  {
    id: "missing-cache",
    problem: "A read-heavy API reads everything from the database; no cache.",
    graph: graph(
      [users, node("server-1", "server", "Catalog API", { replicas: 12 }), node("database-1", "database", "Products DB", { replicas: 2 })],
      [["client-1", "server-1"], ["server-1", "database-1"]],
    ),
    // At this load the database is the limit; a cache roughly doubles capacity.
    traffic: { requestsPerSecond: 9_000, readRatio: 95, staticShare: 0 },
    question: "How can I make reads faster and take load off the database?",
    finding: "cache-opportunity",
    mustMention: ["Products DB"],
    mustMatch: [/cache/i],
    suggestion: { ops: ["add_component"], type: "cache", improves: "capacityRps" },
  },
  {
    id: "client-to-database",
    problem: "The client talks to the database directly, bypassing the service.",
    graph: graph(
      [users, node("server-1", "server", "Profile API", { replicas: 2 }), node("database-1", "database", "Profiles DB", { replicas: 2 })],
      [["client-1", "server-1"], ["server-1", "database-1"], ["client-1", "database-1"]],
    ),
    question: "Is anything wired up wrong?",
    finding: "connection",
    mustMention: ["Profiles DB"],
    mustMatch: [/direct|bypass|through (the|your|an?) (api|service|server)/i],
  },
  {
    id: "queue-without-consumer",
    problem: "Writes go into a queue that nothing reads.",
    graph: graph(
      [users, node("server-1", "server", "Upload API", { replicas: 2 }), node("queue-1", "queue", "Upload Jobs"), node("database-1", "database", "Uploads DB", { replicas: 2 })],
      [["client-1", "server-1"], ["server-1", "queue-1"], ["server-1", "database-1"]],
    ),
    question: "Is my queue set up correctly?",
    finding: "queue-no-consumer",
    mustMention: ["Upload Jobs"],
    mustMatch: [/worker|consumer|nothing (reads|processes|consumes)|no one (reads|processes)/i],
    suggestion: { ops: ["add_component"], type: "worker", improves: "score" },
  },
  {
    id: "database-without-replica",
    problem: "A single database instance: losing it loses the data path.",
    graph: graph(
      [users, node("lb-1", "load-balancer", "Edge LB", { replicas: 2 }), node("server-1", "server", "Billing API", { replicas: 3 }), node("database-1", "database", "Invoices DB")],
      [["client-1", "lb-1"], ["lb-1", "server-1"], ["server-1", "database-1"]],
    ),
    question: "How can I make this more reliable?",
    finding: "database-redundancy-database-1",
    mustMention: ["Invoices DB"],
    mustMatch: [/replica|standby|failover|redundan/i],
    suggestion: { ops: ["set_setting", "add_component"], improves: "uptimePercent" },
  },
  {
    id: "static-files-on-servers",
    problem: "Most traffic is static files, served by the API servers.",
    graph: graph(
      [users, node("server-1", "server", "Media Site API", { replicas: 2 }), node("database-1", "database", "Media DB", { replicas: 2 })],
      [["client-1", "server-1"], ["server-1", "database-1"]],
    ),
    traffic: { requestsPerSecond: 4_000, staticShare: 80 },
    question: "My servers are busy. What would take load off them?",
    finding: "static-on-servers",
    mustMention: ["Media Site API"],
    mustMatch: [/cdn|object storage|static/i],
  },
  {
    id: "unreachable-database",
    problem: "A database that nothing connects to.",
    graph: graph(
      [users, node("server-1", "server", "Search API", { replicas: 2 }), node("database-1", "database", "Search DB", { replicas: 2 }), node("database-2", "database", "Archive DB")],
      [["client-1", "server-1"], ["server-1", "database-1"]],
    ),
    question: "Does every component in my design get used?",
    finding: "idle-components",
    mustMention: ["Archive DB"],
    mustMatch: [/not connected|unreachable|no requests|unused|isolated|nothing (connects|reaches)|idle/i],
  },
  {
    id: "overprovisioned",
    problem: "Forty API servers for 300 req/s: mostly idle and expensive.",
    graph: graph(
      [users, node("lb-1", "load-balancer", "Front LB", { replicas: 2 }), node("server-1", "server", "Blog API", { replicas: 40 }), node("database-1", "database", "Posts DB", { replicas: 2 })],
      [["client-1", "lb-1"], ["lb-1", "server-1"], ["server-1", "database-1"]],
    ),
    traffic: { requestsPerSecond: 300 },
    question: "How can I make this cheaper?",
    finding: "overprovisioned-server-1",
    mustMention: ["Blog API"],
    mustMatch: [/fewer|reduce|over-?provision|idle|too many|scale (it )?down/i],
    suggestion: { ops: ["set_setting", "remove_component"], improves: "score" },
  },
  {
    id: "slow-path",
    problem: "A chain of slow hops at heavy load pushes p95 up.",
    graph: graph(
      [users, node("server-1", "server", "Feed API"), node("search-1", "search", "Feed Search"), node("database-1", "database", "Feed DB")],
      [["client-1", "server-1"], ["server-1", "search-1"], ["server-1", "database-1"]],
    ),
    traffic: { requestsPerSecond: 2_500 },
    question: "Why are my requests slow?",
    finding: "saturated",
    mustMention: ["Feed API"],
    mustMatch: [/latency|p95|slow|ms\b/i],
  },
  {
    id: "focus-cache-and-db",
    problem: "Asked about a boxed part only: the cache and the database.",
    graph: graph(
      [users, node("lb-1", "load-balancer", "Main LB", { replicas: 2 }), node("server-1", "server", "Store API", { replicas: 3 }), node("cache-1", "cache", "Hot Items Cache"), node("database-1", "database", "Store DB", { replicas: 2 })],
      [["client-1", "lb-1"], ["lb-1", "server-1"], ["server-1", "cache-1"], ["cache-1", "database-1"]],
    ),
    question: "Explain this part of the system",
    focus: ["cache-1", "database-1"],
    finding: "spof-cache-1",
    mustMention: ["Hot Items Cache", "Store DB", "Store API"],
    mustMatch: [/miss|hit/i],
  },
  {
    id: "healthy-baseline",
    problem: "A sound design: the answer should not invent an outage risk for the redundant API.",
    graph: graph(
      [users, node("lb-1", "load-balancer", "Main LB", { replicas: 2 }), node("server-1", "server", "Notes API", { replicas: 3 }), node("cache-1", "cache", "Notes Cache", { replicas: 2 }), node("database-1", "database", "Notes DB", { replicas: 2 })],
      [["client-1", "lb-1"], ["lb-1", "server-1"], ["server-1", "cache-1"], ["cache-1", "database-1"]],
    ),
    traffic: { requestsPerSecond: 4_000, staticShare: 0 },
    question: "Is there anything seriously wrong with my design?",
    // "" = no high-severity finding at all.
    finding: "",
    mustMention: [],
    mustMatch: [/(no|nothing|not) (serious|major|critical|big)|looks (solid|good|healthy|sound)|well[- ]designed|in good shape/i],
  },
];
