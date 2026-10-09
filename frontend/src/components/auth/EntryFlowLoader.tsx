// this tells Next.js that this is client component
"use client";

/* EntryFlow depends on brower-only state such as local storage and
   first-load animations.
   Disable server rendering here so the landing/auth flow only initializes
   in the browser only.
 */
import dynamic from "next/dynamic";

const EntryFlow = dynamic(() => import("./EntryFlow"), { ssr: false });
// wrapper that renders the dynamically loaded component
export default function EntryFlowLoader() {
  return <EntryFlow />;
}

/* Relationship:
app/page.tsx
      ↓
EntryFlowLoader.tsx
      ↓
   EntryFlow.tsx
      ↓
Landing / Sign In / Sign Up / Onboarding
*/