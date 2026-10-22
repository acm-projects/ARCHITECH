import { createHash } from "node:crypto";

// Throttling for sign-in and sign-up, so passwords cannot be guessed at speed and accounts
// cannot be mass-created. Stored in PostgreSQL (attemptStore.ts) so it holds across servers.
// Keys (emails, IP addresses) are stored only as hashes.
//
//   Sign-in, per email:  5 failed attempts in 15 minutes locks that email until the oldest
//                        failure is 15 minutes old. A successful sign-in clears the count.
//   Sign-in, per IP:     20 failed attempts in 15 minutes blocks that address the same way.
//   Sign-up, per IP:     5 accounts an hour.
// Limits can be changed with AUTH_LOGIN_FAILURES_PER_EMAIL, AUTH_LOGIN_FAILURES_PER_IP and
// AUTH_SIGNUPS_PER_IP_PER_HOUR.

export type AttemptKind = "login-email" | "login-ip" | "signup-ip";

export type AttemptStore = {
  // Times of attempts of this kind and key since `since`, oldest first, with whether each succeeded.
  attempts: (kind: AttemptKind, keyHash: string, since: Date) => Promise<{ at: Date; success: boolean }[]>;
  record: (kind: AttemptKind, keyHash: string, success: boolean) => Promise<void>;
  prune: (before: Date) => Promise<void>;
};

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const SIGNUP_WINDOW_MS = 60 * 60_000;
// Rows are kept for a day, then deleted.
export const ATTEMPT_RETENTION_MS = 24 * 60 * 60_000;

export type AttemptLimits = { loginFailuresPerEmail: number; loginFailuresPerIp: number; signupsPerIpPerHour: number };

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function attemptLimitsFromEnv(env: Record<string, string | undefined> = process.env): AttemptLimits {
  return {
    loginFailuresPerEmail: positive(env.AUTH_LOGIN_FAILURES_PER_EMAIL, 5),
    loginFailuresPerIp: positive(env.AUTH_LOGIN_FAILURES_PER_IP, 20),
    signupsPerIpPerHour: positive(env.AUTH_SIGNUPS_PER_IP_PER_HOUR, 5),
  };
}

export const hashKey = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

// The client's address from the proxy headers (the first x-forwarded-for entry, then
// x-real-ip). "unknown" when there is none, which then shares one bucket.
export function clientIp(headers: { get(name: string): string | null } | Record<string, unknown> | undefined): string {
  const read = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as { get?: unknown }).get === "function") return (headers as { get(name: string): string | null }).get(name);
    const value = (headers as Record<string, unknown>)[name];
    return Array.isArray(value) ? String(value[0] ?? "") : typeof value === "string" ? value : null;
  };
  const forwarded = read("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || read("x-real-ip")?.trim() || "unknown";
}

export type Verdict = { ok: true } | { ok: false; retryAfterSeconds: number; error: string };

const minutes = (seconds: number) => {
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
};

// Failures that count: those in the window after the last success.
function countedFailures(attempts: { at: Date; success: boolean }[]): Date[] {
  const lastSuccess = attempts.findLastIndex((attempt) => attempt.success);
  return attempts.slice(lastSuccess + 1).filter((attempt) => !attempt.success).map((attempt) => attempt.at);
}

function overLimit(times: Date[], limit: number, windowMs: number, now: Date): number | null {
  if (times.length < limit) return null;
  const freedBy = times[times.length - limit];
  return Math.max(1, Math.ceil((freedBy.getTime() + windowMs - now.getTime()) / 1000));
}

export async function checkLogin(store: AttemptStore, email: string, ip: string, limits: AttemptLimits, now = new Date()): Promise<Verdict> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const byEmail = countedFailures(await store.attempts("login-email", hashKey(email), since));
  const emailWait = overLimit(byEmail, limits.loginFailuresPerEmail, LOGIN_WINDOW_MS, now);
  if (emailWait !== null) {
    return { ok: false, retryAfterSeconds: emailWait, error: `Too many failed sign-in attempts for this account. Try again in ${minutes(emailWait)}.` };
  }
  const byIp = (await store.attempts("login-ip", hashKey(ip), since)).filter((attempt) => !attempt.success).map((attempt) => attempt.at);
  const ipWait = overLimit(byIp, limits.loginFailuresPerIp, LOGIN_WINDOW_MS, now);
  if (ipWait !== null) {
    return { ok: false, retryAfterSeconds: ipWait, error: `Too many failed sign-in attempts from your network. Try again in ${minutes(ipWait)}.` };
  }
  return { ok: true };
}

export async function recordLogin(store: AttemptStore, email: string, ip: string, success: boolean): Promise<void> {
  await store.record("login-email", hashKey(email), success);
  await store.record("login-ip", hashKey(ip), success);
}

export async function checkSignup(store: AttemptStore, ip: string, limits: AttemptLimits, now = new Date()): Promise<Verdict> {
  const since = new Date(now.getTime() - SIGNUP_WINDOW_MS);
  const created = (await store.attempts("signup-ip", hashKey(ip), since)).filter((attempt) => attempt.success).map((attempt) => attempt.at);
  const wait = overLimit(created, limits.signupsPerIpPerHour, SIGNUP_WINDOW_MS, now);
  return wait === null
    ? { ok: true }
    : { ok: false, retryAfterSeconds: wait, error: `Too many accounts created from your network. Try again in ${minutes(wait)}.` };
}

// Deletes old rows at most once per interval per server, in the background.
export function createAttemptPruner(store: AttemptStore, everyMs = 60 * 60_000) {
  let last = 0;
  return (now = new Date()) => {
    if (now.getTime() - last < everyMs) return;
    last = now.getTime();
    void store.prune(new Date(now.getTime() - ATTEMPT_RETENTION_MS)).catch((error) => console.error("Pruning sign-in attempts failed.", error));
  };
}
