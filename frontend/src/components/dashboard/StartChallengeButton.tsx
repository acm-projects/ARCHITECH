"use client";
// Starts the daily challenge as a project in Challenge mode.
import { useState } from "react";
import { useStartProject } from "../projects/useStartProject";
export default function StartChallengeButton({ title, label = "Start" }: {
  title: string;
  label?: string;
}) {
  const start = useStartProject();
  const [error, setError] = useState<string | null>(null);
  return (<div className="flex flex-col items-start gap-2">
    <button
      type="button"
      onClick={() => {
        const result = start({ mode: "challenge", title });
        if (result)
          setError(result.ok ? null : result.message);
      }}
      className="ax-dashboard-challenge-start group flex h-12 items-center justify-center rounded-[9px] bg-[#155DFC] px-8 text-sm text-white transition-colors duration-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 motion-reduce:transition-none"
    >
      <span className="flex items-center gap-1.5">
        {label}
        <span
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
        >
          →
        </span>
      </span>
    </button>
    {error && (<p role="alert" className="text-xs text-red-700">
      {error}
    </p>)}
  </div>);
}
