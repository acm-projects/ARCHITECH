import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { nextEntryStep, type EntryEvent, type EntryResult, type EntryStep } from "../src/lib/entryFlow.ts";
import { HOME_ROUTE } from "../src/lib/routes.ts";
import { isSignedIn, markSignedIn, signOut } from "../src/lib/session.ts";
import { STORAGE_KEYS } from "../src/lib/storage.ts";

const read = (path: string) => readFileSync(path, "utf8");

// A browser whose storage is the given map. storage.ts reads window.localStorage.
function browser(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  };
  return data;
}

// Plays a list of events from the landing page.
function play(events: EntryEvent[], from: EntryStep = "landing"): EntryResult {
  let result: EntryResult = { step: from };
  for (const event of events) {
    assert.ok("step" in result, "the flow already ended");
    result = nextEntryStep(result.step, event);
  }
  return result;
}

// ---- 1-3. The landing page, sign in and sign up are reachable ----

test("the landing page, sign in and sign up screens exist and are what / shows", () => {
  for (const file of [
    "src/screens/Marketing.tsx",
    "src/screens/Auth.tsx",
    "src/screens/SystemStory/SystemStory.tsx",
    "src/components/auth/EntryFlow.tsx",
  ]) {
    assert.equal(existsSync(file), true, file);
  }
  const marketing = read("src/screens/Marketing.tsx");
  assert.match(marketing, /export function Landing/);
  const auth = read("src/screens/Auth.tsx");
  assert.match(auth, /export function AuthPage/);
  assert.match(auth, /export function Onboarding/);

  const entry = read("src/components/auth/EntryFlow.tsx");
  assert.match(entry, /<Landing /);
  assert.match(entry, /kind="signin"/);
  assert.match(entry, /kind="signup"/);
  assert.match(entry, /<Onboarding /);
  assert.match(read("app/page.tsx"), /EntryFlowLoader/);
});

test("the landing page leads to sign in and to sign up", () => {
  assert.deepEqual(play(["sign-in"]), { step: "signin" });
  assert.deepEqual(play(["sign-up"]), { step: "signup" });
});

// ---- 4. Sign in <-> sign up ----

test("sign in and sign up switch into each other, and both go back to the landing page", () => {
  assert.deepEqual(play(["sign-in", "switch"]), { step: "signup" });
  assert.deepEqual(play(["sign-up", "switch"]), { step: "signin" });
  assert.deepEqual(play(["sign-in", "switch", "switch"]), { step: "signin" });
  assert.deepEqual(play(["sign-in", "back"]), { step: "landing" });
  assert.deepEqual(play(["sign-up", "back"]), { step: "landing" });
});

// ---- 5-7. Onboarding ----

test("a new account goes through onboarding, and finishing it opens the new dashboard", () => {
  assert.deepEqual(play(["sign-up", "authenticated"]), { step: "onboarding" });
  assert.deepEqual(play(["sign-up", "authenticated", "onboarded"]), { redirect: HOME_ROUTE });
  assert.equal(HOME_ROUTE, "/dashboard");
});

test("onboarding cannot be skipped by anything but finishing it", () => {
  for (const event of ["sign-in", "sign-up", "back", "switch", "authenticated"] as EntryEvent[]) {
    assert.deepEqual(nextEntryStep("onboarding", event), { step: "onboarding" }, event);
  }
});

test("onboarding keeps its two questions and its experience levels", () => {
  const auth = read("src/screens/Auth.tsx");
  assert.match(auth, /Step \$\{step\} of 2/);
  for (const level of ["Beginner", "Intermediate", "Advanced"]) assert.match(auth, new RegExp(level));
  assert.match(auth, /Skip for now/);
  assert.match(auth, /Connect GitHub/);
  // The level that was chosen is remembered.
  assert.match(read("src/components/auth/EntryFlow.tsx"), /writeStorage\(STORAGE_KEYS\.level/);
});

// ---- 8. A returning user ----

test("signing in as a returning user goes straight to the dashboard, without onboarding", () => {
  assert.deepEqual(play(["sign-in", "authenticated"]), { redirect: HOME_ROUTE });
});

test("a browser that is already signed in is sent to the dashboard and not shown the entry screens", () => {
  browser({ [STORAGE_KEYS.lastPage]: "home" });
  assert.equal(isSignedIn(), true);
  const entry = read("src/components/auth/EntryFlow.tsx");
  assert.match(entry, /useState\(isSignedIn\)/);
  assert.match(entry, /router\.replace\(HOME_ROUTE\)/);
});

// ---- 9. The session ----

test("finishing sign in or onboarding creates a session, and Sign out ends it", () => {
  const data = browser();
  assert.equal(isSignedIn(), false);

  markSignedIn();
  assert.equal(isSignedIn(), true);
  assert.equal(data.get(STORAGE_KEYS.lastPage), "home", "the same marker the app always used");

  signOut();
  assert.equal(isSignedIn(), false);
  assert.equal(data.has(STORAGE_KEYS.lastPage), false);
});

test("Sign out keeps the local profile, so signing back in works", () => {
  const data = browser({ [STORAGE_KEYS.user]: JSON.stringify({ name: "Ada", email: "ada@example.com" }) });
  markSignedIn();
  signOut();
  assert.match(data.get(STORAGE_KEYS.user) ?? "", /Ada/);
});

test("browsers signed in before the cleanup stay signed in", () => {
  browser({ [STORAGE_KEYS.lastPage]: "workspace" });
  assert.equal(isSignedIn(), true);
  browser({ [STORAGE_KEYS.lastPage]: "landing" });
  assert.equal(isSignedIn(), false);
  browser({});
  assert.equal(isSignedIn(), false);
});

test("blocked storage means signed out, not an error", () => {
  (globalThis as unknown as { window: unknown }).window = {
    get localStorage(): never {
      throw new Error("blocked");
    },
  };
  assert.equal(isSignedIn(), false);
  assert.doesNotThrow(() => markSignedIn());
  assert.doesNotThrow(() => signOut());
});

test("the dashboard and the project workspace are only for signed-in users, and the dashboard has Sign out", () => {
  assert.match(read("app/dashboard/page.tsx"), /<AuthGate>/);
  assert.match(read("app/workspace/[projectId]/page.tsx"), /<AuthGate>/);
  const gate = read("src/components/auth/AuthGate.tsx");
  assert.match(gate, /router\.replace\("\/"\)/);
  assert.match(read("app/dashboard/page.tsx"), /<ProfileMenu \/>/);
  const menu = read("src/components/auth/ProfileMenu.tsx");
  assert.match(menu, /signOut\(\)/);
  assert.match(menu, /router\.replace\("\/"\)/);
  assert.match(menu, /Sign out/);
});

// ---- 10-11. The dashboard is still the project dashboard ----

test("the dashboard still uses the project store and opens projects by id", () => {
  const projects = read("src/components/dashboard/RecentProjects.tsx");
  assert.match(projects, /useProjectList/);
  assert.match(projects, /projectActions\.(rename|duplicate|remove)/);
  assert.match(projects, /projectRoute\(project\.id\)/);
  assert.match(read("src/components/projects/useStartProject.ts"), /router\.push\(projectRoute\(result\.value\.id\)\)/);
  // Only the new project system is used: the old one (architech-projects-v2) has no code left.
  assert.equal(existsSync("src/lib/projects.ts"), false);
  assert.match(read("src/components/projects/projectStore.ts"), /architech:projects/);
});
