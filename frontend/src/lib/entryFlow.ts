import { HOME_ROUTE } from "./routes.ts";

// The screens a signed-out visitor moves through at `/`, and what moves them. The screens
// themselves are screens/Marketing.tsx (landing) and screens/Auth.tsx (sign in, sign up,
// onboarding); this only decides the order, so the flow is testable without a browser.
//
//   landing -> sign in ------------------------------> dashboard
//   landing -> sign up -> onboarding (finish or skip) -> dashboard
//   sign in <-> sign up
export type EntryStep = "landing" | "signin" | "signup" | "onboarding";

export type EntryEvent = "sign-in" | "sign-up" | "back" | "switch" | "authenticated" | "onboarded";

export type EntryResult = { step: EntryStep } | { redirect: typeof HOME_ROUTE };

export function nextEntryStep(step: EntryStep, event: EntryEvent): EntryResult {
  switch (step) {
    case "landing":
      if (event === "sign-in") return { step: "signin" };
      if (event === "sign-up") return { step: "signup" };
      break;
    case "signin":
      if (event === "back") return { step: "landing" };
      if (event === "switch") return { step: "signup" };
      if (event === "authenticated") return { redirect: HOME_ROUTE };
      break;
    case "signup":
      if (event === "back") return { step: "landing" };
      if (event === "switch") return { step: "signin" };
      // A new account answers the onboarding questions before reaching the dashboard.
      if (event === "authenticated") return { step: "onboarding" };
      break;
    case "onboarding":
      if (event === "onboarded") return { redirect: HOME_ROUTE };
      break;
  }
  return { step };
}
