import {
  getEffectiveProperties,
  getPropertyDefinitions,
  isOverridden,
  parsePropertyInput,
  type ComponentPropertyKey,
  type PropertyKind,
  type PropertyRejection,
} from "./componentProperties.ts";
import type { EdgeLike, NodeLike } from "./nodeOperations.ts";
import { getSelection } from "./selection.ts";
import type { ArchitectureNodeType, NodeProperties } from "./types.ts";

// What a settings screen needs about one component, worked out: which settings it has, their
// current values, which are overridden, and what each accepts. No storage details and no
// presentation (colours, icons).

export type PropertyView = {
  key: ComponentPropertyKey;
  label: string;
  description: string;
  unit?: string;
  kind: PropertyKind;
  // What Run Design uses right now: the override, or the default.
  value: number;
  defaultValue: number;
  // The user has set this; false means it is on its default.
  overridden: boolean;
  // Resetting would change something.
  canReset: boolean;
  constraints: { min: number; max: number; step: number };
  // The state of an unfinished draft, when one is passed in. The committed value is always valid.
  validation: { state: "valid" } | { state: "invalid"; reason: PropertyRejection; message: string };
  draft?: string;
};

export function buildPropertyViews(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
  drafts: Partial<Record<string, string>> = {},
): PropertyView[] {
  const effective = getEffectiveProperties(type, properties);
  return getPropertyDefinitions(type).map((definition) => {
    const overridden = isOverridden(type, properties, definition.key);
    const draft = drafts[definition.key];
    const parsed = draft === undefined ? null : parsePropertyInput(type, definition.key, draft);
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      ...(definition.unit ? { unit: definition.unit } : {}),
      kind: definition.kind,
      value: effective[definition.key] ?? definition.defaultValue,
      defaultValue: definition.defaultValue,
      overridden,
      canReset: overridden,
      constraints: { min: definition.min, max: definition.max, step: definition.step },
      validation:
        parsed && !parsed.ok
          ? { state: "invalid", reason: parsed.reason, message: parsed.message }
          : { state: "valid" },
      ...(draft === undefined ? {} : { draft }),
    };
  });
}

export type ComponentConfigView =
  | {
      kind: "none";
      // Why there is nothing to configure: nothing is selected, a connection is, or several
      // things are (their settings are not edited together).
      reason: "nothing-selected" | "edge-selected" | "multiple-selected";
    }
  | {
      kind: "node";
      nodeId: string;
      type: ArchitectureNodeType;
      label: string;
      properties: PropertyView[];
    };

// The configuration to show for the current selection: exactly one selected component, and
// nothing else, has one.
export function getComponentConfigView(
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
  drafts?: Partial<Record<string, string>>,
): ComponentConfigView {
  const selection = getSelection(nodes, edges);
  if (selection.kind === "none") return { kind: "none", reason: "nothing-selected" };
  if (selection.kind === "edge") return { kind: "none", reason: "edge-selected" };
  if (selection.kind === "multiple") return { kind: "none", reason: "multiple-selected" };

  const node = nodes.find((candidate) => candidate.id === selection.nodeId);
  if (!node) return { kind: "none", reason: "nothing-selected" };
  return {
    kind: "node",
    nodeId: node.id,
    type: node.data.type,
    label: node.data.label,
    properties: buildPropertyViews(node.data.type, node.data.properties, drafts),
  };
}
