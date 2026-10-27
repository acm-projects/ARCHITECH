import type { NodeProperties } from "./types.ts";

export const MAX_PROPERTY_COUNT = 32;
export const MAX_PROPERTY_KEY_LENGTH = 40;
export const MAX_PROPERTY_STRING_LENGTH = 200;

// Letters, digits, "_" and "-", starting with a letter. This also keeps keys such as
// "__proto__" out of saved projects.
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

function isValidValue(value: unknown): value is string | number | boolean {
  if (typeof value === "string") return value.length <= MAX_PROPERTY_STRING_LENGTH;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

// Reduces untrusted data to valid node properties. Anything that is not a plain object
// yields undefined. Otherwise invalid entries are dropped one by one (bad key, a value that
// is not a string, finite number or boolean, an over-long string) and at most
// MAX_PROPERTY_COUNT entries are kept, in key order, so the result is deterministic.
// Returns undefined when nothing valid is left, so nodes without configuration carry no
// `properties` field at all.
export function sanitizeNodeProperties(raw: unknown): NodeProperties | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;

  const entries = Object.entries(raw)
    .filter(
      ([key, value]) =>
        key.length <= MAX_PROPERTY_KEY_LENGTH &&
        KEY_PATTERN.test(key) &&
        isValidValue(value),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, MAX_PROPERTY_COUNT);

  return entries.length > 0 ? (Object.fromEntries(entries) as NodeProperties) : undefined;
}
