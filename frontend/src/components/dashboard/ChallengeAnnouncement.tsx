import type { ChallengeDifficulty } from "../challenge/challenges";
import StartChallengeButton from "./StartChallengeButton";

// The daily challenge, pinned above the dashboard. It cannot be dismissed: there is always one.
export default function ChallengeAnnouncement({ title, announcement, difficulty }: {
  title: string;
  announcement: string;
  difficulty: ChallengeDifficulty;
}) {
  return (
    <aside className="ax-challenge-announcement" aria-labelledby="challenge-announcement-title">
      <div className="ax-challenge-announcement-row">
        <p className="ax-challenge-announcement-label">Daily challenge:</p>
        <h2 id="challenge-announcement-title" className="ax-challenge-announcement-title">{announcement}</h2>
        <p className="ax-challenge-announcement-level">
          <span className="sr-only">Difficulty: </span>
          {difficulty}
        </p>
        <div className="ax-challenge-announcement-action">
          <StartChallengeButton title={title} label="Start challenge" />
        </div>
      </div>
    </aside>
  );
}
