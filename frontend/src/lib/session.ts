import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from "./storage.ts";

// Who is signed in, as far as this browser knows. Accounts are a local profile for now (see
// screens/Auth.tsx); the session is the same marker the app always used, so a browser that was
// already signed in stays signed in. A session exists once someone has signed in or finished
// onboarding, and ends at Sign out.
//
// BACKEND: replace with the auth session. Callers only use these functions.

const SIGNED_IN_MARKERS = ["home", "workspace"];

export const SESSION_CHANGED_EVENT = "architech:session-changed";

const announce = () => {
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
