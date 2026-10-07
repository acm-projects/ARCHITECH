import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from "./storage.ts";

// Temp browser-based session system. A user is considered signed in after 
// successful sign in/onboarding and remains signed in until sign out.
//
// BACKEND: Replace the local storage marker with the real auth session
// keep session checks and sign-out behavior behind this module so UI compoenents
// don't need to know how auth is implemented

// this appear to exist for compatibility with previous session handling
const SIGNED_IN_MARKERS = ["home", "workspace"];

// lets auth-aware components react immediately when sign-in status changes in this tab
export const SESSION_CHANGED_EVENT = "architech:session-changed";

// notify client-side listeners after sign-in or sign-out changes the session
const announce = () => {
  // typeof window guard prevents brower apis from being used when window isn't available
  if (typeof window !== "undefined") window.dispatchEvent?.(new Event(SESSION_CHANGED_EVENT));
};

export const isSignedIn = (): boolean => SIGNED_IN_MARKERS.includes(readStorage(STORAGE_KEYS.lastPage));

// Called when sign in succeeds, and when onboarding is finished or skipped.
export function markSignedIn(): void {
  writeStorage(STORAGE_KEYS.lastPage, "home");
  announce();
}

export function signOut(): void {
  removeStorage(STORAGE_KEYS.lastPage);
  announce();
}

/* Big Picture: this is a temp frontend session system
Sign in / Finish onboarding
          ↓
     markSignedIn()
          ↓
 browser session marker
          ↓
     isSignedIn()
          ↓
       AuthGate

Sign Out
   ↓
signOut()
   ↓
remove marker
 */