import { roleOf } from "../analysis.ts";
import { getEffectiveProperty, type ComponentPropertyKey } from "../componentProperties.ts";
import { configureNode } from "../evaluation/capabilities.ts";
import { canReachAny, createDirectedGraph, reachableFrom, type GraphInput } from "../graph.ts";
import type { ArchitectureNodeType } from "../types.ts";

// What a lesson step needs the design to contain, and a pure check of whether it does. An
// objective is about the graph (component types, connections, configuration), never about
// names, positions or the order things were done in, so it means the same thing for a
// design built in any way. The check says why a step is not met, so hints and explanations
// can be specific.

export type ConnectionFeedback = { title: string; explanation: string };

export type ConnectionFeedbackRule = ConnectionFeedback & {
  sourceType: ArchitectureNodeType;
  targetType: ArchitectureNodeType;
};

export type LearnObjective =
  // At least `min` (default 1) components of this type.
  | { kind: "node"; componentType: ArchitectureNodeType; min?: number }
  // A direct connection from a component of one type to a component of another.
  | {
      kind: "edge";
      sourceType: ArchitectureNodeType;
      targetType: ArchitectureNodeType;
      // Known misconceptions: connections that look related but are wrong here.
      // Any other connection that misses the objective is simply "unrelated".
      feedbackRules?: ConnectionFeedbackRule[];
    }
  // A route, direct or through other components, from one type to another.
  | {
      kind: "path";
      sourceType: ArchitectureNodeType;
      targetType: ArchitectureNodeType;
      feedbackRules?: ConnectionFeedbackRule[];
    }
  // A component of this type that a request from a client can actually reach.
  | { kind: "reachable"; componentType: ArchitectureNodeType }
  // A component of this type whose effective setting meets a condition.
  | {
      kind: "property";
      componentType: ArchitectureNodeType;
      key: ComponentPropertyKey;
      comparison: "at-least" | "at-most" | "equals";
      value: number;
    }
  // Components of this type that together run at least this many instances.
  | { kind: "redundancy"; componentType: ArchitectureNodeType; minInstances: number };

export type ObjectiveReason =
  | "satisfied"
  | "component-missing"
  | "too-few-components"
  | "source-missing"
  | "target-missing"
  | "both-missing"
  | "not-connected"
  | "reversed"
  | "no-path"
  | "not-reachable"
  | "property-not-met"
  | "not-redundant";

export type ObjectiveCheck = {
  valid: boolean;
  reason: ObjectiveReason;
  // The components the result is about (the ones that satisfy it, or the ones that are close).
  relevantNodeIds: string[];
  // Types that have to be added before the objective can be met.
  missingTypes: ArchitectureNodeType[];
  // What was found, where a number is meaningful: how many components, or how many instances.
  found: number | null;
};

type CheckGraph = GraphInput;

const result = (
  valid: boolean,
  reason: ObjectiveReason,
  relevantNodeIds: string[] = [],
  missingTypes: ArchitectureNodeType[] = [],
  found: number | null = null,
): ObjectiveCheck => ({ valid, reason, relevantNodeIds, missingTypes, found });

const idsOfType = (graph: CheckGraph, type: ArchitectureNodeType) =>
  graph.nodes.filter((node) => node.data.type === type).map((node) => node.id);

const holds = (comparison: "at-least" | "at-most" | "equals", actual: number, target: number) =>
  comparison === "at-least" ? actual >= target : comparison === "at-most" ? actual <= target : actual === target;

export function validateObjective(objective: LearnObjective, graph: CheckGraph): ObjectiveCheck {
  switch (objective.kind) {
    case "node": {
      const ids = idsOfType(graph, objective.componentType);
      const min = objective.min ?? 1;
      if (ids.length >= min) return result(true, "satisfied", ids, [], ids.length);
      return result(
        false,
        ids.length === 0 ? "component-missing" : "too-few-components",
        ids,
        [objective.componentType],
        ids.length,
      );
    }

    case "edge":
    case "path": {
      const sources = idsOfType(graph, objective.sourceType);
      const targets = idsOfType(graph, objective.targetType);
      const missing: ArchitectureNodeType[] = [];
      if (sources.length === 0) missing.push(objective.sourceType);
      if (targets.length === 0 && objective.targetType !== objective.sourceType) missing.push(objective.targetType);
      if (sources.length === 0 && targets.length === 0) return result(false, "both-missing", [], missing);
      if (sources.length === 0) return result(false, "source-missing", targets, missing);
      if (targets.length === 0) return result(false, "target-missing", sources, missing);

      if (objective.kind === "edge") {
        const sourceSet = new Set(sources);
        const targetSet = new Set(targets);
        const match = graph.edges.find((edge) => sourceSet.has(edge.source) && targetSet.has(edge.target));
        if (match) return result(true, "satisfied", [match.source, match.target]);
        const reversed = graph.edges.find((edge) => targetSet.has(edge.source) && sourceSet.has(edge.target));
        if (reversed) return result(false, "reversed", [reversed.source, reversed.target]);
        return result(false, "not-connected", [...sources, ...targets]);
      }

      const directed = createDirectedGraph(graph);
      const targetSet = new Set(targets);
      const start = sources.find((source) => canReachAny(directed, source, targetSet));
      if (start === undefined) return result(false, "no-path", [...sources, ...targets]);
      const reached = reachableFrom(directed, [start]);
      return result(true, "satisfied", [start, ...targets.filter((target) => target !== start && reached.has(target))]);
    }

    case "reachable": {
      const ids = idsOfType(graph, objective.componentType);
      if (ids.length === 0) return result(false, "component-missing", [], [objective.componentType]);
      const entries = graph.nodes.filter((node) => roleOf(node.data.type) === "entry").map((node) => node.id);
      const reached = reachableFrom(createDirectedGraph(graph), entries);
      const reachable = ids.filter((id) => reached.has(id));
      return reachable.length > 0
        ? result(true, "satisfied", reachable, [], reachable.length)
        : result(false, "not-reachable", ids, [], 0);
    }

    case "property": {
      const nodes = graph.nodes.filter((node) => node.data.type === objective.componentType);
      if (nodes.length === 0) return result(false, "component-missing", [], [objective.componentType]);
      const satisfying = nodes.filter((node) => {
        const actual = getEffectiveProperty(objective.componentType, node.data.properties, objective.key);
        return actual !== undefined && holds(objective.comparison, actual, objective.value);
      });
      return satisfying.length > 0
        ? result(true, "satisfied", satisfying.map((node) => node.id))
        : result(false, "property-not-met", nodes.map((node) => node.id));
    }

    case "redundancy": {
      const nodes = graph.nodes.filter((node) => node.data.type === objective.componentType);
      if (nodes.length === 0) return result(false, "component-missing", [], [objective.componentType]);
      const instances = nodes.reduce(
        (sum, node) => sum + configureNode({ id: node.id, data: { type: node.data.type, properties: node.data.properties } }).instances,
        0,
      );
      const ids = nodes.map((node) => node.id);
      return instances >= objective.minInstances
        ? result(true, "satisfied", ids, [], instances)
        : result(false, "not-redundant", ids, [], instances);
    }
  }
}
