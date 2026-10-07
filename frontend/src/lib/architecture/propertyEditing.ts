import {
  getPropertyDefinition,
  parsePropertyInput,
  validatePropertyValue,
  type PropertyRejection,
} from "./componentProperties.ts";
import {
  removeNodeProperty,
  setNodeProperty,
  type NodeLike,
} from "./nodeOperations.ts";
import type { ArchitectureNodeType } from "./types.ts";

// Editing one configurable property of one component. These sit between the settings UI and
// the generic node operations: they check the value against the component's own rules, and
// they store only real overrides. Like the operations they build on, they never change their
// input, and they return the very same array when nothing changed, so a no-op or a refused
// edit adds no history entry, does not autosave and leaves a Run Design result current.

export type PropertyEditFailure = {
  ok: false;
  reason: PropertyRejection | "node-not-found";
  message: string;
};

export type PropertyEditResult<N extends NodeLike> =
  | {
      ok: true;
      nodes: N[];
      // False when the node already had this value; `nodes` is then the array passed in.
      changed: boolean;
    }
  | PropertyEditFailure;

function nodeNotFound(): PropertyEditFailure {
  return { ok: false, reason: "node-not-found", message: "That component no longer exists." };
}

// Sets a property to a validated value. Setting it to the component's default removes the
// override instead of storing the default, so effective = override or default holds and the
// project keeps only deliberate changes.
export function setComponentProperty<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  key: string,
  value: unknown,
): PropertyEditResult<N> {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return nodeNotFound();

  const validation = validatePropertyValue(node.data.type, key, value);
  if (!validation.ok) return validation;

  const definition = getPropertyDefinition(node.data.type, key);
  const update =
    validation.value === definition?.defaultValue
      ? removeNodeProperty(nodes, nodeId, key)
      : setNodeProperty(nodes, nodeId, key, validation.value);
  if (!update.ok) return nodeNotFound();
  return { ok: true, nodes: update.nodes, changed: update.changed };
}

// Sets a property from text typed by a person. Nothing is changed unless the text is a valid
// value; an empty or half-typed field is refused here, never stored.
export function commitPropertyDraft<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  key: string,
  text: string,
): PropertyEditResult<N> {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return nodeNotFound();
  const parsed = parsePropertyInput(node.data.type, key, text);
  if (!parsed.ok) return parsed;
  return setComponentProperty(nodes, nodeId, key, parsed.value);
}

// Returns a property to its default by removing the override. Always one change.
export function resetComponentProperty<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  key: string,
): PropertyEditResult<N> {
  const update = removeNodeProperty(nodes, nodeId, key);
  if (!update.ok) return nodeNotFound();
  return { ok: true, nodes: update.nodes, changed: update.changed };
}

// ---- Drafts ----
// A field keeps what is being typed as local text and leaves the graph alone until the edit
// is finished (Enter or leaving the field). Escape throws the text away.

export type DraftOutcome =
  // Nothing to do: the text is the value already in place.
  | { action: "none" }
  | { action: "commit"; value: number }
  | { action: "invalid"; reason: PropertyRejection; message: string };

export function interpretDraft(
  type: ArchitectureNodeType,
  key: string,
  text: string,
  committedValue: number,
): DraftOutcome {
  const parsed = parsePropertyInput(type, key, text);
  if (!parsed.ok) return { action: "invalid", reason: parsed.reason, message: parsed.message };
  return parsed.value === committedValue ? { action: "none" } : { action: "commit", value: parsed.value };
}

// What a field should do when the person finishes with it. `leaving` is true when focus moves
// away and false for Enter. A value that cannot be used is kept on screen with its reason on
// Enter (so it can be fixed), and quietly dropped when leaving (the field shows the current
// value again). A draft equal to the current value changes nothing.
export type DraftFinish =
  | { action: "discard" }
  | { action: "keep-editing"; message: string }
  | { action: "commit" };

export function finishDraft(
  type: ArchitectureNodeType,
  key: string,
  text: string,
  committedValue: number,
  leaving: boolean,
): DraftFinish {
  const outcome = interpretDraft(type, key, text, committedValue);
  if (outcome.action === "none") return { action: "discard" };
  if (outcome.action === "commit") return { action: "commit" };
  return leaving ? { action: "discard" } : { action: "keep-editing", message: outcome.message };
}
