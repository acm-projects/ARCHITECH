import { noun } from "../archie/components.ts";
import { getPropertyDefinition } from "../componentProperties.ts";
import type { ArchitectureNodeType } from "../types.ts";
import type { LearnObjective, ObjectiveCheck } from "./objectives.ts";

// Hints for a lesson step, worked out from what the step asks for and what the design looks
// like right now. Deterministic: no model, no randomness, and the same graph gives the same hint.

export type LearnHint = {
  text: string;
  // The components the hint is about, so a screen could point at them.
  nodeIds: string[];
};

const article = (type: ArchitectureNodeType) => {
  const word = noun(type);
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
};

const joinTypes = (types: ArchitectureNodeType[]) =>
  types.length === 2 ? `${article(types[0])} and ${article(types[1])}` : types.map(article).join(", ");

const COMPARISON_WORDS = { "at-least": "at least", "at-most": "at most", equals: "exactly" } as const;

// Null when the step is already met.
export function getLearnHint(objective: LearnObjective, check: ObjectiveCheck): LearnHint | null {
  if (check.valid) return null;
  const nodeIds = check.relevantNodeIds;
  const hint = (text: string): LearnHint => ({ text, nodeIds });

  // Whatever is still missing comes first, whatever the step asks for.
  if (check.missingTypes.length > 0 && check.reason !== "too-few-components") {
    return hint(`Add ${joinTypes(check.missingTypes)} first.`);
  }

  switch (objective.kind) {
    case "node": {
      const needed = (objective.min ?? 1) - (check.found ?? 0);
      return hint(`You have ${check.found ?? 0}. Add ${needed} more ${noun(objective.componentType)}${needed === 1 ? "" : "s"}.`);
    }
    case "edge": {
      const source = noun(objective.sourceType);
      const target = noun(objective.targetType);
      if (check.reason === "reversed") {
        return hint(`That connection goes the other way. Requests go from the ${source} to the ${target}, so connect them in that direction.`);
      }
      return hint(`You have both components. Connect the ${source} to the ${target}: drag from its right handle to the ${target}'s left handle.`);
    }
    case "path":
      return hint(
        `A request needs a route from the ${noun(objective.sourceType)} to the ${noun(objective.targetType)}. Connect them directly, or through the components in between.`,
      );
    case "reachable":
      return hint(
        `You have the ${noun(objective.componentType)}, but no request reaches it. Connect it so a request from a client can arrive.`,
      );
    case "property": {
      const label = (getPropertyDefinition(objective.componentType, objective.key)?.label ?? objective.key).toLowerCase();
      return hint(
        `Select the ${noun(objective.componentType)}, open Configure, and set ${label} to ${COMPARISON_WORDS[objective.comparison]} ${objective.value}.`,
      );
    }
    case "redundancy":
      return hint(
        `Run at least ${objective.minInstances} ${noun(objective.componentType)} instances: open Configure and raise Replicas, or add another ${noun(objective.componentType)}.`,
      );
  }
}

// Reasons where the person has already done the groundwork and is stuck on the last part, so a
// hint helps straight away. For "something is missing" the instruction already says what to
// add, so the hint waits until they have tried something that did not work.
const STUCK_REASONS = new Set<ObjectiveCheck["reason"]>([
  "not-connected",
  "reversed",
  "no-path",
  "not-reachable",
  "property-not-met",
  "not-redundant",
  "too-few-components",
]);

export function shouldShowHint(attempts: number, check: ObjectiveCheck): boolean {
  return !check.valid && (attempts > 0 || STUCK_REASONS.has(check.reason));
}
