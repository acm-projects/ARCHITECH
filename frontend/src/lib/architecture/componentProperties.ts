import { roleOf } from "./analysis.ts";
import {
  CAPACITY_MAX,
  DATABASE_REPLICAS_MAX,
  REPLICAS_MAX,
  SIMULATION_PROFILES,
  configureNode,
} from "./evaluation/capabilities.ts";
import type { NodeProperties, ArchitectureNodeType } from "./types.ts";

// What can be configured on each kind of component, in one place. Defaults and limits are
// taken from the evaluation engine's own profile table and constants (evaluation/
// capabilities.ts), and the effective value of a property is whatever the engine would use,
// so the settings a user sees and the numbers Run Design evaluates cannot disagree.
//
// Stored properties are the user's explicit overrides. A component with no stored value
// uses its default, so nothing is written into a node until the user changes something.
// Validation here is strict: a value the engine would clamp, round or ignore is rejected,
// so what is stored is always what the engine will use. (The generic sanitizer in
// nodeProperties.ts stays the storage-level guard; this is the per-property layer on top.)

export type ComponentPropertyKey = "replicas" | "capacity" | "cacheHitRate";

// integer: a whole number. number: any number in range. rate: a fraction from 0 to 1
// (0.7 means 70%), the same representation the engine reads.
export type PropertyKind = "integer" | "number" | "rate";

export type ComponentPropertyDefinition = {
  // The key stored on the node. For a database, `replicas` means READ replicas.
  key: ComponentPropertyKey;
  label: string;
  description: string;
  kind: PropertyKind;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
};

const DEFINITION_ORDER: ComponentPropertyKey[] = ["replicas", "capacity", "cacheHitRate"];

// Components whose capacity is not worth configuring: name lookups are never the limit.
const NO_CAPACITY_CONTROL = new Set<ArchitectureNodeType>(["dns"]);

function buildDefinitions(type: ArchitectureNodeType): ComponentPropertyDefinition[] {
  const profile = SIMULATION_PROFILES[type];
  const role = roleOf(type);
  if (role === "entry") return [];

  const definitions: ComponentPropertyDefinition[] = [];

  if (role === "database") {
    definitions.push({
      key: "replicas",
      label: "Read replicas",
      description:
        "Copies of the primary that serve reads. 0 means the primary serves everything. Writes always go to the primary.",
      kind: "integer",
      min: 0,
      max: DATABASE_REPLICAS_MAX,
      step: 1,
      defaultValue: 0,
    });
  } else {
    definitions.push({
      key: "replicas",
      label: "Replicas",
      description: "Instances running in parallel. More instances carry more load and survive failures.",
      kind: "integer",
      min: profile.minInstances,
      max: REPLICAS_MAX,
      step: 1,
      defaultValue: profile.defaultInstances,
    });
  }

  if (profile.capacityPerInstance !== null && !NO_CAPACITY_CONTROL.has(type)) {
    definitions.push({
      key: "capacity",
      label: "Capacity",
      description:
        "Work one instance can do each second. A larger instance costs proportionally more.",
      kind: "number",
      min: 1,
      max: CAPACITY_MAX,
      step: 100,
      defaultValue: profile.capacityPerInstance,
      unit: role === "database" ? "operations/s per instance" : "requests/s per instance",
    });
  }

  if ((profile.hitRate ?? 0) > 0) {
    definitions.push({
      key: "cacheHitRate",
      label: "Hit rate",
      description: "Share of reads answered here without going further, from 0 to 1 (0.7 is 70%).",
      kind: "rate",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: profile.hitRate ?? 0,
    });
  }

  return definitions.sort(
    (a, b) => DEFINITION_ORDER.indexOf(a.key) - DEFINITION_ORDER.indexOf(b.key),
  );
}

const cache = new Map<ArchitectureNodeType, readonly ComponentPropertyDefinition[]>();

// The properties that can be configured on a component type, in display order. Empty for
// components with nothing to configure (clients). The same array is returned each time.
export function getPropertyDefinitions(
  type: ArchitectureNodeType,
): readonly ComponentPropertyDefinition[] {
  let definitions = cache.get(type);
  if (!definitions) {
    definitions = Object.freeze(buildDefinitions(type));
    cache.set(type, definitions);
  }
  return definitions;
}

export function getPropertyDefinition(
  type: ArchitectureNodeType,
  key: string,
): ComponentPropertyDefinition | undefined {
  return getPropertyDefinitions(type).find((definition) => definition.key === key);
}

// ---- Effective values ----

// What the engine will use for each supported property of a component: the stored override
// if it is usable, otherwise the default. Computed by the engine's own configuration
// reader, so it matches Run Design exactly (including its limits).
export function getEffectiveProperties(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
): Partial<Record<ComponentPropertyKey, number>> {
  const config = configureNode({ id: "-", data: { type, ...(properties ? { properties } : {}) } });
  const values: Partial<Record<ComponentPropertyKey, number>> = {};
  for (const definition of getPropertyDefinitions(type)) {
    if (definition.key === "replicas") {
      values.replicas = roleOf(type) === "database" ? config.instances - 1 : config.instances;
    } else if (definition.key === "capacity") {
      values.capacity = config.capacityPerInstance ?? definition.defaultValue;
    } else {
      values.cacheHitRate = config.hitRate;
    }
  }
  return values;
}

export function getEffectiveProperty(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
  key: ComponentPropertyKey,
): number | undefined {
  return getEffectiveProperties(type, properties)[key];
}

// Whether the user has stored a value for this property, as opposed to using the default.
export function isOverridden(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
  key: string,
): boolean {
  return (
    getPropertyDefinition(type, key) !== undefined &&
    properties !== undefined &&
    Object.hasOwn(properties, key)
  );
}

// ---- Validation ----

export type PropertyRejection =
  | "unsupported"
  | "empty"
  | "not-a-number"
  | "not-an-integer"
  | "below-minimum"
  | "above-maximum";

export type PropertyValidation =
  | { ok: true; value: number }
  | { ok: false; reason: PropertyRejection; message: string };

const reject = (reason: PropertyRejection, message: string): PropertyValidation => ({
  ok: false,
  reason,
  message,
});

// Checks a value for one property of one component type. Nothing is clamped or rounded: an
// unusable value is refused with the reason, so what gets stored is what the engine uses.
export function validatePropertyValue(
  type: ArchitectureNodeType,
  key: string,
  value: unknown,
): PropertyValidation {
  const definition = getPropertyDefinition(type, key);
  if (!definition) return reject("unsupported", `This component has no "${key}" setting.`);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return reject("not-a-number", `${definition.label} must be a number.`);
  }
  if (definition.kind === "integer" && !Number.isInteger(value)) {
    return reject("not-an-integer", `${definition.label} must be a whole number.`);
  }
  if (value < definition.min) {
    return reject("below-minimum", `${definition.label} must be at least ${definition.min}.`);
  }
  if (value > definition.max) {
    return reject("above-maximum", `${definition.label} must be at most ${definition.max}.`);
  }
  return { ok: true, value };
}

// Plain decimal numbers only: no hex, no "Infinity", no thousands separators.
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

// Reads what a person typed. An empty field and text that is not a number are different
// refusals, because an empty field is usually just not finished yet.
export function parsePropertyInput(
  type: ArchitectureNodeType,
  key: string,
  text: string,
): PropertyValidation {
  const definition = getPropertyDefinition(type, key);
  if (!definition) return reject("unsupported", `This component has no "${key}" setting.`);
  const trimmed = text.trim();
  if (trimmed === "") return reject("empty", `Enter a value for ${definition.label}.`);
  if (!DECIMAL.test(trimmed)) return reject("not-a-number", `${definition.label} must be a number.`);
  return validatePropertyValue(type, key, Number(trimmed));
}

// A number as the text to show in a field: no float noise (0.30000000000000004).
export function formatPropertyValue(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}
