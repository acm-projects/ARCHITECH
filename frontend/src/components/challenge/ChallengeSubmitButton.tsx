"use client";

import { LoaderCircle, Send } from "lucide-react";

// Challenge keeps Run's place in the top bar: the same button, but it submits the design for
// grading, exactly as Submit in the Challenge panel does.
export default function ChallengeSubmitButton({ onSubmit, running, submitted }: {
  onSubmit: () => void;
  running: boolean;
  // A result is showing, so the next press is a resubmission.
  submitted: boolean;
}) {
  return (
    <button
      type="button"
      className="ax-run-button"
      aria-busy={running}
      disabled={running}
      title={running ? "Checking your design…" : submitted ? "Submit the design again" : "Submit the design for grading"}
      onClick={onSubmit}
    >
      {running ? <LoaderCircle size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
      Submit
    </button>
  );
}
