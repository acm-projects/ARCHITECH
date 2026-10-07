"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { nextEntryStep, type EntryEvent, type EntryStep } from "../../lib/entryFlow";
import { HOME_ROUTE } from "../../lib/routes";
import { isSignedIn, markSignedIn } from "../../lib/session";
import { readStorageOption, STORAGE_KEYS, writeStorage } from "../../lib/storage";
import { AuthPage, Onboarding } from "../../screens/Auth";
import { Landing } from "../../screens/Marketing";
import type { ExperienceLevel } from "../../types";
import { useStartProject } from "../projects/useStartProject";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

// `/`: the landing page and, from it, sign in, sign up and onboarding. Client-only, as the
// original app was, because it starts from what this browser has stored.
export default function EntryFlow() {
  const router = useRouter();
  const startProject = useStartProject();
  const [step, setStep] = useState<EntryStep>("landing");
  // A browser that is already signed in goes straight to the dashboard; onboarding is not repeated.
  const [signedIn] = useState(isSignedIn);
  const [level, setLevelState] = useState<ExperienceLevel>(() =>
    readStorageOption(STORAGE_KEYS.level, LEVELS, "Intermediate"),
  );

  useEffect(() => {
    if (signedIn) router.replace(HOME_ROUTE);
  }, [signedIn, router]);

  const setLevel = (next: ExperienceLevel) => {
    setLevelState(next);
    writeStorage(STORAGE_KEYS.level, next);
  };

  const go = (event: EntryEvent) => {
    const result = nextEntryStep(step, event);
    if ("redirect" in result) {
      markSignedIn();
      router.push(result.redirect);
      return;
    }
    setStep(result.step);
  };

  // The landing page demo opens a project straight away, as it always did.
  const demo = () => {
    markSignedIn();
    startProject({ title: "Netflix streaming architecture", mode: "learn", source: "template" });
  };

  if (signedIn) return null;

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
