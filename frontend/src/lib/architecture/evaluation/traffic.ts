// The load a design is evaluated against. Built to be filled in by the Run Design controls,
// and tolerant of anything those controls (or a stored value, or a request) might send.

export type TrafficProfile = {
  // Peak requests per second arriving from clients.
  requestsPerSecond: number;
  // Users connected at the same time. Limits connection-bound tiers.
  concurrentUsers: number;
  datasetGb: number;
  // Percent of requests that are reads (the rest are writes), 0-100.
  readRatio: number;
  // Round trip between a client and the system.
  networkLatencyMs: number;
};

export const DEFAULT_TRAFFIC: TrafficProfile = {
  requestsPerSecond: 1_000,
  concurrentUsers: 5_000,
  datasetGb: 100,
  readRatio: 80,
  networkLatencyMs: 40,
};

export const TRAFFIC_LIMITS: Record<keyof TrafficProfile, { min: number; max: number }> = {
  requestsPerSecond: { min: 0, max: 10_000_000 },
  concurrentUsers: { min: 0, max: 1_000_000_000 },
  datasetGb: { min: 0, max: 1_000_000 },
  readRatio: { min: 0, max: 100 },
  networkLatencyMs: { min: 0, max: 5_000 },
};

// One user makes this many requests a second. Used to fill in whichever of
// requestsPerSecond and concurrentUsers is missing.
export const REQUESTS_PER_USER_PER_SECOND = 0.2;

const FIELDS = Object.keys(DEFAULT_TRAFFIC) as (keyof TrafficProfile)[];

type Parsed = { value: number | null; corrected: boolean };

// A finite number in range is kept. Infinity and out-of-range numbers are pulled to the
// nearest limit and negatives become the minimum (all counted as corrected). NaN, other
// types and missing values are "missing": the caller picks a default (corrected, unless
// the value was simply absent).
function parse(raw: unknown, limits: { min: number; max: number }): Parsed {
  if (raw === undefined || raw === null) return { value: null, corrected: false };
  if (typeof raw !== "number" || Number.isNaN(raw)) return { value: null, corrected: true };
  const value = Math.min(limits.max, Math.max(limits.min, raw));
  return { value, corrected: value !== raw };
}

// Always returns a complete, valid profile. `adjusted` names the fields that were provided
// but wrong (negative, NaN, infinite, out of range, not a number) and so were replaced.
export function sanitizeTraffic(input: unknown): {
  traffic: TrafficProfile;
  adjusted: string[];
} {
  const source: Record<string, unknown> =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  const parsed = Object.fromEntries(
    FIELDS.map((field) => [field, parse(source[field], TRAFFIC_LIMITS[field])]),
  ) as Record<keyof TrafficProfile, Parsed>;
  const adjusted = FIELDS.filter((field) => parsed[field].corrected);

  const clamp = (field: keyof TrafficProfile, value: number) =>
    Math.min(TRAFFIC_LIMITS[field].max, Math.max(TRAFFIC_LIMITS[field].min, value));

  // Each of the two load figures can be worked out from the other.
  const rps =
    parsed.requestsPerSecond.value ??
    (parsed.concurrentUsers.value !== null
      ? clamp("requestsPerSecond", parsed.concurrentUsers.value * REQUESTS_PER_USER_PER_SECOND)
      : DEFAULT_TRAFFIC.requestsPerSecond);
  const users =
    parsed.concurrentUsers.value ??
    (parsed.requestsPerSecond.value !== null
      ? clamp("concurrentUsers", parsed.requestsPerSecond.value / REQUESTS_PER_USER_PER_SECOND)
      : DEFAULT_TRAFFIC.concurrentUsers);

  return {
    traffic: {
      requestsPerSecond: rps,
      concurrentUsers: users,
      datasetGb: parsed.datasetGb.value ?? DEFAULT_TRAFFIC.datasetGb,
      readRatio: parsed.readRatio.value ?? DEFAULT_TRAFFIC.readRatio,
      networkLatencyMs: parsed.networkLatencyMs.value ?? DEFAULT_TRAFFIC.networkLatencyMs,
    },
    adjusted,
  };
}

// ---- Stress test: the request rate a design is run at ----
//
// The stress test is Run Design at a different load, not a second engine. Changing the rate
// changes the traffic profile, which is part of what a result is compared against, so a
// result produced at another rate is out of date (see fingerprint.ts).

// The rate a design is normally evaluated at. Stress multiples are taken from it.
export const BASELINE_REQUESTS_PER_SECOND = DEFAULT_TRAFFIC.requestsPerSecond;

export const STRESS_MULTIPLIERS = [1, 2, 5, 10] as const;

export type RateParse = { ok: true; value: number } | { ok: false; message: string };

// What was typed into the request rate field. Empty, non-numeric, negative and out-of-range
// values are refused (not corrected), so the field never changes the load by accident.
export function parseRequestRate(text: string): RateParse {
  const trimmed = text.trim().replace(/,/g, "");
  const { min, max } = TRAFFIC_LIMITS.requestsPerSecond;
  if (trimmed === "") return { ok: false, message: "Enter a request rate." };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, message: "Request rate must be a number." };
  if (value < min) return { ok: false, message: "Request rate cannot be negative." };
  if (value > max) {
    return { ok: false, message: `Request rate cannot exceed ${max.toLocaleString("en-US")} req/s.` };
  }
  return { ok: true, value };
}

// The profile at a different request rate. Concurrent users follow the rate (the same
// relation sanitizeTraffic uses), so connection-bound components feel the change too.
// Everything else about the load is kept.
export function withRequestRate(traffic: TrafficProfile, requestsPerSecond: number): TrafficProfile {
  return sanitizeTraffic({
    ...traffic,
    requestsPerSecond,
    concurrentUsers: requestsPerSecond / REQUESTS_PER_USER_PER_SECOND,
  }).traffic;
}

// The baseline load scaled by `multiplier` (2 = "2x traffic").
export const stressRate = (multiplier: number) => BASELINE_REQUESTS_PER_SECOND * multiplier;
