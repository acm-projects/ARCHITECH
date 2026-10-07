"use client";

import dynamic from "next/dynamic";

// The landing and sign-in screens read browser storage and animate on first paint, so they
// render in the browser only.
const EntryFlow = dynamic(() => import("./EntryFlow"), { ssr: false });

export default function EntryFlowLoader() {
  return <EntryFlow />;
}
