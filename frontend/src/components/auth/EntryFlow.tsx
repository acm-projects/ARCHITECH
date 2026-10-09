/* EntryFlow is the controller for the entire entry flow 
   This file decides which one among Landing, AuthPage, and Onboarding
   should be shown based on the current entry step and user state.
*/
"use client";

// Navigation - Next.js router and browser state management - useRouter, HOME_ROUTE
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { HOME_ROUTE } from "../../lib/routes";

// Flow logic - entry steps and events - nextEntryStep, EntryEvent, EntryStep
import { nextEntryStep, type EntryEvent, type EntryStep } from "../../lib/entryFlow";

// UI components - AuthPage, Onboarding, Landing
import { AuthPage, Onboarding } from "../../screens/Auth";
import { Landing } from "../../screens/Marketing";
import type { ExperienceLevel } from "../../types";
// Project creation - useStartProject
import { useStartProject } from "../projects/useStartProject";

/* Controls the full entry flow for '/': landing, auth, and onboarding.
   The screens handle their own UI while this compoenent owns navigation
   and stored user state
*/
export default function EntryFlow() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const startProject = useStartProject();
  const [step, setStep] = useState<EntryStep>("landing"); // step = where the user is
  const signedIn = status === "authenticated";
  const needsOnboarding = signedIn && !session?.user.experienceLevel;
  const activeStep = needsOnboarding || step === "onboarding" ? "onboarding" : step;
  const [level, setLevel] = useState<ExperienceLevel>("Intermediate");
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);

  // Skip landing/auth/onboarding when an existing signed-in session opens '/'.
  // using 'replace' instead of 'push' to avoid adding an extra entry in the browser history
  useEffect(() => {
    if (signedIn && !needsOnboarding && (step === "landing" || step === "signin")) {
      router.replace(HOME_ROUTE);
    }
  }, [needsOnboarding, signedIn, step, router]);
  // send each user action through the shared entry flow logic
  // a transition either moves to another entry screen or completes the flow and redirects
  const go = (event: EntryEvent) => {
    const result = nextEntryStep(activeStep, event);
    if ("redirect" in result) {
      router.push(result.redirect);
      return;
    }
    setStep(result.step);
  };

  // The landing page demo bypasses onboarding and opens a preconfigured learn project
  const demo = () => {
    startProject({ title: "Netflix streaming architecture", mode: "learn", source: "template" });
  };

  // return nothing bc the useEffect above is about to redirect them to the dashboard
  // and we dont want the landing page flashing for a moment
  if (
    status === "loading" ||
    (signedIn && !needsOnboarding && (step === "landing" || step === "signin"))
  ) {
    return null;
  }

  // basically UI side of our state machine
  // each screen reports actions back through 'go'
  switch (activeStep) {
    case "landing":
      return <Landing signIn={() => go("sign-in")} signUp={() => go("sign-up")} demo={demo} />;
    case "signin":
      return (
        <AuthPage
          kind="signin"
          back={() => go("back")}
          done={() => go("authenticated")}
          switchKind={() => go("switch")}
        />
      );
    case "signup":
      return (
        <AuthPage
          kind="signup"
          back={() => go("back")}
          done={() => go("authenticated")}
          switchKind={() => go("switch")}
        />
      );
    case "onboarding":
      return (
        <Onboarding
          level={level}
          setLevel={setLevel}
          step={onboardingStep}
          setStep={setOnboardingStep}
          onboardingStarted={() => setStep("onboarding")}
          done={() => go("onboarded")}
        />
      );
  }
}
/* Idea:
 AuthPage
    ↓
doesn't control routing itself

done()
    ↓
EntryFlow receives "authenticated"
    ↓
nextEntryStep decides what happens
*/