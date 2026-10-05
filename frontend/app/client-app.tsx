"use client";

import dynamic from "next/dynamic";
import { StrictMode } from "react";

import { ErrorBoundary } from "../src/components/ErrorBoundary";

// App state is restored from localStorage and the URL hash on first render,
// so the app stays client-only until screens move to App Router routes.
const App = dynamic(() => import("../src/App"), { ssr: false });

export function ClientApp() {
  return (
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
