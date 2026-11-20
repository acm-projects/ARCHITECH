"use client";

import { useEffect, useRef, useState } from "react";

import { DEMO_PROJECT, takePendingDemo } from "../../lib/demoProject";
import { useStartProject } from "../projects/useStartProject";

// Opens the landing page's demo once its visitor has an account and reaches the dashboard.
export default function PendingDemo() {
  const startProject = useStartProject();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current || !takePendingDemo()) return;
    started.current = true;
    const result = startProject(DEMO_PROJECT);
    // Reported after this effect, so the dashboard renders once more with the reason.
    if (result && !result.ok) queueMicrotask(() => setError(result.message));
  }, [startProject]);
  return error ? <p role="alert" className="px-6 text-sm text-red-700">Could not open the demo: {error}</p> : null;
}
