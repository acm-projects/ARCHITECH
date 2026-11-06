import assert from "node:assert/strict";
import test from "node:test";

import {
  attemptLimitsFromEnv,
  checkLogin,
  checkSignup,
  clientIp,
  hashKey,
  recordLogin,
  type AttemptKind,
  type AttemptStore,
} from "../src/lib/auth/attemptLimits.ts";

function memoryStore() {
  const rows: { kind: AttemptKind; key: string; success: boolean; at: Date }[] = [];
  let clock = new Date("2026-10-19T12:00:00Z");
  const store: AttemptStore = {
    attempts: async (kind, key, since) =>
      rows.filter((r) => r.kind === kind && r.key === key && r.at >= since).map((r) => ({ at: r.at, success: r.success })),
    record: async (kind, key, success) => void rows.push({ kind, key, success, at: clock }),
    prune: async () => undefined,
  };
  return { store, rows, setClock: (iso: string) => (clock = new Date(iso)) };
}
const limits = { loginFailuresPerEmail: 3, loginFailuresPerIp: 5, signupsPerIpPerHour: 2 };
const at = (iso: string) => new Date(iso);

test("an email is locked after repeated failures until the oldest one expires; success resets", async () => {
  const { store, setClock } = memoryStore();
  for (const time of ["12:00:00", "12:01:00", "12:02:00"]) {
    setClock(`2026-10-19T${time}Z`);
    await recordLogin(store, "Ann@Example.com", `1.1.1.${time.slice(3, 5)}`, false);
  }
  const locked = await checkLogin(store, "ann@example.com", "9.9.9.9", limits, at("2026-10-19T12:05:00Z"));
  assert.ok(!locked.ok);
  assert.equal(locked.retryAfterSeconds, 10 * 60, "the 12:00 failure leaves the 15-minute window at 12:15");
  assert.match(locked.error, /this account\. Try again in 10 minutes/);
  assert.ok((await checkLogin(store, "ann@example.com", "9.9.9.9", limits, at("2026-10-19T12:15:01Z"))).ok);

  setClock("2026-10-19T12:16:00Z");
  await recordLogin(store, "ann@example.com", "1.1.1.1", true);
  assert.ok((await checkLogin(store, "ann@example.com", "9.9.9.9", limits, at("2026-10-19T12:16:01Z"))).ok, "a success clears the count");
});

test("one network is blocked after many failures across emails", async () => {
  const { store } = memoryStore();
  for (let i = 0; i < 5; i += 1) await recordLogin(store, `user${i}@example.com`, "5.5.5.5", false);
  const blocked = await checkLogin(store, "new@example.com", "5.5.5.5", limits, at("2026-10-19T12:01:00Z"));
  assert.ok(!blocked.ok);
  assert.match(blocked.error, /from your network/);
  assert.ok((await checkLogin(store, "new@example.com", "6.6.6.6", limits, at("2026-10-19T12:01:00Z"))).ok);
});

test("sign-ups are limited per network per hour", async () => {
  const { store, setClock } = memoryStore();
  setClock("2026-10-19T12:00:00Z");
  await store.record("signup-ip", hashKey("7.7.7.7"), true);
  setClock("2026-10-19T12:30:00Z");
  await store.record("signup-ip", hashKey("7.7.7.7"), true);
  const refused = await checkSignup(store, "7.7.7.7", limits, at("2026-10-19T12:40:00Z"));
  assert.ok(!refused.ok);
  assert.equal(refused.retryAfterSeconds, 20 * 60);
  assert.ok((await checkSignup(store, "7.7.7.7", limits, at("2026-10-19T13:00:01Z"))).ok);
});

test("keys are hashed and the client address comes from the proxy headers", () => {
  assert.equal(hashKey(" A@B.com "), hashKey("a@b.com"));
  assert.match(hashKey("1.2.3.4"), /^[0-9a-f]{64}$/);
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(clientIp(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp({ "x-forwarded-for": "9.9.9.9" }), "9.9.9.9", "NextAuth passes headers as a plain object");
  assert.equal(clientIp(undefined), "unknown");
  assert.deepEqual(attemptLimitsFromEnv({}), { loginFailuresPerEmail: 5, loginFailuresPerIp: 20, signupsPerIpPerHour: 5 });
});
