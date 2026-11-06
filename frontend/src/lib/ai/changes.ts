import { COMPONENT_TYPES, isImplementationOf } from "../architecture/componentLibrary.ts";
import { validatePropertyValue } from "../architecture/componentProperties.ts";
import { setNodeImplementation } from "../architecture/implementationEditing.ts";
import type { ArchitectureNodeType, NodeProperties } from "../architecture/types.ts";

// Suggested changes to a design ("Apply suggestion"). The AI proposes them as structured
// operations; the server checks and previews them, and the canvas applies them with the same
// function, so what the user sees previewed is exactly what gets applied.
//
// Components that a suggestion adds are named by a temporary ref ("new-cache") so later
// operations in the same suggestion can connect to them; applying turns refs into real ids.

export type Change =
  | { op: "add_component"; ref: string; type: ArchitectureNodeType; label?: string; implementation?: string; settings?: Record<string, number> }
  | { op: "remove_component"; node: string }
  | { op: "connect"; from: string; to: string }
  | { op: "disconnect"; from: string; to: string }
  | { op: "set_setting"; node: string; key: string; value: number | null }
  | { op: "set_technology"; node: string; implementation: string };

export type Suggestion = { title: string; reason: string; changes: Change[] };

export const MAX_CHANGES = 12;
const REF = /^new-[a-z0-9-]{1,30}$/;
const TYPES = new Set<string>(COMPONENT_TYPES.map((type) => type.name).filter((name) => name !== "custom"));
const LABEL_OF = new Map(COMPONENT_TYPES.map((type) => [type.name, type.label]));

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

// Checks the shape of a suggestion as the AI sent it (the tool input). Whether it fits the
// actual design is checked when applying.
export function parseSuggestion(raw: unknown): Result<Suggestion> {
  if (!isRecord(raw)) return { ok: false, error: "A suggestion must be an object." };
  if (!text(raw.title, 80)) return { ok: false, error: "A suggestion needs a short title." };
  if (raw.reason !== undefined && (typeof raw.reason !== "string" || raw.reason.length > 400)) {
    return { ok: false, error: "A suggestion's reason must be at most 400 characters." };
  }
  if (!Array.isArray(raw.changes) || raw.changes.length === 0 || raw.changes.length > MAX_CHANGES) {
    return { ok: false, error: `A suggestion needs 1-${MAX_CHANGES} changes.` };
  }
  const refs = new Set<string>();
  const changes: Change[] = [];
  for (const [index, item] of raw.changes.entries()) {
    const at = `changes[${index}]`;
    if (!isRecord(item)) return { ok: false, error: `${at} must be an object.` };
    switch (item.op) {
      case "add_component": {
        if (typeof item.ref !== "string" || !REF.test(item.ref) || refs.has(item.ref)) {
          return { ok: false, error: `${at}.ref must be a new, unique ref like "new-cache".` };
        }
        if (typeof item.type !== "string" || !TYPES.has(item.type)) return { ok: false, error: `${at}.type is not a component type.` };
        if (item.label !== undefined && !text(item.label, 60)) return { ok: false, error: `${at}.label must be 1-60 characters.` };
        if (item.implementation !== undefined && !isImplementationOf(item.type as ArchitectureNodeType, item.implementation)) {
          return { ok: false, error: `${at}.implementation is not a technology of ${item.type}.` };
        }
        const settings: Record<string, number> = {};
        if (item.settings !== undefined) {
          if (!isRecord(item.settings)) return { ok: false, error: `${at}.settings must be an object.` };
          for (const [key, value] of Object.entries(item.settings)) {
            const check = validatePropertyValue(item.type as ArchitectureNodeType, key, value);
            if (!check.ok) return { ok: false, error: `${at}.settings.${key}: ${check.message}` };
            settings[key] = check.value;
          }
        }
        refs.add(item.ref);
        changes.push({
          op: "add_component",
          ref: item.ref,
          type: item.type as ArchitectureNodeType,
          ...(item.label ? { label: (item.label as string).trim() } : {}),
          ...(item.implementation ? { implementation: item.implementation as string } : {}),
          ...(Object.keys(settings).length > 0 ? { settings } : {}),
        });
        break;
      }
      case "remove_component":
        if (!text(item.node, 100)) return { ok: false, error: `${at}.node is required.` };
        changes.push({ op: "remove_component", node: item.node as string });
        break;
      case "connect":
      case "disconnect":
        if (!text(item.from, 100) || !text(item.to, 100)) return { ok: false, error: `${at} needs "from" and "to".` };
        changes.push({ op: item.op, from: item.from as string, to: item.to as string });
        break;
      case "set_setting":
        if (!text(item.node, 100) || !text(item.key, 40)) return { ok: false, error: `${at} needs "node" and "key".` };
        if (item.value !== null && (typeof item.value !== "number" || !Number.isFinite(item.value))) {
          return { ok: false, error: `${at}.value must be a number, or null to reset it.` };
        }
        changes.push({ op: "set_setting", node: item.node as string, key: item.key as string, value: item.value as number | null });
        break;
      case "set_technology":
        if (!text(item.node, 100) || !text(item.implementation, 60)) return { ok: false, error: `${at} needs "node" and "implementation".` };
        changes.push({ op: "set_technology", node: item.node as string, implementation: item.implementation as string });
        break;
      default:
        return { ok: false, error: `${at}.op "${String(item.op)}" is not supported.` };
    }
  }
  return {
    ok: true,
    value: { title: (raw.title as string).trim(), reason: typeof raw.reason === "string" ? raw.reason.trim() : "", changes },
  };
}

// ---- Applying ----

type NodeShape = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { type: ArchitectureNodeType; label: string; implementation?: string; properties?: NodeProperties };
};
type EdgeShape = { id: string; source: string; target: string };

export type Applied<N, E> =
  | { ok: true; nodes: N[]; edges: E[]; added: Record<string, string> }
  | { ok: false; error: string };

const COLUMN = 240;
const ROW = 110;

// Applies the changes in order to a copy of the design. All or nothing: the first change that
// does not fit the design (unknown component, invalid setting...) stops it with a reason.
export function applyChanges<N extends NodeShape, E extends EdgeShape>(
  design: { nodes: readonly N[]; edges: readonly E[] },
  changes: readonly Change[],
): Applied<N, E> {
  let nodes = design.nodes.map((node) => node);
  let edges = design.edges.map((edge) => edge);
  const added: Record<string, string> = {};
  const idOf = (name: string) => added[name] ?? name;
  const find = (name: string) => nodes.find((node) => node.id === idOf(name));
  const fail = (error: string): Applied<N, E> => ({ ok: false, error });

  for (const change of changes) {
    switch (change.op) {
      case "add_component": {
        const used = new Set(nodes.map((node) => node.id));
        let count = 1;
        while (used.has(`${change.type}-${count}`)) count += 1;
        const id = `${change.type}-${count}`;
        added[change.ref] = id;
        const node = {
          id,
          type: "architecture",
          position: { x: Number.NaN, y: Number.NaN },
          data: {
            type: change.type,
            label: change.label ?? LABEL_OF.get(change.type) ?? change.type,
            ...(change.implementation ? { implementation: change.implementation } : {}),
            ...(change.settings ? { properties: { ...change.settings } } : {}),
          },
        } as unknown as N;
        nodes = [...nodes, node];
        break;
      }
      case "remove_component": {
        const node = find(change.node);
        if (!node) return fail(`There is no component "${change.node}".`);
        nodes = nodes.filter((candidate) => candidate.id !== node.id);
        edges = edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
        break;
      }
      case "connect": {
        const from = find(change.from);
        const to = find(change.to);
        if (!from || !to) return fail(`Cannot connect "${change.from}" to "${change.to}": one of them does not exist.`);
        if (from.id === to.id) return fail("A component cannot connect to itself.");
        if (!edges.some((edge) => edge.source === from.id && edge.target === to.id)) {
          edges = [...edges, { id: `${from.id}->${to.id}`, source: from.id, target: to.id } as E];
        }
        break;
      }
      case "disconnect": {
        const from = find(change.from);
        const to = find(change.to);
        const before = edges.length;
        edges = edges.filter((edge) => !(from && to && edge.source === from.id && edge.target === to.id));
        if (edges.length === before) return fail(`There is no connection from "${change.from}" to "${change.to}".`);
        break;
      }
      case "set_setting": {
        const node = find(change.node);
        if (!node) return fail(`There is no component "${change.node}".`);
        const properties: NodeProperties = { ...node.data.properties };
        if (change.value === null) {
          delete properties[change.key];
        } else {
          const check = validatePropertyValue(node.data.type, change.key, change.value);
          if (!check.ok) return fail(`${node.data.label}: ${check.message}`);
          properties[change.key] = check.value;
        }
        const data = { ...node.data };
        if (Object.keys(properties).length > 0) data.properties = properties;
        else delete data.properties;
        nodes = nodes.map((candidate) => (candidate.id === node.id ? ({ ...candidate, data } as N) : candidate));
        break;
      }
      case "set_technology": {
        const node = find(change.node);
        if (!node) return fail(`There is no component "${change.node}".`);
        const result = setNodeImplementation(nodes, node.id, change.implementation);
        if (!result.ok) return fail(`${node.data.label}: ${result.message}`);
        nodes = result.nodes;
        break;
      }
    }
  }

  // Place each added component one column to the right of what feeds it (or of the whole
  // design), in the first free row.
  const taken = (x: number, y: number) =>
    nodes.some((node) => Number.isFinite(node.position.x) && Math.abs(node.position.x - x) < COLUMN / 2 && Math.abs(node.position.y - y) < ROW / 2);
  for (const id of Object.values(added)) {
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) continue; // added, then removed again
    const feeder = edges
      .filter((edge) => edge.target === id)
      .map((edge) => nodes.find((candidate) => candidate.id === edge.source))
      .find((candidate) => candidate && Number.isFinite(candidate.position.x));
    const placed = nodes.filter((candidate) => Number.isFinite(candidate.position.x));
    const x = feeder ? feeder.position.x + COLUMN : placed.length > 0 ? Math.max(...placed.map((n) => n.position.x)) + COLUMN : 0;
    let y = feeder ? feeder.position.y : 0;
    while (taken(x, y)) y += ROW;
    nodes = nodes.map((candidate) => (candidate.id === id ? ({ ...candidate, position: { x, y } } as N) : candidate));
  }
  return { ok: true, nodes, edges, added };
}
