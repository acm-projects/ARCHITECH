"use client";

import { useEffect, useState } from "react";

import { fetchLeaderboard, type Leaderboard, type OfficialResult } from "../../lib/architecture/challenge/challengeClient";
import { formatLatency, formatMonthlyCost } from "../../lib/architecture/implementationStats";
import { PanelGroup, PanelRow, PanelText } from "../workspace/panel/Panel";

type Entry = { p95LatencyMs: number; monthlyCost: number; score: number };
const entryValue = (entry: Entry) => `${formatLatency(entry.p95LatencyMs)} · ${formatMonthlyCost(entry.monthlyCost)} · ${entry.score}`;

// The official, server-graded result of the last submission and the leaderboard (each user's
// best score). Refreshes after every submission.
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
    <>
      {official?.status === "pending" && <PanelText role="status">Recording your submission…</PanelText>}
      {official?.status === "graded" && (
        <PanelGroup>
          <PanelRow label="Official score" value={`${official.score}${official.passed ? " · passed" : ""}`} />
          {official.rank !== null && <PanelRow label="Your best" value={`${official.best} · #${official.rank} of ${official.participants}`} />}
        </PanelGroup>
      )}
      {board && board.top.length > 0 ? (
        <PanelGroup title="Score, best first">
          {board.top.map((entry) => (
            <PanelRow key={entry.rank} item label={`${entry.rank}. ${entry.you ? "You" : entry.name}`} value={entryValue(entry)} />
          ))}
          {board.me && board.me.rank > board.top.length && (
            <PanelRow item label={`${board.me.rank}. You`} value={entryValue(board.me)} />
          )}
        </PanelGroup>
      ) : (
        board && <PanelText>No submissions yet. Be the first.</PanelText>
      )}
    </>
  );
}
