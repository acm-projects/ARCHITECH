import { roleOf } from "./analysis.ts";
import { resolveImplementation } from "./componentLibrary.ts";
import {
  CAPACITY_MAX,
  DATABASE_REPLICAS_MAX,
  REPLICAS_MAX,
  AUTH_CHECK_RATE_DEFAULT,
  SEARCH_RATE_DEFAULT,
  profileOf,
  configureNode,
} from "./evaluation/capabilities.ts";
import { ACTS_AS_LABELS, CUSTOM_LIMITS, actsAsOf, measuredNode, type ActsAsType } from "./customComponents.ts";
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

export type ComponentPropertyKey =
  | "replicas"
  | "capacity"
  | "cacheHitRate"
  | "authCheckRate"
  | "searchRate"
  // Custom components only (customComponents.ts): their own latency, cost and availability.
  | "latencyMs"
  | "costPerInstance"
  | "availability";

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

const DEFINITION_ORDER: ComponentPropertyKey[] = ["replicas", "capacity", "cacheHitRate", "authCheckRate", "searchRate"];

// Components whose capacity is not worth configuring: name lookups are never the limit.
const NO_CAPACITY_CONTROL = new Set<ArchitectureNodeType>(["dns"]);

function buildDefinitions(
  type: ArchitectureNodeType,
  implementation: string | undefined,
): ComponentPropertyDefinition[] {
  const profile = profileOf(type, implementation);
  const role = roleOf(type);
  if (role === "entry" || role === "custom") return [];

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
      description:
        role === "edge"
          ? "Share of static files (images, scripts, video) answered at the edge without reaching your servers, from 0 to 1 (0.95 is 95%). API requests always go through."
          : "Share of reads answered here without going further, from 0 to 1 (0.7 is 70%).",
      kind: "rate",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: profile.hitRate ?? 0,
    });
  }

  if (type === "auth") {
    definitions.push({
      key: "authCheckRate",
      label: "Requests checked by auth",
      description:
        "Share of requests that call this service, from 0 to 1. JWT (default 0.05): services verify the signed token themselves, so only sign-ins and token refreshes reach it; tokens cannot be revoked instantly. Session lookup (1): every request checks with it, so a sign-out takes effect at once but it carries the full load.",
      kind: "rate",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: AUTH_CHECK_RATE_DEFAULT,
    });
  }

  if (type === "search") {
    definitions.push({
      key: "searchRate",
      label: "Requests that search",
      description:
        "Share of requests that run a search, from 0 to 1 (0.1 is 10%). Raise it for search-first apps such as a store catalog; most other requests never reach search.",
      kind: "rate",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: SEARCH_RATE_DEFAULT,
    });
  }

  return definitions.sort(
    (a, b) => DEFINITION_ORDER.indexOf(a.key) - DEFINITION_ORDER.indexOf(b.key),
  );
}

const cache = new Map<string, readonly ComponentPropertyDefinition[]>();

// ---- Custom components ----

// The numbers a custom component that acts like `actsAs` can set, with that role's standard
// technology as defaults. Without actsAs (null) the defaults are 0 and the ranges the widest
// any role allows: that set is only used to validate a stored value, never shown.
function buildCustomDefinitions(actsAs: ActsAsType | null): ComponentPropertyDefinition[] {
  const role = actsAs ?? "server";
  const profile = profileOf(role, undefined);
  const isDatabase = actsAs === "database";
  const definitions: ComponentPropertyDefinition[] = [
    {
      key: "replicas",
      label: isDatabase ? "Read replicas" : "Replicas",
      description: isDatabase
        ? "Copies of the primary that serve reads. 0 means the primary serves everything."
        : "Instances running in parallel. More instances carry more load and survive failures.",
      kind: "integer",
      min: actsAs === null || isDatabase ? 0 : profile.minInstances,
      max: Math.max(REPLICAS_MAX, DATABASE_REPLICAS_MAX),
      step: 1,
      defaultValue: actsAs === null ? 0 : isDatabase ? 0 : profile.defaultInstances,
    },
  ];
  if (actsAs === null || profile.capacityPerInstance !== null) {
    definitions.push({
      key: "capacity",
      label: "Capacity",
      description: "Work one instance can do each second.",
      kind: "number",
      min: 1,
      max: CAPACITY_MAX,
      step: 100,
      defaultValue: actsAs === null ? 1 : (profile.capacityPerInstance ?? 1),
      unit: isDatabase ? "operations/s per instance" : "requests/s per instance",
    });
  }
  definitions.push(
    {
      key: "latencyMs",
      label: "Latency",
      description: "Time it adds to a request passing through it when it is not busy.",
      kind: "number",
      min: CUSTOM_LIMITS.latencyMs.min,
      max: CUSTOM_LIMITS.latencyMs.max,
      step: 1,
      defaultValue: actsAs === null ? 0 : profile.latencyMs,
      unit: "ms",
    },
    {
      key: "costPerInstance",
      label: "Cost per instance",
      description: "What one instance costs to run each month.",
      kind: "number",
      min: CUSTOM_LIMITS.costPerInstance.min,
      max: CUSTOM_LIMITS.costPerInstance.max,
      step: 10,
      defaultValue: actsAs === null ? 0 : profile.monthlyCostPerInstance,
      unit: "$/month",
    },
    {
      key: "availability",
      label: "Uptime per instance",
      description: "Share of time one instance is up, from 0.5 to 1 (0.999 is 99.9%). More instances raise the total.",
      kind: "rate",
      min: CUSTOM_LIMITS.availability.min,
      max: CUSTOM_LIMITS.availability.max,
      step: 0.001,
      defaultValue: actsAs === null ? 1 : profile.availability,
    },
  );
  return definitions;
}

const NO_DEFINITIONS: readonly ComponentPropertyDefinition[] = Object.freeze([]);

function customDefinitions(actsAs: ActsAsType | null): readonly ComponentPropertyDefinition[] {
  const cacheKey = `custom:${actsAs ?? "*"}`;
  let definitions = cache.get(cacheKey);
  if (!definitions) {
    definitions = Object.freeze(buildCustomDefinitions(actsAs));
    cache.set(cacheKey, definitions);
  }
  return definitions;
}

export const customRoleLabel = (actsAs: ActsAsType) => ACTS_AS_LABELS[actsAs];

// The properties that can be configured on a component type, in display order. Empty for
// components with nothing to configure (clients). Defaults (capacity, hit rate) come from the
// chosen implementation, or the type's default one. The same array is returned each time.
//
// A custom component's settings depend on what it acts like, read from `properties`: none
// until it acts like something (pass the node's properties to see them).
export function getPropertyDefinitions(
  type: ArchitectureNodeType,
  implementation?: string,
  properties?: NodeProperties,
): readonly ComponentPropertyDefinition[] {
  if (type === "custom") {
    const actsAs = actsAsOf(properties);
    return actsAs ? customDefinitions(actsAs) : NO_DEFINITIONS;
  }
  // Unknown or mismatched ids behave exactly like the default, so they share its entry.
  const resolved = resolveImplementation(type, implementation);
  const cacheKey = `${type}:${resolved.id}`;
  let definitions = cache.get(cacheKey);
  if (!definitions) {
    definitions = Object.freeze(buildDefinitions(type, resolved.isDefault ? undefined : resolved.id));
    cache.set(cacheKey, definitions);
  }
  return definitions;
}

// The definition a stored value is checked against. A custom component's limits depend on
// what it acts like, so a value is accepted here if any role allows it; editing a node then
// checks it against that node's own role (propertyEditing.ts).
function validationDefinition(type: ArchitectureNodeType, key: string): ComponentPropertyDefinition | undefined {
  if (type === "custom") return customDefinitions(null).find((definition) => definition.key === key);
  return getPropertyDefinition(type, key);
}

// Whether a stored property of this component type is a setting checked by validatePropertyValue.
export const isConfigurableKey = (type: ArchitectureNodeType, key: string) => validationDefinition(type, key) !== undefined;

export function getPropertyDefinition(
  type: ArchitectureNodeType,
  key: string,
  implementation?: string,
  properties?: NodeProperties,
): ComponentPropertyDefinition | undefined {
  return getPropertyDefinitions(type, implementation, properties).find((definition) => definition.key === key);
}

// ---- Effective values ----

// What the engine will use for each supported property of a component: the stored override
// if it is usable, otherwise the default. Computed by the engine's own configuration
// reader, so it matches Run Design exactly (including its limits).
export function getEffectiveProperties(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
  implementation?: string,
): Partial<Record<ComponentPropertyKey, number>> {
  if (type === "custom") return customEffectiveProperties(properties);
  const config = configureNode({
    id: "-",
    data: {
      type,
      ...(implementation === undefined ? {} : { implementation }),
      ...(properties ? { properties } : {}),
    },
  });
  const values: Partial<Record<ComponentPropertyKey, number>> = {};
  for (const definition of getPropertyDefinitions(type, implementation)) {
    if (definition.key === "replicas") {
      values.replicas = roleOf(type) === "database" ? config.instances - 1 : config.instances;
    } else if (definition.key === "capacity") {
      values.capacity = config.capacityPerInstance ?? definition.defaultValue;
    } else if (definition.key === "cacheHitRate") {
      values.cacheHitRate = config.hitRate;
    } else if (definition.key === "authCheckRate") {
      values.authCheckRate = config.checkRate;
    } else {
      values.searchRate = config.checkRate;
    }
  }
  return values;
}

// A custom component's numbers as the engine measures it (as its role, with its own numbers).
function customEffectiveProperties(properties: NodeProperties | undefined): Partial<Record<ComponentPropertyKey, number>> {
  const actsAs = actsAsOf(properties);
  if (!actsAs) return {};
  const measured = measuredNode({ id: "-", data: { type: "custom", properties: properties ?? {} } });
  const config = configureNode(measured);
  const values: Partial<Record<ComponentPropertyKey, number>> = {
    replicas: actsAs === "database" ? config.instances - 1 : config.instances,
    latencyMs: config.latencyMs,
    costPerInstance: measured.data.profile?.monthlyCostPerInstance ?? profileOf(actsAs, undefined).monthlyCostPerInstance,
    availability: measured.data.profile?.availability ?? profileOf(actsAs, undefined).availability,
  };
  if (config.capacityPerInstance !== null) values.capacity = config.capacityPerInstance;
  return values;
}

export function getEffectiveProperty(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
  key: ComponentPropertyKey,
  implementation?: string,
): number | undefined {
  return getEffectiveProperties(type, properties, implementation)[key];
}

// Whether the user has stored a value for this property, as opposed to using the default.
export function isOverridden(
  type: ArchitectureNodeType,
  properties: NodeProperties | undefined,
  key: string,
): boolean {
  return (
    validationDefinition(type, key) !== undefined &&
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
  const definition = validationDefinition(type, key);
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
  const definition = validationDefinition(type, key);
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
