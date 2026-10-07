"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { SESSION_CHANGED_EVENT, isSignedIn } from "../../lib/session";

const subscribe = (listener: () => void) => {
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};

// Only a signed-in visitor sees what is inside. Anyone else (never signed in, or signed out in
// this or another tab) is sent to the landing page. Nothing renders until the browser has
// been asked, so a protected page never flashes.
export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const signedIn = useSyncExternalStore<boolean | null>(subscribe, isSignedIn, () => null);

  useEffect(() => {
    if (signedIn === false) router.replace("/");
  }, [signedIn, router]);

  return signedIn ? <>{children}</> : null;
}
