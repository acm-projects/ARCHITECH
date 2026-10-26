import type { Change } from "../../ai/changes.ts";
import type { GraphInput } from "../graph.ts";
import { applyIncident, incidentImpact, type Incident, type IncidentImpact, type OperationId } from "./incidents.ts";
import { sanitizeTraffic, type TrafficProfile } from "../evaluation/traffic.ts";

// Incident Lab: authored scenarios. Each gives a working design and an incident; the learner
// names the weakness, changes the design, and the server replays the same incident on their
// version and checks the goal. The root cause, debrief and known fix stay on the server until an
// attempt is graded (the fix is used by the tests to prove each scenario can be passed).

export type ScenarioGoal = {
  // Percent of API requests still answered during the incident.
  servedAtLeast: number;
  // Operations that must still fully work during the incident.
  mustWork: OperationId[];
  // p95 latency during the incident.
  p95AtMostMs?: number;
  // Monthly cost of the revised design (healthy), so "add 50 of everything" does not pass.
  budgetAtMost?: number;
};

export type IncidentScenario = {
  id: string;
  title: string;
  // The system, in a sentence or two.
  brief: string;
  // What users notice when the incident hits.
  symptom: string;
  goal: ScenarioGoal;
  design: { nodes: ScenarioNode[]; edges: { id: string; source: string; target: string }[] };
  traffic: Partial<TrafficProfile>;
  incident: Incident;
  rootCause: { nodeIds: string[]; text: string };
  debrief: { weakness: string; mitigation: string; tradeoff: string };
  knownFix: Change[];
};

type ScenarioNode = { id: string; type: "architecture"; position: { x: number; y: number }; data: { type: string; label: string; properties?: Record<string, number> } };

const node = (id: string, type: string, label: string, x: number, y: number, properties?: Record<string, number>): ScenarioNode => ({
  id,
  type: "architecture",
  position: { x, y },
  data: { type, label, ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });

export const INCIDENT_SCENARIOS: readonly IncidentScenario[] = [
  {
    id: "database-outage",
    title: "The database's only server fails",
    brief: "A store: shoppers go through a load balancer to two API servers, which keep orders in one PostgreSQL database.",
    symptom: "Every page that shows or saves an order fails at once.",
    goal: { servedAtLeast: 99, mustWork: ["read", "save"], budgetAtMost: 450 },
    design: {
      nodes: [
        node("client-1", "client", "Shoppers", 0, 0),
        node("load-balancer-1", "load-balancer", "Load balancer", 240, 0),
        node("server-1", "server", "Store API", 480, 0, { replicas: 2 }),
        node("database-1", "database", "Orders DB", 720, 0),
      ],
      edges: [edge("client-1", "load-balancer-1"), edge("load-balancer-1", "server-1"), edge("server-1", "database-1")],
    },
    traffic: { requestsPerSecond: 800 },
    incident: { kind: "instance-down", nodeId: "database-1" },
    rootCause: { nodeIds: ["database-1"], text: "Orders DB runs on a single server, so losing it loses every read and write." },
    debrief: {
      weakness: "The database was a single point of failure: one server, no replica to take over.",
      mitigation: "A read replica can be promoted when the primary fails, so the database keeps answering (here the engine treats one instance lost and the replica carrying on).",
      tradeoff: "Each replica costs as much as the primary, and replicas lag the primary slightly, so a read right after a write can be stale.",
    },
    knownFix: [{ op: "set_setting", node: "database-1", key: "replicas", value: 1 }],
  },
  {
    id: "cache-outage",
    title: "The cache goes down and takes the database with it",
    brief: "A news site: readers reach three API servers, which read articles through a Redis cache in front of the database. 90% of requests are reads.",
    symptom: "The whole site stops loading, even though the database is fine.",
    goal: { servedAtLeast: 99, mustWork: ["read", "save"], p95AtMostMs: 300, budgetAtMost: 900 },
    design: {
      nodes: [
        node("client-1", "client", "Readers", 0, 0),
        node("load-balancer-1", "load-balancer", "Load balancer", 240, 0),
        node("server-1", "server", "News API", 480, 0, { replicas: 3 }),
        node("cache-1", "cache", "Redis", 720, 0),
        node("database-1", "database", "Articles DB", 960, 0),
      ],
      edges: [edge("client-1", "load-balancer-1"), edge("load-balancer-1", "server-1"), edge("server-1", "cache-1"), edge("cache-1", "database-1")],
    },
    traffic: { requestsPerSecond: 2_000, readRatio: 90 },
    incident: { kind: "component-down", nodeId: "cache-1" },
    rootCause: { nodeIds: ["cache-1"], text: "The API servers reach the database only through Redis, so the cache is on the only path to the data." },
    debrief: {
      weakness: "A cache meant to speed reads up became the only way to the database: when it went down, so did every request.",
      mitigation: "Let the API servers reach the database directly when the cache misses or is down, and make sure the database can carry the reads the cache was absorbing.",
      tradeoff: "Without the cache every read hits the database, so it needs the capacity for the full load (replicas cost money), and pages are slower until the cache is back.",
    },
    knownFix: [
      { op: "connect", from: "server-1", to: "database-1" },
      { op: "set_setting", node: "database-1", key: "replicas", value: 2 },
    ],
  },
  {
    id: "lost-server",
    title: "One API server crashes at peak",
    brief: "A ticketing site at its busiest hour: a load balancer spreads requests over two API servers, each fairly busy, writing to one database with a replica.",
    symptom: "Half the requests time out, and the server that is left is overwhelmed.",
    goal: { servedAtLeast: 99, mustWork: ["use-app", "read", "save"], budgetAtMost: 600 },
    design: {
      nodes: [
        node("client-1", "client", "Fans", 0, 0),
        node("load-balancer-1", "load-balancer", "Load balancer", 240, 0),
        node("server-1", "server", "Tickets API", 480, 0, { replicas: 2 }),
        node("database-1", "database", "Tickets DB", 720, 0, { replicas: 1 }),
      ],
      edges: [edge("client-1", "load-balancer-1"), edge("load-balancer-1", "server-1"), edge("server-1", "database-1")],
    },
    traffic: { requestsPerSecond: 3_500 },
    incident: { kind: "instance-down", nodeId: "server-1" },
    rootCause: { nodeIds: ["server-1"], text: "Two servers at 70% each cannot lose one: the survivor would need 140% of its capacity." },
    debrief: {
      weakness: "There was no spare capacity: the servers were sized for normal operation, not for one of them failing.",
      mitigation: "Run enough instances that the rest can carry the peak when one fails (N+1): here three, so two can take the load.",
      tradeoff: "The spare instance is paid for all the time and mostly idle; autoscaling can add it on demand, but it takes time to start.",
    },
    knownFix: [{ op: "set_setting", node: "server-1", key: "replicas", value: 3 }],
  },
  {
    id: "slow-worker",
    title: "The image worker slows to a crawl",
    brief: "A photo app: uploads are saved and a job is queued for a worker that makes thumbnails. A bad deploy makes the worker ten times slower.",
    symptom: "Uploads still succeed, but thumbnails take longer and longer to appear.",
    goal: { servedAtLeast: 99, mustWork: ["jobs", "save"], budgetAtMost: 700 },
    design: {
      nodes: [
        node("client-1", "client", "Users", 0, 0),
        node("server-1", "server", "Photos API", 240, 0, { replicas: 2 }),
        node("database-1", "database", "Photos DB", 480, -80, { replicas: 1 }),
        node("queue-1", "queue", "Thumbnail jobs", 480, 80),
        node("worker-1", "worker", "Thumbnail worker", 720, 80),
      ],
      edges: [edge("client-1", "server-1"), edge("server-1", "database-1"), edge("server-1", "queue-1"), edge("queue-1", "worker-1"), edge("worker-1", "database-1")],
    },
    traffic: { requestsPerSecond: 1_500, readRatio: 40 },
    incident: { kind: "capacity-drop", nodeId: "worker-1", factor: 0.1 },
    rootCause: { nodeIds: ["worker-1"], text: "One worker had plenty of room at its normal speed, but at a tenth of it jobs arrive faster than it finishes them." },
    debrief: {
      weakness: "The queue hid the problem: requests kept succeeding while the backlog grew without limit.",
      mitigation: "Run more worker instances so the slowed workers together still keep up, and watch the queue's depth so a backlog is noticed early.",
      tradeoff: "More workers cost more while they sit idle; rolling back the bad deploy is the real fix, extra workers buy time.",
    },
    knownFix: [{ op: "set_setting", node: "worker-1", key: "replicas", value: 3 }],
  },
];

export const scenarioById = (id: string) => INCIDENT_SCENARIOS.find((scenario) => scenario.id === id);
export const scenarioTraffic = (scenario: IncidentScenario): TrafficProfile => sanitizeTraffic(scenario.traffic).traffic;

// What the learner sees before attempting: no root cause, debrief or fix.
export function scenarioView(scenario: IncidentScenario) {
  const traffic = scenarioTraffic(scenario);
  const impact = incidentImpact(scenario.design as GraphInput, traffic, scenario.incident);
  return {
    id: scenario.id,
    title: scenario.title,
    brief: scenario.brief,
    symptom: scenario.symptom,
    goal: scenario.goal,
    design: scenario.design,
    traffic,
    incident: { ...scenario.incident, description: applyIncident(scenario.design as GraphInput, traffic, scenario.incident).description },
    // The incident on the starting design: what breaks and the numbers.
    impact: { operations: impact.operations, healthy: impact.healthy, during: impact.during },
  };
}

export type GoalCheck = { id: string; label: string; passed: boolean; detail: string };
export type GradedIncident = {
  passed: boolean;
  checks: GoalCheck[];
  diagnosis: { picked: string; correct: boolean; explanation: string } | null;
  // The incident replayed on the learner's design.
  impact: IncidentImpact | null;
  debrief: IncidentScenario["debrief"] & { rootCause: string };
};

// Grades a revised design (and, optionally, a diagnosis) against a scenario.
export function gradeIncidentAttempt(scenario: IncidentScenario, attempt: { graph?: GraphInput; diagnosis?: string }): GradedIncident {
  const traffic = scenarioTraffic(scenario);
  const diagnosis =
    attempt.diagnosis === undefined
      ? null
      : {
          picked: attempt.diagnosis,
          correct: scenario.rootCause.nodeIds.includes(attempt.diagnosis),
          explanation: scenario.rootCause.text,
        };

  let impact: IncidentImpact | null = null;
  const checks: GoalCheck[] = [];
  if (attempt.graph) {
    const graph = attempt.graph;
    const target = "nodeId" in scenario.incident ? scenario.incident.nodeId : null;
    const kept = target === null || graph.nodes.some((candidate) => candidate.id === target);
    const targetName = target ? (scenario.design.nodes.find((candidate) => candidate.id === target)?.data.label ?? target) : "";
    checks.push({
      id: "kept",
      label: target ? `${targetName} is still in the design` : "The design is complete",
      passed: kept,
      detail: kept ? "The incident is replayed on your design." : `Removing ${targetName} does not make it fail-proof: keep it and make the design survive losing it.`,
    });
    if (kept) {
      impact = incidentImpact(graph, traffic, scenario.incident);
      const { goal } = scenario;
      checks.push({
        id: "served",
        label: `At least ${goal.servedAtLeast}% of requests are still answered`,
        passed: impact.during.servedPercent >= goal.servedAtLeast,
        detail: `${Math.round(impact.during.servedPercent * 10) / 10}% are answered during the incident.`,
      });
      for (const id of goal.mustWork) {
        const operation = impact.operations.find((candidate) => candidate.id === id);
        checks.push({
          id: `works-${id}`,
          label: `${operation?.label ?? id} still works`,
          passed: operation?.status === "works",
          detail: operation ? `${operation.label}: ${operation.status}${operation.note ? `. ${operation.note}` : ""}` : "Your design no longer has this.",
        });
      }
      if (goal.p95AtMostMs !== undefined) {
        checks.push({
          id: "p95",
          label: `p95 stays under ${goal.p95AtMostMs} ms`,
          passed: impact.during.ready && impact.during.p95LatencyMs <= goal.p95AtMostMs,
          detail: `p95 is ${Math.round(impact.during.p95LatencyMs)} ms during the incident.`,
        });
      }
      if (goal.budgetAtMost !== undefined) {
        checks.push({
          id: "budget",
          label: `Costs at most $${goal.budgetAtMost}/mo`,
          passed: impact.healthy.monthlyCost <= goal.budgetAtMost,
          detail: `Your design costs $${Math.round(impact.healthy.monthlyCost)}/mo.`,
        });
      }
    }
  }
  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    checks,
    diagnosis,
    impact,
    debrief: { ...scenario.debrief, rootCause: scenario.rootCause.text },
  };
}
