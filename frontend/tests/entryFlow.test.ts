import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { nextEntryStep, type EntryEvent, type EntryResult, type EntryStep } from "../src/lib/entryFlow.ts";
import { HOME_ROUTE } from "../src/lib/routes.ts";
import { isValidAuthEmail, normalizeAuthEmail } from "../src/lib/authEmail.ts";
import { EXPERIENCE_LEVELS, isExperienceLevel } from "../src/lib/experienceLevel.ts";

const read = (path: string) => readFileSync(path, "utf8");

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
  assert.match(entry, /<Onboarding\s/);
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

test("auth email normalization trims surrounding whitespace and lowercases addresses", () => {
  assert.equal(normalizeAuthEmail("  BryceExample@Gmail.com  "), "bryceexample@gmail.com");
  assert.equal(isValidAuthEmail(normalizeAuthEmail(" BryceExample@Gmail.com ")), true);
  assert.equal(isValidAuthEmail(normalizeAuthEmail("bryce example@gmail.com")), false);
  assert.equal(isValidAuthEmail("missing-at-domain"), false);
});

test("only supported experience levels are accepted for onboarding", () => {
  assert.deepEqual(EXPERIENCE_LEVELS, ["Beginner", "Intermediate", "Advanced"]);
  for (const level of EXPERIENCE_LEVELS) assert.equal(isExperienceLevel(level), true);
  assert.equal(isExperienceLevel("Expert"), false);
  assert.equal(isExperienceLevel(null), false);
});

// ---- 5-7. Onboarding ----

test("a new account goes through onboarding, and finishing it opens the new dashboard", () => {
  assert.deepEqual(play(["sign-up", "authenticated"]), { step: "onboarding" });
  assert.deepEqual(play(["sign-up", "authenticated", "onboarded"]), { redirect: HOME_ROUTE });
  assert.equal(HOME_ROUTE, "/dashboard");

  const entry = read("src/components/auth/EntryFlow.tsx");
  assert.match(entry, /done=\{\(\) => go\("authenticated"\)\}/);
  assert.match(entry, /needsOnboarding \|\| step === "onboarding" \? "onboarding" : step/);
  assert.match(entry, /onboardingStarted=\{\(\) => setStep\("onboarding"\)\}/);
  assert.match(entry, /const \[onboardingStep, setOnboardingStep\] = useState<1 \| 2>\(1\)/);
  assert.match(entry, /step=\{onboardingStep\}/);
  assert.match(entry, /setStep=\{setOnboardingStep\}/);
  const auth = read("src/screens/Auth.tsx");
  assert.match(auth, /fetch\("\/api\/auth\/register"/);
  assert.match(auth, /if \(!response\.ok\)/);
  assert.match(auth, /setMessage\(body\.error/);
  assert.match(auth, /await signIn\("credentials"/);
  assert.match(auth, /callbackUrl: "\/"/);
  assert.match(auth, /callbackUrl: "\/dashboard"/);
});

test("onboarding cannot be skipped by anything but finishing it", () => {
  for (const event of ["sign-in", "sign-up", "back", "switch", "authenticated"] as EntryEvent[]) {
    assert.deepEqual(nextEntryStep("onboarding", event), { step: "onboarding" }, event);
  }

  const entry = read("src/components/auth/EntryFlow.tsx");
  assert.match(entry, /needsOnboarding \|\| step === "onboarding"/);
});

test("onboarding keeps its two questions and its experience levels", () => {
  const auth = read("src/screens/Auth.tsx");
  assert.match(auth, /Step \$\{step\} of 2/);
  for (const level of ["Beginner", "Intermediate", "Advanced"]) assert.match(auth, new RegExp(level));
  assert.match(auth, /Skip for now/);
  assert.match(auth, /Connect GitHub/);
  assert.match(auth, /onClick=\{continueToGitHub\}/);
  assert.match(auth, /fetch\("\/api\/users\/me"/);
  assert.match(auth, /JSON\.stringify\(\{ experienceLevel: level \}\)/);
  const continueHandler = auth.slice(
    auth.indexOf("const continueToGitHub"),
    auth.indexOf("const connectGitHub"),
  );
  assert.ok(
    continueHandler.indexOf("onboardingStarted();") < continueHandler.indexOf('fetch("/api/users/me"'),
    "the parent flow must retain onboarding before saving the profile",
  );
  assert.ok(
    continueHandler.indexOf("setStep(2)") > continueHandler.indexOf("if (!response.ok)"),
    "Continue advances to GitHub only after the profile save succeeds",
  );
  assert.ok(
    continueHandler.indexOf("setStep(2)") < continueHandler.indexOf("await update()"),
    "the parent-owned GitHub step is committed before refreshing the session",
  );
  const profileRoute = read("app/api/users/me/route.ts");
  assert.match(profileRoute, /getServerSession\(authOptions\)/);
  assert.match(profileRoute, /prisma\.user\.update/);
  assert.match(profileRoute, /isExperienceLevel\(body\.experienceLevel\)/);
  assert.match(read("app/api/auth/[...nextauth]/route.ts"), /experienceLevel/);
  assert.match(read("prisma/schema.prisma"), /experienceLevel String\?/);
  assert.match(auth, /signIn\("github", \{ callbackUrl: "\/dashboard" \}\)/);
  assert.match(auth, /const skipGitHub = \(\) => \{\s*done\(\);/);

  const githubRepos = read("app/api/github/repos/route.ts");
  assert.match(githubRepos, /getServerSession\(authOptions\)/);
  assert.match(githubRepos, /status: 401/);
  assert.match(githubRepos, /provider: "github"/);
  assert.match(githubRepos, /select: \{ access_token: true \}/);
  assert.match(githubRepos, /status: 404/);
  assert.match(githubRepos, /https:\/\/api\.github\.com\/user\/repos\?sort=updated&per_page=10/);
  assert.match(githubRepos, /Authorization: `Bearer \$\{githubAccount\.access_token\}`/);
  assert.match(githubRepos, /status: 502/);
});

// ---- 8. A returning user ----

test("signing in as a returning user goes straight to the dashboard, without onboarding", () => {
  assert.deepEqual(play(["sign-in", "authenticated"]), { redirect: HOME_ROUTE });
  const auth = read("src/screens/Auth.tsx");
  assert.match(auth, /if \(isSignup\)/);
  assert.match(auth, /done\(\)/);
});

test("an authenticated NextAuth session is sent to the dashboard instead of showing entry screens", () => {
  const entry = read("src/components/auth/EntryFlow.tsx");
  assert.match(entry, /useSession\(\)/);
  assert.match(entry, /status === "authenticated"/);
  assert.doesNotMatch(entry, /localStorage|sessionStorage|isSignedIn|markSignedIn/);
  assert.match(entry, /router\.replace\(HOME_ROUTE\)/);
});

test("the account menu uses NextAuth session state", () => {
  const menu = read("src/components/auth/ProfileMenu.tsx");
  assert.match(menu, /useSession\(\)/);
  assert.match(menu, /signOut\(\{ callbackUrl: "\/" \}\)/);
  assert.doesNotMatch(menu, /localStorage|sessionStorage|lib\/session/);

  const auth = read("src/screens/Auth.tsx");
  assert.doesNotMatch(auth, /localStorage|sessionStorage|readJsonStorage/);

  assert.match(read("app/layout.tsx"), /<AuthSessionProvider>/);
  assert.equal(existsSync("src/lib/session.ts"), false);
});

test("route protection is handled by proxy and route pages have no client-side bouncers", () => {
  const dashboard = read("app/dashboard/page.tsx");
  const workspace = read("app/workspace/[projectId]/page.tsx");
  const proxy = read("proxy.ts");
  assert.doesNotMatch(dashboard, /AuthGate|router\.(push|replace)|redirect\(/);
  assert.doesNotMatch(workspace, /AuthGate|router\.(push|replace)|redirect\(/);
  assert.match(dashboard, /<main className="flex h-dvh/);
  assert.match(proxy, /"\/dashboard\/:path\*"/);
  assert.match(proxy, /"\/workspace\/:path\*"/);
  assert.equal(existsSync("src/components/auth/AuthGate.tsx"), false);

  assert.match(dashboard, /<ProfileMenu \/>/);
  const menu = read("src/components/auth/ProfileMenu.tsx");
  assert.match(menu, /signOut\(\{ callbackUrl: "\/" \}\)/);
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
