"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";

import type { ChallengeDifficulty } from "../challenge/challenges";
import { dismissalCookie } from "./challengeDismissal";
import StartChallengeButton from "./StartChallengeButton";

export default function ChallengeAnnouncement({ challengeId, title, announcement, difficulty, initiallyDismissed }: {
  challengeId: string;
  title: string;
  announcement: string;
  difficulty: ChallengeDifficulty;
  initiallyDismissed: boolean;
}) {
  const strip = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    document.cookie = dismissalCookie(challengeId, window.location.protocol === "https:");
    // The focused button is about to disappear, so keep keyboard users in the page.
    strip.current?.nextElementSibling?.querySelector<HTMLElement>("a[href], button")?.focus();
    setDismissed(true);
  };

  return (
    <aside ref={strip} className="ax-challenge-announcement" aria-labelledby="challenge-announcement-title">
      <div className="ax-challenge-announcement-row">
        <p className="ax-challenge-announcement-label">Featured challenge:</p>
        <h2 id="challenge-announcement-title" className="ax-challenge-announcement-title">{announcement}</h2>
        <p className="ax-challenge-announcement-level">
          <span className="sr-only">Difficulty: </span>
          {difficulty}
        </p>
        <div className="ax-challenge-announcement-action">
          <StartChallengeButton title={title} label="Start challenge" />
        </div>
        <button
          type="button"
          className="ax-challenge-announcement-dismiss"
          aria-label="Dismiss featured challenge"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
