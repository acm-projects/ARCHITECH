"use client";

import { ArrowRight, Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createChallengeIntroState } from "./challengeIntro";

export default function ChallengeIntroduction({ enabled, projectId, challengeId, title }: {
  enabled: boolean;
  projectId: string;
  challengeId: string;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const [intro] = useState(() => createChallengeIntroState(() => window.localStorage));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !intro.shouldShow(enabled ? "challenge" : "learn", projectId, challengeId)) return;
    previousFocus.current = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus.current instanceof HTMLElement && previousFocus.current.isConnected) previousFocus.current.focus();
    };
  }, [enabled, projectId, challengeId, intro]);

  const start = () => {
    intro.acknowledge(projectId, challengeId);
    dialogRef.current?.close();
    if (previousFocus.current instanceof HTMLElement && previousFocus.current.isConnected) previousFocus.current.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      className="ax-new-project-dialog ax-challenge-intro"
      aria-labelledby="challenge-intro-title"
      onKeyDown={event => event.stopPropagation()}
      onCancel={event => { event.preventDefault(); start(); }}
    >
      <div className="ax-challenge-intro-heading">
        <span className="ax-challenge-intro-symbol" aria-hidden="true"><Flag size={20} /></span>
        <h2 id="challenge-intro-title" className="ax-challenge-intro-label">Challenge mode</h2>
      </div>
      <p className="ax-challenge-intro-name">{title}</p>
      <ul>
        <li>Review the requirements in the challenge panel.</li>
        <li>Use Submit design to evaluate your architecture against the targets.</li>
        <li>Adjust your design and submit again to compare results.</li>
      </ul>
      <button type="button" className="ax-challenge-intro-start" onClick={start}>
        Start the challenge <ArrowRight size={15} aria-hidden="true" />
      </button>
    </dialog>
  );
}
