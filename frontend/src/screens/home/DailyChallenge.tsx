import { Icon } from "../../components/ui";

export function DailyChallenge({ onClick }: { onClick: () => void }) {
  return (
    <div className="daily-challenge-strip">
      <span className="dc-label">Daily challenge</span>
      <div className="dc-main">
        <strong>Design a rate limiter</strong>
        <span>Token bucket · 1M rules/sec</span>
      </div>
      <span className="dc-level">Beginner · ~20 min</span>
      <button className="dc-try" onClick={onClick}>
        Start <Icon name="arrow" size={13} />
      </button>
    </div>
  );
}
