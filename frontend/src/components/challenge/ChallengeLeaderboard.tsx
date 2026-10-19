"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

import { fetchLeaderboard, type Leaderboard, type OfficialResult } from "../../lib/architecture/challenge/challengeClient";
import { formatLatency, formatMonthlyCost } from "../../lib/architecture/implementationStats";
import "./challenge-leaderboard.css";

// Under the challenge card: the official, server-graded result of the last submission and the
// leaderboard (each user's best score). Refreshes after every submission.
export function ChallengeLeaderboard({ challengeId, official, version }: { challengeId: string; official: OfficialResult | null; version: number }) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchLeaderboard(challengeId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setBoard(value);
    });
    return () => controller.abort();
  }, [challengeId, version]);

  return (
    <section className="ax-card ax-leaderboard" aria-label="Leaderboard">
      <p className="ax-card-label ax-leaderboard-title">
        <Trophy size={13} aria-hidden="true" /> Leaderboard
      </p>
      {official?.status === "pending" && <p className="ax-leaderboard-official">Recording your submission…</p>}
      {official?.status === "graded" && (
        <p className="ax-leaderboard-official">
          Official score <strong>{official.score}</strong>
          {official.passed ? " · passed" : ""}
          {official.rank !== null && (
            <>
              {" "}
              · your best {official.best}, #{official.rank} of {official.participants}
            </>
          )}
        </p>
      )}
      {official?.status === "failed" && <p className="ax-leaderboard-official" role="alert">{official.message}</p>}
      {board && board.top.length > 0 ? (
        <ol className="ax-leaderboard-list">
          {board.top.map((entry) => (
            <li key={entry.rank} data-you={entry.you || undefined}>
              <span className="ax-leaderboard-rank">{entry.rank}</span>
              <span className="ax-leaderboard-name">{entry.you ? "You" : entry.name}</span>
              <span className="ax-leaderboard-meta">
                {formatLatency(entry.p95LatencyMs)} · {formatMonthlyCost(entry.monthlyCost)}
              </span>
              <span className="ax-leaderboard-score" data-passed={entry.passed || undefined}>{entry.score}</span>
            </li>
          ))}
          {board.me && board.me.rank > board.top.length && (
            <li data-you>
              <span className="ax-leaderboard-rank">{board.me.rank}</span>
              <span className="ax-leaderboard-name">You</span>
              <span className="ax-leaderboard-meta">
                {formatLatency(board.me.p95LatencyMs)} · {formatMonthlyCost(board.me.monthlyCost)}
              </span>
              <span className="ax-leaderboard-score">{board.me.score}</span>
            </li>
          )}
        </ol>
      ) : (
        board && <p className="ax-leaderboard-official">No submissions yet. Be the first.</p>
      )}
    </section>
  );
}
