import type { ArchitectureNodeType } from "../../lib/architecture/types.ts";
import type { ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";

// What every system breakdown is made of: components revealed one at a time, the connections
// between them, and the URL state that keeps the walkthrough's place. Each breakdown supplies
// the data; the build order, step URLs and scene rules are shared.

export type BreakdownSource = { title: string; href: string };

export type BreakdownComponent = {
  id: string;
  label: string;
  role: string;
  type: ArchitectureNodeType;
  chapter: string;
  position: { x: number; y: number };
  explanation: string;
  why: string;
  flow: string;
  tradeoff: string;
  sources: readonly string[];
};

// An extra port on the top or bottom of a component, for a link that runs vertically.
export type BreakdownHandle = { id: string; side: "top" | "bottom" };

export type BreakdownConnection<Id extends string = string> = {
  id: string;
  source: Id;
  target: Id;
  label?: string;
  kind: string;
  purpose: string;
  sourcePort?: BreakdownHandle;
  targetPort?: BreakdownHandle;
  // A short link leaves no room between ports for its label; put it under the row instead.
  labelBelow?: boolean;
};

export type BreakdownProgress = { stepIndex: number; revealedCount: number };
export type BreakdownNavigation = number | "next" | "previous" | "restart";

export const REVIEW_STEP = "review";

export type Walkthrough<Id extends string = string> = {
  nodes: ArchitectureFlowNode[];
  steps: readonly (Id | typeof REVIEW_STEP)[];
  stepIndex: (step: string | null) => number;
  progress: (step: string | null, built: string | null) => BreakdownProgress;
  scene: (revealedCount: number) => { nodes: ArchitectureFlowNode[]; connections: readonly BreakdownConnection<Id>[] };
  stepQuery: (query: string, step: BreakdownNavigation, reset?: boolean) => string;
};

export function createWalkthrough<C extends BreakdownComponent, E extends BreakdownConnection<C["id"]>>(
  components: readonly C[],
  connections: readonly E[],
): Walkthrough<C["id"]> & { scene: (revealedCount: number) => { nodes: ArchitectureFlowNode[]; connections: readonly E[] } } {
  const nodes: ArchitectureFlowNode[] = components.map(component => ({
    id: component.id,
    type: "architecture",
    position: { ...component.position },
    data: { label: component.label, type: component.type },
  }));
  const steps: readonly (C["id"] | typeof REVIEW_STEP)[] = [...components.map(component => component.id), REVIEW_STEP];

  // Keep focus and build progress separate: inspecting an earlier component must
  // not remove later components. Both survive refresh without writing a project.
  const stepIndex = (step: string | null) => {
    const index = steps.findIndex(id => id === step);
    return index < 0 ? 0 : index;
  };

  const progress = (step: string | null, built: string | null): BreakdownProgress => {
    const index = stepIndex(step);
    const builtIndex = components.findIndex(component => component.id === built);
    return { stepIndex: index, revealedCount: Math.min(components.length, Math.max(index, builtIndex) + 1) };
  };

  const scene = (revealedCount: number) => {
    const visible = nodes.slice(0, revealedCount);
    const ids = new Set(visible.map(node => node.id));
    return { nodes: visible, connections: connections.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  };

  const stepQuery = (query: string, step: BreakdownNavigation, reset = false): string => {
    const params = new URLSearchParams(query);
    const previous = progress(params.get("step"), params.get("built"));
    const completed = previous.stepIndex === components.length;
    const requested = typeof step === "number" ? step
      : step === "next" ? completed ? 0 : previous.revealedCount
      : step === "previous" ? previous.stepIndex - 1 : 0;
    const index = Number.isInteger(requested) && steps[requested] ? requested : 0;
    reset ||= step === "restart" || (step === "next" && completed);
    const frontier = reset ? 0 : Math.min(components.length - 1, Math.max(previous.revealedCount - 1, index));
    if (index === 0) params.delete("step");
    else params.set("step", steps[index]!);
    if (frontier > index) params.set("built", steps[frontier]!);
    else params.delete("built");
    const result = params.toString();
    return result ? `?${result}` : "";
  };

  return { nodes, steps, stepIndex, progress, scene, stepQuery };
}
