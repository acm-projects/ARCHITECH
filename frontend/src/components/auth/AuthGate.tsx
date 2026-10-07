// this file is the protection layer for private pages such as Dashboard
// and project workspace
// also handles sign-out from another brower tab, which is what the 'storage' event is for
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { SESSION_CHANGED_EVENT, isSignedIn } from "../../lib/session";

// watch session changes from both this tab and other browser tabs
// the custom event handles same-tab updates; 'storage' handles cross-tab updates
// BACKEND: if auth stops using browser storage, update this subscription
// to react to the backend auth/session provider instead
// so once backend replaces local storage, 'storage' may no longer be correct mechanism
const subscribe = (listener: () => void) => {
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};

// protects auth pages. signed-out users are redirected to '/', and protected content 
// stays hidden until the browser session has been checked
export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  // useSyncExternalStore basically lets react subscribe to state that lives outside of react, in this case the browser session
  const signedIn = useSyncExternalStore<boolean | null>(subscribe, isSignedIn, () => null); // () => null bc during server rendering, session state is unknown

  // once the session is known to sign out, return the user to the public landing page
  useEffect(() => {
    if (signedIn === false) router.replace("/");
  }, [signedIn, router]);
  
  // render nothing while checking or redirecting so protected content never flashes
  return signedIn ? <>{children}</> : null;
}

/* Big picture:
User opens /dashboard or /workspace/[projectId]
                    ↓
                 AuthGate
                    ↓
              isSignedIn()
              ↙           ↘
           true           false
            ↓               ↓
      show content       redirect /
 */