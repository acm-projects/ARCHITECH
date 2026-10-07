import { roleOf, type NodeRole } from "../analysis.ts";
import type {
  ArchitectureEvaluation,
  CategoryScores,
  EvaluationFinding,
  Severity,
} from "../evaluation/contract.ts";
import {
  createComponentResolver,
  noun,
  nodeEvaluation,
  upperFirst,
  type ComponentResolver,
} from "./components.ts";
import type {
  Explanation,
  ExplanationKind,
  ExplanationSource,
  HealthExplanation,
  NextStep,
  ScoreExplanation,
  ScoreLevel,
  SystemExplanation,
} from "./contract.ts";

// Turns a finished evaluation into explanations for a beginner. It reads the evaluation's
// findings, metrics and per-component numbers as they are and puts them into words: what was
// found, why this design produced it, what it means, one thing to change, and what that
// change costs. It does not score, simulate or detect anything itself, and it never changes
// the evaluation. Output is deterministic: the same input gives the same text.
//
// Components are named by their CURRENT labels (see components.ts), so a component renamed
// since the run is described by its new name, while ids and types, which carry the logic,
// always come from the evaluation.

export const MAX_NEXT_STEPS = 3;
const MAX_HEALTH_REASONS = 3;

const n0 = (value: number) => Math.round(value).toLocaleString("en-US");
const rps = (value: number) => `${n0(value)} requests per second`;
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const money = (value: number) => `$${n0(value)}`;

// ---- Finding kinds ----
// Findings are recognised by their documented stable ids (see evaluation/findings.ts).

const PREFIX_KINDS: [string, ExplanationKind][] = [
  ["saturated-", "overloaded"],
  ["backlog-", "queue-backlog"],
  ["queue-no-consumer-", "queue-no-consumer"],
  ["unreachable-data-", "unreachable-data"],
  ["entry-disconnected-", "disconnected-client"],
  ["cache-low-benefit-", "low-benefit-cache"],
  ["overprovisioned-", "over-provisioned"],
  ["spof-", "single-point-of-failure"],
  ["database-redundancy-", "database-redundancy"],
  ["connection-", "questionable-connection"],
];

const EXACT_KINDS: Record<string, ExplanationKind> = {
  "no-entry-point": "no-entry-point",
  "no-backend": "no-backend",
  "no-data-store": "no-data-store",
  "slow-requests": "slow-requests",
  "long-request-path": "long-path",
  "low-availability": "low-availability",
  "idle-components": "idle-components",
  "cache-opportunity": "missing-cache",
};

export function kindOfFinding(findingId: string): ExplanationKind {
  const exact = EXACT_KINDS[findingId];
  if (exact) return exact;
  return PREFIX_KINDS.find(([prefix]) => findingId.startsWith(prefix))?.[1] ?? "other";
}

// ---- Templates ----

type Context = {
  evaluation: ArchitectureEvaluation;
  resolver: ComponentResolver;
  readPercent: number;
  writePercent: number;
};

type Text = {
  what: string;
  why: string;
  impact: string;
  suggestion: string;
  tradeoff: string | null;
};

const roleFor = (context: Context, id: string): NodeRole | null => {
  const type = context.resolver.type(id);
  return type ? roleOf(type) : null;
};

// What to do about a component that is out of capacity, and the price of doing it. The choice
// for a database follows the workload the design was run with, as the evaluation's own advice does.
function scaleOut(context: Context, id: string): Pick<Text, "suggestion" | "tradeoff"> {
  const who = context.resolver.describe(id);
  switch (roleFor(context, id)) {
    case "database":
      return context.writePercent >= 50
        ? {
            suggestion: `Buffer writes to ${who} through a queue, or split the data across more databases. Read replicas will not help much with a write-heavy load.`,
            tradeoff:
              "A queue means a write finishes after the user's request is answered, so you have to handle delays and failures. Splitting data across databases makes queries that span them harder.",
          }
        : {
            suggestion: `Add read replicas to ${who}, or put a cache in front of it, so reads do not all reach the primary.`,
            tradeoff:
              "Replicas cost more, and a replica can lag slightly behind the primary, so a read may return slightly old data. A cache is fast but can serve outdated data until it is refreshed.",
          };
    case "compute":
      return {
        suggestion: `Add more instances of ${who} (increase its replicas).`,
        tradeoff:
          "More instances cost more every month, and they only help if requests can be spread across them, usually with a load balancer.",
      };
    default:
      return {
        suggestion: `Add more instances of ${who}, or give each one more capacity.`,
        tradeoff: "More or larger instances cost more to run.",
      };
  }
}

// What the design should do about a component that is a single point of failure.
function redundancy(context: Context, id: string): Pick<Text, "suggestion" | "tradeoff"> {
  const who = context.resolver.describe(id);
  if (roleFor(context, id) === "database") {
    return {
      suggestion: `Add a read replica or standby for ${who} so the design survives losing the primary.`,
      tradeoff:
        "A replica adds cost and can lag slightly behind the primary, so a read may return slightly old data.",
    };
  }
  return {
    suggestion: `Run two or more instances of ${who} so the others keep working if one fails.`,
    tradeoff:
      "Extra instances cost more, and they need a load balancer (or something similar) to spread requests across them, which is one more component to run.",
  };
}

const namesOf = (context: Context, ids: string[]) => ids.map((id) => context.resolver.ref(id).label);

const listOf = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function explainOverloaded(f: EvaluationFinding, context: Context, near: boolean): Text {
  const id = f.nodeIds[0];
  const { evaluation, resolver } = context;
  const who = resolver.describe(id);
  const stats = nodeEvaluation(evaluation, id);
  const role = roleFor(context, id);
  const action = scaleOut(context, id);
  const demand = stats ? rps(stats.demandRps) : "more traffic";
  const capacity = stats?.capacityRps ? rps(stats.capacityRps) : "its limit";

  const why = (() => {
    switch (role) {
      case "database":
        return context.writePercent >= 50
          ? `Every write has to go to the single primary database, and a write costs it more work than a read. About ${context.writePercent}% of your requests are writes, so it runs out of capacity first.`
          : `A database does real work for every request that reaches it. About ${context.readPercent}% of your requests are reads, but each read still reaches this database${stats && stats.instances > 1 ? ` (it has ${stats.instances - 1} read ${stats.instances === 2 ? "replica" : "replicas"} sharing them)` : " and nothing is answering them earlier"}.`;
      case "compute":
        return `Each instance of a ${noun(resolver.type(id))} can only process a limited number of requests every second. You have ${stats?.instances ?? 1} running, and that is not enough for the traffic it receives.`;
      case "ingress":
        return "Every request passes through it on the way in, so it carries the traffic of everything behind it.";
      case "cache":
        return "A cache answers many reads quickly, but it still has a limit on how many requests it can serve each second.";
      case "queue":
        return "A queue can only accept writes at a limited rate.";
      default:
        return "It receives more requests than one instance of this component can handle.";
    }
  })();

  if (near) {
    return {
      what: `${upperFirst(who)} is using about ${pct(stats?.utilization ?? 0)} of its capacity.`,
      why: `It receives about ${demand} and can handle about ${capacity}, so there is little room left. ${why}`,
      impact:
        "It works at this traffic, but a modest increase would overload it, and it would be the first part of your design to fail.",
      ...action,
    };
  }
  const { metrics } = evaluation;
  return {
    what: `${upperFirst(who)} is overloaded: it is asked to handle about ${demand}, but it can only handle about ${capacity}.`,
    why,
    impact:
      metrics.effectiveRps < metrics.requestedRps
        ? `Requests above the limit are dropped or have to wait. At this load the design can serve about ${rps(metrics.effectiveRps)} of the ${rps(metrics.requestedRps)} requested, and responses slow down as the line grows.`
        : "Requests above the limit are dropped or have to wait, and responses slow down as the line grows.",
    ...action,
  };
}

function explainFinding(f: EvaluationFinding, kind: ExplanationKind, context: Context): Text {
  const { evaluation, resolver } = context;
  const { metrics, traffic } = evaluation;
  const id = f.nodeIds[0];
  const who = id ? resolver.describe(id) : "";

  switch (kind) {
    case "overloaded": {
      const stats = nodeEvaluation(evaluation, id);
      return explainOverloaded(f, context, (stats?.utilization ?? 1) < 1);
    }

    case "queue-backlog": {
      const stats = nodeEvaluation(evaluation, id);
      const over = (stats?.utilization ?? 1) >= 1;
      return {
        what: over
          ? `${upperFirst(who)} cannot process queued work as fast as it arrives.`
          : `${upperFirst(who)} is close to keeping up with queued work.`,
        why: `The queue accepts writes quickly, but ${who} works through them at about ${stats?.capacityRps ? rps(stats.capacityRps) : "a fixed rate"} while about ${stats ? rps(stats.demandRps) : "more"} arrives behind the queue.`,
        impact: over
          ? "The backlog keeps growing, so each piece of work waits longer and longer before it is processed."
          : "A burst of writes would start a backlog that takes time to clear.",
        suggestion: `Add more instances of ${who} so queued work is processed as fast as it arrives.`,
        tradeoff:
          "More workers cost more, and if they all write to the same database they can move the bottleneck there.",
      };
    }

    case "queue-no-consumer":
      return {
        what: `Nothing reads from ${who}.`,
        why: "A queue only holds messages. Something must be connected after it to take them out and process them.",
        impact: "Writes are accepted but never processed, so they never reach your data store.",
        suggestion: `Connect a worker or service after ${who} to process its messages.`,
        tradeoff:
          "A consumer is one more component to run, and the work is finished after the user's request has already been answered.",
      };

    case "single-point-of-failure": {
      const behind = namesOf(context, f.nodeIds.slice(1));
      const action = redundancy(context, id);
      return {
        what: `${upperFirst(who)} is a single point of failure.`,
        why: `${behind.length > 0 ? `${listOf(behind)} can only be reached through it` : "Requests depend on it"}, and it runs as a single copy.`,
        impact: `If it fails or restarts, ${behind.length > 0 ? listOf(behind) : "what is behind it"} cannot be reached and users see errors until it is back.`,
        ...action,
      };
    }

    case "database-redundancy":
      return {
        what: `${upperFirst(who)} has no standby copy.`,
        why: "It is the only database and has no read replica, so there is exactly one copy of your data being served.",
        impact:
          "If it fails, reads and writes stop until it is restored, and there is no other copy to take over.",
        ...redundancy(context, id),
      };

    case "missing-cache":
      return {
        what: "Reads reach your database with no cache in front of it.",
        why: `About ${context.readPercent}% of your requests are reads, and every one goes to the database, even for data that rarely changes.`,
        impact:
          "The database repeats the same work over and over, so it becomes a bottleneck sooner and reads are slower than they need to be.",
        suggestion:
          "Add a cache between your service and the database so repeated reads are answered from fast memory.",
        tradeoff:
          "A cache can serve outdated data until it is refreshed, so you have to decide when cached data expires, and it costs more to run.",
      };

    case "low-benefit-cache":
      return {
        what: `${upperFirst(who)} helps little with this workload.`,
        why: `Caches mostly speed up reads, and only ${context.readPercent}% of your requests are reads.`,
        impact: "It adds cost and another component to operate while taking little load off the database.",
        suggestion: `Remove ${who} for this workload, or use a queue to absorb the writes instead.`,
        tradeoff:
          "Removing it saves money, but if your workload becomes read-heavy later you may want a cache again.",
      };

    case "slow-requests": {
      const onPath = f.nodeIds.filter((node) => evaluation.bottleneckNodeIds.includes(node));
      // The whole path a request takes, client included; the finding lists only its components.
      const path = namesOf(context, evaluation.criticalPath.length > 0 ? evaluation.criticalPath : f.nodeIds);
      const ms = `${n0(metrics.p95LatencyMs)} ms`;
      const base = {
        what: `Requests are slow: 95 out of 100 finish within about ${ms}, and the rest take longer.`,
        impact:
          "Users wait longer for every response, and slow responses make timeouts and retries more likely.",
      };
      if (f.nodeIds.length === 0) {
        return {
          ...base,
          why: `Most of the time is the network round trip between the client and your system (${n0(traffic.networkLatencyMs)} ms).`,
          suggestion: "Serve requests closer to the client, for example from a CDN.",
          tradeoff: "A CDN adds cost, and it works best for content that does not change often.",
        };
      }
      if (onPath.length > 0) {
        const slow = resolver.describe(onPath[0]);
        return {
          ...base,
          why: `The slowest common path goes through ${path.join(" → ")}, and ${slow} is close to or over its capacity, which makes every request through it wait.`,
          suggestion: `Fix the overloaded component first: give ${slow} more capacity. Latency usually drops as soon as it has headroom.`,
          tradeoff: "More capacity costs more to run.",
        };
      }
      return {
        ...base,
        why: `The slowest common path goes through ${path.join(" → ")}. Each component adds time, and the client's network adds its share.`,
        suggestion:
          "Shorten the request path, or answer more requests before they reach the slowest component, for example with a cache.",
        tradeoff:
          "A cache can serve outdated data, and removing components from the path makes the remaining ones do more.",
      };
    }

    case "long-path":
      return {
        what: `Requests pass through ${f.nodeIds.length} components in a row.`,
        why: "Each component adds a little time and is another thing that can fail.",
        impact: "Longer paths are slower and less reliable.",
        suggestion: "Remove components from the path that do not need to be there, or combine them.",
        tradeoff: "Combining components makes each one larger and harder to change on its own.",
      };

    case "low-availability": {
      const weakest = f.nodeIds[0];
      const name = weakest ? resolver.describe(weakest) : null;
      return {
        what: `Your design is up about ${metrics.uptimeAvailability}% of the time.`,
        why: name
          ? `Every request depends on a chain of components that each run as a single copy, and ${name} is the least available link.`
          : "Every request depends on a chain of components that each run as a single copy.",
        impact: "If any one of them fails, requests fail until it is back, and the chances add up along the chain.",
        suggestion: name
          ? `Run more than one instance of ${name}, and put a load balancer in front of the copies.`
          : "Run more than one instance of each component on the request path.",
        tradeoff: "More instances and a load balancer cost more and add components to operate.",
      };
    }

    case "no-entry-point": {
      const empty = evaluation.nodes.length === 0;
      return {
        what: empty
          ? "The architecture is empty, so there is nothing to evaluate yet."
          : "No request reaches any component yet.",
        why: empty
          ? "No components have been added."
          : "A design needs a client connected to the first component a request reaches. Without one, no traffic enters the system.",
        impact: "Archie cannot score or explain a design that no request can use.",
        suggestion: "Add a client and connect it to the first component a request reaches.",
        tradeoff: null,
      };
    }

    case "disconnected-client":
      return {
        what: `${upperFirst(who)} is not connected to anything.`,
        why: "Requests travel along connections, and this client has none going out.",
        impact: "It sends no traffic, so it plays no part in this analysis.",
        suggestion: `Connect ${who} to the component it should send requests to, or remove it.`,
        tradeoff: null,
      };

    case "no-backend":
      return {
        what: "Requests never reach a backend service.",
        why: "No server or worker is on any request path, so nothing runs your application logic.",
        impact: "Nothing can process a request beyond passing it along.",
        suggestion: "Add a server and connect the request path through it.",
        tradeoff: "A server is one more component to run and pay for, but it is where your logic lives.",
      };

    case "no-data-store":
      return {
        what: "Writes have nowhere to be stored.",
        why: `About ${context.writePercent}% of requests are writes, but no database or storage is on a request path.`,
        impact: "Data written by users would not be kept.",
        suggestion: "Connect a database or object storage to the service that handles writes.",
        tradeoff: "A data store adds cost, and every request that uses it depends on it being available.",
      };

    case "unreachable-data":
      return {
        what: `${upperFirst(who)} receives no requests.`,
        why: "No path of connections leads from a client to it.",
        impact: "It holds data nothing can read or write, and you still pay for it.",
        suggestion: `Connect a service to ${who}, or remove it.`,
        tradeoff:
          "Once connected, that service depends on it: if the data store is slow or down, the service is affected.",
      };

    case "questionable-connection": {
      const from = resolver.describe(f.nodeIds[0]);
      const to = resolver.describe(f.nodeIds[1]);
      // The engine marks a repeated connection low and a layer-skipping one medium.
      const repeated = f.severity === "low";
      return {
        what: `The connection from ${from} to ${to} needs a second look.`,
        why: f.message,
        impact: repeated
          ? "A repeated connection adds nothing and makes the diagram harder to read."
          : "Skipping a layer can bypass the logic and security checks that layer provides, and makes the system harder to change.",
        suggestion: repeated
          ? "Remove the repeated connection."
          : `Check whether ${from} should go through another component before reaching ${to}, and remove the connection if it was a mistake.`,
        tradeoff: repeated
          ? null
          : "Adding a component in between adds a hop (a little latency) and something more to run.",
      };
    }

    case "idle-components": {
      const cost = f.nodeIds.reduce((sum, node) => sum + (nodeEvaluation(evaluation, node)?.monthlyCost ?? 0), 0);
      const names = namesOf(context, f.nodeIds);
      return {
        what:
          f.nodeIds.length === 1
            ? `${upperFirst(who)} serves no requests.`
            : `${f.nodeIds.length} components serve no requests: ${listOf(names)}.`,
        why: "Requests only flow along connections that start at a client, and nothing leads to these.",
        impact: `They carry no traffic but still cost about ${money(cost)} a month.`,
        suggestion: "Connect them to the request path, or remove them.",
        tradeoff: null,
      };
    }

    case "over-provisioned": {
      const stats = nodeEvaluation(evaluation, id);
      return {
        what: `${upperFirst(who)} has more capacity than it needs.`,
        why: `${stats?.instances ?? "Several"} instances run at about ${pct(stats?.utilization ?? 0)} of their capacity.`,
        impact: "You pay for capacity that sits unused.",
        suggestion: `Reduce the replicas of ${who}, keeping at least two if availability matters.`,
        tradeoff:
          "Fewer instances cost less but leave less room for traffic spikes, and fewer copies if one fails.",
      };
    }

    default:
      return {
        what: f.title,
        why: f.message,
        impact: "Left as it is, this can lower your scores.",
        suggestion: f.recommendation,
        tradeoff: null,
      };
  }
}

// ---- Priority ----

const SEVERITY_POINTS: Record<Severity, number> = { high: 300, medium: 200, low: 100 };
// Structural problems block everything else; capacity comes next.
const CATEGORY_POINTS: Record<EvaluationFinding["category"], number> = {
  architecture: 40,
  scalability: 30,
  reliability: 20,
  performance: 10,
  cost: 0,
};
const BOTTLENECK_POINTS = 60;

function priorityOf(f: EvaluationFinding, evaluation: ArchitectureEvaluation): number {
  const bottleneck = f.nodeIds.some((id) => evaluation.bottleneckNodeIds.includes(id));
  return SEVERITY_POINTS[f.severity] + CATEGORY_POINTS[f.category] + (bottleneck ? BOTTLENECK_POINTS : 0);
}

export function explainFindings(source: ExplanationSource): Explanation[] {
  const { evaluation } = source;
  const resolver = createComponentResolver(source);
  const readPercent = Math.round(evaluation.traffic.readRatio);
  const context: Context = { evaluation, resolver, readPercent, writePercent: 100 - readPercent };

  return evaluation.findings
    .map((f): Explanation => {
      let kind = kindOfFinding(f.id);
      if (kind === "overloaded" && (nodeEvaluation(evaluation, f.nodeIds[0])?.utilization ?? 1) < 1) {
        kind = "near-capacity";
      }
      return {
        id: `explain-${f.id}`,
        findingId: f.id,
        kind,
        category: f.category,
        severity: f.severity,
        title: titleOf(kind, f, context),
        ...explainFinding(f, kind === "near-capacity" ? "overloaded" : kind, context),
        nodeIds: f.nodeIds,
        components: f.nodeIds.map(resolver.ref),
        priority: priorityOf(f, evaluation),
      };
    })
    .sort((a, b) => b.priority - a.priority || (a.findingId < b.findingId ? -1 : 1));
}

// A short heading for an explanation, in the component's current name.
function titleOf(kind: ExplanationKind, f: EvaluationFinding, context: Context): string {
  const { resolver, evaluation } = context;
  const label = (index = 0) => (f.nodeIds[index] ? resolver.ref(f.nodeIds[index]).label : "");
  switch (kind) {
    case "overloaded":
      return `${label()} is overloaded`;
    case "near-capacity":
      return `${label()} is close to its capacity`;
    case "queue-backlog":
      return `${label()} cannot keep up with queued work`;
    case "queue-no-consumer":
      return `${label()} has no consumer`;
    case "single-point-of-failure":
      return `${label()} is a single point of failure`;
    case "database-redundancy":
      return `${label()} has no standby copy`;
    case "missing-cache":
      return "No cache in front of the database";
    case "low-benefit-cache":
      return `${label()} helps little with this workload`;
    case "slow-requests":
      return `Requests are slow (p95 ${Math.round(evaluation.metrics.p95LatencyMs)} ms)`;
    case "long-path":
      return `Requests cross ${f.nodeIds.length} components`;
    case "low-availability":
      return `Availability is ${evaluation.metrics.uptimeAvailability}%`;
    case "no-entry-point":
      return evaluation.nodes.length === 0 ? "The architecture is empty" : "No request reaches a component";
    case "disconnected-client":
      return `${label()} is not connected`;
    case "no-backend":
      return "Requests never reach a backend service";
    case "no-data-store":
      return "Writes have nowhere to be stored";
    case "unreachable-data":
      return `${label()} receives no requests`;
    case "questionable-connection":
      return `${label(0)} → ${label(1)} needs a second look`;
    case "idle-components":
      return f.nodeIds.length === 1 ? `${label()} serves no requests` : `${f.nodeIds.length} components serve no requests`;
    case "over-provisioned":
      return `${label()} has more capacity than it needs`;
    default:
      return f.title;
  }
}

// ---- Next steps ----

// Two explanations that call for the same action share a key and become one step.
function actionKey(e: Explanation, context: Context): string {
  const id = e.nodeIds[0];
  const capacityAction = (node: string) => {
    const r = roleFor(context, node);
    if (r === "database") return context.writePercent >= 50 ? `writes:${node}` : `replicas:${node}`;
    return `scale:${node}`;
  };
  const redundancyAction = (node: string) =>
    roleFor(context, node) === "database" ? `replicas:${node}` : `scale:${node}`;

  switch (e.kind) {
    case "overloaded":
    case "near-capacity":
    case "queue-backlog":
      return capacityAction(id);
    case "single-point-of-failure":
      return redundancyAction(id);
    case "database-redundancy":
      return `replicas:${id}`;
    case "low-availability":
      return id ? redundancyAction(id) : "redundancy";
    case "slow-requests": {
      const limited = e.nodeIds.find((node) => context.evaluation.bottleneckNodeIds.includes(node));
      return limited ? capacityAction(limited) : "shorten-path";
    }
    case "long-path":
      return "shorten-path";
    case "missing-cache":
      return "cache";
    case "low-benefit-cache":
      return `remove:${id}`;
    case "over-provisioned":
      return `shrink:${id}`;
    case "idle-components":
      return "remove-idle";
    case "unreachable-data":
    case "disconnected-client":
      return `connect:${id}`;
    case "queue-no-consumer":
      return `consumer:${id}`;
    case "no-entry-point":
      return "add-entry";
    case "no-backend":
      return "add-backend";
    case "no-data-store":
      return "add-store";
    case "questionable-connection":
      return `connection:${e.nodeIds.join(",")}`;
    default:
      return `other:${e.findingId}`;
  }
}

// Up to MAX_NEXT_STEPS actions, most valuable first. High and medium findings come first; low
// ones are only suggested when nothing more important is open, so a list is never a pile of
// minor tidy-ups.
export function buildNextSteps(explanations: Explanation[], source: ExplanationSource): NextStep[] {
  const { evaluation } = source;
  const context: Context = {
    evaluation,
    resolver: createComponentResolver(source),
    readPercent: Math.round(evaluation.traffic.readRatio),
    writePercent: 100 - Math.round(evaluation.traffic.readRatio),
  };

  const important = explanations.filter((e) => e.severity !== "low");
  const candidates = important.length > 0 ? important : explanations;

  const groups = new Map<string, Explanation[]>();
  for (const e of candidates) {
    const key = actionKey(e, context);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return [...groups.entries()].slice(0, MAX_NEXT_STEPS).map(([key, members]) => {
    const lead = members[0];
    return {
      id: `step-${key}`,
      text: lead.suggestion,
      tradeoff: lead.tradeoff,
      reason: lead.title,
      severity: lead.severity,
      nodeIds: lead.nodeIds,
      explanationId: lead.id,
      addresses: members.map((m) => m.findingId),
    };
  });
}

// ---- Health ----

export function explainHealth(source: ExplanationSource, explanations: Explanation[]): HealthExplanation {
  const { evaluation } = source;
  const resolver = createComponentResolver(source);
  const { health } = evaluation;

  // A capacity signal already says a component is overloaded, so findings that only repeat
  // that are left out.
  const hasCapacitySignal = health.signals.some((signal) => signal.kind === "capacity");
  const fragments = health.signals.flatMap((signal) => {
    switch (signal.kind) {
      case "capacity":
        return [`${resolver.describe(signal.nodeId ?? "")} is using about ${pct(signal.value ?? 0)} of its estimated capacity`];
      case "availability":
        return [`the design is only up about ${((signal.value ?? 0) * 100).toFixed(2)}% of the time`];
      case "latency":
        return [`the slowest 5% of requests take about ${n0(signal.value ?? 0)} ms or more`];
      case "finding": {
        const explanation = explanations.find((e) => e.findingId === signal.findingId);
        if (hasCapacitySignal && (explanation?.kind === "overloaded" || explanation?.kind === "near-capacity")) {
          return [];
        }
        return [explanation?.title ?? signal.message];
      }
      default:
        return ["no request reaches a component yet"];
    }
  });
  const because = fragments.map((fragment) => `${upperFirst(fragment)}.`);
  const reasonText = (): string => {
    const shown = fragments.slice(0, MAX_HEALTH_REASONS);
    const more = fragments.length - shown.length;
    return `${listOf(more > 0 ? [...shown, `${more} more ${more === 1 ? "problem" : "problems"}`] : shown)}.`;
  };
  switch (health.status) {
    case "incomplete":
      return {
        status: "incomplete",
        headline: "Archie cannot evaluate this design yet because no request reaches a component.",
        because,
        caveat: null,
      };
    case "critical":
      return {
        status: "critical",
        headline: `Architech marked this design critical because ${reasonText()}`,
        because,
        caveat: "Critical means it would likely fail or degrade badly at the traffic you ran.",
      };
    case "warning":
      return {
        status: "warning",
        headline: `Architech marked this design a warning because ${reasonText()}`,
        because,
        caveat: "A warning means it works at this traffic but has little margin or a known weak spot.",
      };
    default:
      return {
        status: "healthy",
        headline:
          "Architech rated this design healthy: nothing is close to its capacity, and availability and response times are within the limits it checks.",
        because: [],
        caveat: "That is for the traffic you ran. More traffic, or a failure, could change it.",
      };
  }
}

// ---- Scores ----

const STRONG_AT = 80;
const FAIR_AT = 50;
const levelOf = (score: number): ScoreLevel => (score >= STRONG_AT ? "strong" : score >= FAIR_AT ? "fair" : "weak");

const FINDING_CATEGORY: Record<keyof CategoryScores, EvaluationFinding["category"]> = {
  scalability: "scalability",
  reliability: "reliability",
  performance: "performance",
  costEfficiency: "cost",
};

export function explainScores(source: ExplanationSource, explanations: Explanation[]): ScoreExplanation[] {
  const { evaluation } = source;
  const resolver = createComponentResolver(source);
  const { metrics, scores } = evaluation;

  const summaries: Record<keyof CategoryScores, string> = {
    scalability: !evaluation.ready
      ? "Not scored yet: no request path to measure."
      : metrics.capacityRps === null
        ? `Nothing in this design limits how much traffic it can take.`
        : `The design can take about ${rps(metrics.capacityRps)} against the ${rps(metrics.requestedRps)} you asked for${evaluation.limitingNodeId ? `, and ${resolver.describe(evaluation.limitingNodeId)} would run out first` : ""}.`,
    reliability: !evaluation.ready
      ? "Not scored yet: no request path to measure."
      : `Estimated uptime is ${metrics.uptimeAvailability}%. Every component a request depends on, and every copy of it, changes that.`,
    performance: !evaluation.ready
      ? "Not scored yet: no request path to measure."
      : `95 out of 100 requests finish within about ${n0(metrics.p95LatencyMs)} ms${evaluation.criticalPath.length > 0 ? `, along ${evaluation.criticalPath.map((id) => resolver.ref(id).label).join(" → ")}` : ""}.`,
    costEfficiency: !evaluation.ready
      ? "Not scored yet: no request path to measure."
      : `The design is estimated at ${money(metrics.estimatedMonthlyCost)} a month for ${rps(metrics.requestedRps)}${metrics.effectiveRps < metrics.requestedRps ? ", and it cannot serve all of that" : ""}.`,
  };

  return (Object.keys(scores) as (keyof CategoryScores)[]).map((category) => ({
    category,
    score: scores[category],
    level: levelOf(scores[category]),
    summary: summaries[category],
    factors: explanations
      .filter((e) => e.category === FINDING_CATEGORY[category])
      .slice(0, 2)
      .map((e) => e.title),
  }));
}

// ---- Whole explanation ----

export function buildSystemExplanation(source: ExplanationSource): SystemExplanation {
  const { evaluation } = source;
  const explanations = explainFindings(source);
  const primaryIssue = explanations[0] ?? null;
  const healthExplanation = explainHealth(source, explanations);

  const { metrics } = evaluation;
  const parts: string[] = [];
  if (!evaluation.ready) {
    parts.push("Archie cannot score this design yet: no request reaches a component.");
  } else {
    parts.push(
      `Architech rated this design ${evaluation.health.status}, with an overall score of ${evaluation.overallScore} out of 100.`,
    );
    parts.push(
      metrics.effectiveRps < metrics.requestedRps
        ? `It can serve about ${rps(metrics.effectiveRps)} of the ${rps(metrics.requestedRps)} you asked for.`
        : `It can serve all ${rps(metrics.requestedRps)} you asked for.`,
    );
    if (evaluation.scoring.architecturePenalty > 0) {
      parts.push(
        `Structural problems took ${evaluation.scoring.architecturePenalty} points off the overall score.`,
      );
    }
  }
  if (primaryIssue) parts.push(`The main issue: ${primaryIssue.title}.`);

  return {
    summary: parts.join(" "),
    healthExplanation,
    scoreExplanations: explainScores(source, explanations),
    primaryIssue,
    explanations,
    nextSteps: buildNextSteps(explanations, source),
  };
}
