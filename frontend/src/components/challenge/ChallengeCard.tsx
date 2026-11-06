import { useState } from "react";
import { Target } from "lucide-react";

import type { OfficialResult } from "../../lib/architecture/challenge/challengeClient";
import Panel, {
  PanelAction,
  PanelActions,
  PanelDetail,
  PanelGroup,
  PanelLink,
  PanelRow,
  PanelText,
} from "../workspace/panel/Panel";
import { ChallengeLeaderboard } from "./ChallengeLeaderboard";
import type { Challenge } from "./challenges";
import type {
  Evaluation,
  Finding,
  FindingSeverity,
} from "./cardResult";

type ChallengeCardProps = {
  challenge: Challenge;
  // Null shows the brief; a result shows the scores.
  result: Evaluation | null;
  onRun: () => void;
  onBack: () => void;
  // The design changed after this result, so it describes an earlier submission.
  stale?: boolean;
  // A submission is being judged.
  running?: boolean;
  // The latest submission failed.
  error?: string | null;
  official: OfficialResult | null;
  leaderboardVersion: number;
};

const MAX_FINDINGS = 4;

const SEVERITY_WORD: Record<FindingSeverity, string> = {
  warning: "Warning",
  suggestion: "Suggestion",
  good: "Passed",
};

const SCORE_ROWS: { key: keyof Evaluation; label: string }[] = [
  { key: "scalability", label: "Scalability" },
  { key: "reliability", label: "Reliability" },
  { key: "latency", label: "Latency" },
  { key: "costEfficiency", label: "Cost efficiency" },
];

// Findings arrive most important first (warnings, suggestions, then good observations).
const topFindings = (findings: Finding[]) => findings.slice(0, MAX_FINDINGS);

function rankOf(official: OfficialResult | null): string | undefined {
  if (official?.status === "pending") return "Recording…";
  if (official?.status === "graded" && official.rank !== null) return `#${official.rank} of ${official.participants}`;
  return undefined;
}

// The Challenge panel: the brief, then the result of the latest submission.
export default function ChallengeCard({
  challenge,
  result,
  onRun,
  onBack,
  stale = false,
  running = false,
  error = null,
  official,
  leaderboardVersion,
}: ChallengeCardProps) {
  const [detail, setDetail] = useState<string | null>(null);
  const back = () => setDetail(null);
  const findings = result ? topFindings(result.findings) : [];
  const finding = findings.find(({ title }) => title === detail);

  return (
    <Panel icon={<Target size={17} aria-hidden="true" />} title="Challenge" status={result ? result.overallScore : undefined}>
      <div hidden={detail !== null} aria-live="polite">
        {running && <PanelText>Checking your design…</PanelText>}
        {error && <PanelText role="alert" tone="danger">Submission failed: {error}</PanelText>}
        {result && stale && !running && <PanelText role="status">Your design changed — submit again.</PanelText>}
        {official?.status === "failed" && <PanelText role="alert" tone="danger">{official.message}</PanelText>}

        {result ? (
          <>
            <PanelGroup>
              <PanelLink label="Design score" value={result.overallScore} onClick={() => setDetail("scores")} />
            </PanelGroup>
            <PanelGroup title="Findings">
              {findings.map(({ title, severity }) =>
                severity === "good" ? (
                  <PanelRow key={title} item label={title} value={SEVERITY_WORD[severity]} title={title} />
                ) : (
                  <PanelLink key={title} item label={title} value={SEVERITY_WORD[severity]} title={title} onClick={() => setDetail(title)} />
                ),
              )}
            </PanelGroup>
            <PanelActions>
              <PanelAction onClick={onBack}>Requirements</PanelAction>
              <PanelAction variant="primary" onClick={onRun}>Submit again</PanelAction>
            </PanelActions>
          </>
        ) : (
          <>
            <PanelGroup title={challenge.title}>
              {challenge.summary.map((line) => <PanelRow key={line} item label={line} />)}
            </PanelGroup>
            <PanelGroup title="Requirements">
              {challenge.highlights.map((line) => <PanelRow key={line} item label={line} />)}
            </PanelGroup>
            <PanelActions>
              <PanelAction variant="primary" onClick={onRun}>Submit design</PanelAction>
            </PanelActions>
          </>
        )}
        <PanelGroup>
          <PanelLink label="Leaderboard" value={rankOf(official)} onClick={() => setDetail("leaderboard")} />
        </PanelGroup>
      </div>

      {detail === "leaderboard" && (
        <PanelDetail title="Leaderboard" onBack={back}>
          <ChallengeLeaderboard challengeId={challenge.id} official={official} version={leaderboardVersion} />
        </PanelDetail>
      )}
      {detail === "scores" && result && (
        <PanelDetail title="Design score" onBack={back}>
          <PanelGroup>
            <PanelRow label="Overall" value={result.overallScore} />
            {SCORE_ROWS.map(({ key, label }) => <PanelRow key={key} label={label} value={result[key] as number} />)}
          </PanelGroup>
        </PanelDetail>
      )}
      {finding && (
        <PanelDetail title={finding.title} onBack={back}>
          <PanelGroup>
            <PanelRow label="Severity" value={SEVERITY_WORD[finding.severity]} />
          </PanelGroup>
          <PanelText>{finding.explanation}</PanelText>
        </PanelDetail>
      )}
    </Panel>
  );
}
