/* EntryFlow is the controller for the entire entry flow 
   This file decides which one among Landing, AuthPage, and Onboarding
   should be shown based on the current entry step and user state.
*/
"use client";

// Navigation - Next.js router and browser state management - useRouter, HOME_ROUTE
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HOME_ROUTE } from "../../lib/routes";

// Flow logic - entry steps and events - nextEntryStep, EntryEvent, EntryStep
import { nextEntryStep, type EntryEvent, type EntryStep } from "../../lib/entryFlow";

// Session management - isSignedIn, markSignedIn
import { isSignedIn, markSignedIn } from "../../lib/session";
// Storage management - readStorageOption, STORAGE_KEYS, writeStorage
import { readStorageOption, STORAGE_KEYS, writeStorage } from "../../lib/storage";
// UI components - AuthPage, Onboarding, Landing
import { AuthPage, Onboarding } from "../../screens/Auth";
import { Landing } from "../../screens/Marketing";
import { EXPERIENCE_LEVELS, type ExperienceLevel } from "../../types";
// Project creation - useStartProject
import { useStartProject } from "../projects/useStartProject";

/* Controls the full entry flow for '/': landing, auth, and onboarding.
   The screens handle their own UI while this compoenent owns navigation
   and stored user state
*/
export default function EntryFlow() {
  const router = useRouter();
  const startProject = useStartProject();
  const [step, setStep] = useState<EntryStep>("landing"); // step = where the user is
  // A browser that is already signed in goes straight to the dashboard; onboarding is not repeated.
  const [signedIn] = useState(isSignedIn); // whether the user is already signed in
  const [level, setLevelState] = useState<ExperienceLevel>(() => // level = the user's experience level
    readStorageOption(STORAGE_KEYS.level, EXPERIENCE_LEVELS, "Intermediate"), // // Restore the saved experience level, defaulting to Intermediate for a new browser.
  );

  // Skip landing/auth/onboarding when an existing signed-in session opens '/'.
  // using 'replace' instead of 'push' to avoid adding an extra entry in the browser history
  useEffect(() => {
    if (signedIn) router.replace(HOME_ROUTE);
  }, [signedIn, router]);
  // keep the onboarding selection in React state and local storage
  const setLevel = (next: ExperienceLevel) => {
    setLevelState(next);
    writeStorage(STORAGE_KEYS.level, next);
  };
  // send each user action through the shared entry flow logic
  // a transition either moves to another entry screen or completes the flow and redirects
  const go = (event: EntryEvent) => {
    const result = nextEntryStep(step, event);
    if ("redirect" in result) {
      markSignedIn();
      router.push(result.redirect);
      return;
    }
    setStep(result.step);
  };

  // The landing page demo bypasses onboarding and opens a preconfigured learn project
  const demo = () => {
    markSignedIn();
    startProject({ title: "Netflix streaming architecture", mode: "learn", source: "template" });
  };

  // return nothing bc the useEffect above is about to redirect them to the dashboard
  // and we dont want the landing page flashing for a moment
  if (signedIn) return null;

  // basically UI side of our state machine
  // each screen reports actions back through 'go'
  switch (step) {
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
      return <Onboarding level={level} setLevel={setLevel} done={() => go("onboarded")} />;
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
