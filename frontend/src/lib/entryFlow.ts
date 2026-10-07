// this file is basically the state machine for auth and onboarding navigation, contains no ui
import { HOME_ROUTE } from "./routes.ts";

/* Defines the navigation rules for the signed-out entry flow.
   UI lives in Marketing.tsx and Auth.tsx; this file only decides which step
   comes next, keeping the flow independent from React and easy to test
   
   landing -> sign in -> dashboard
   landing -> sign up -> onboarding -> dashboard
   sign in <-> sign up
*/
export type EntryStep = "landing" | "signin" | "signup" | "onboarding"; // where the user is
export type EntryEvent = "sign-in" | "sign-up" | "back" | "switch" | "authenticated" | "onboarded"; // what the user did
// a transition either stays inside the entry flow or finishes it with a dashboard redirect
export type EntryResult = { step: EntryStep } | { redirect: typeof HOME_ROUTE };

// Pure transition function: given the current screen and user action,
// return the next screen without performing navigation or changing browser state
// its like Given x state and y action, what should happen next?
export function nextEntryStep(step: EntryStep, event: EntryEvent): EntryResult {
  switch (step) {
    case "landing":
      if (event === "sign-in") return { step: "signin" };
      if (event === "sign-up") return { step: "signup" };
      break;
    case "signin":
      if (event === "back") return { step: "landing" };
      if (event === "switch") return { step: "signup" };
      // this is just for frontend now, eventually the backend auth should determine whether auth actually succeeded
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
  // this means an event that does not make sense for the current state simply
  // leaves the flow unchanged.
  // basically ignore events that are not valid for the current step 
  return { step };
}
