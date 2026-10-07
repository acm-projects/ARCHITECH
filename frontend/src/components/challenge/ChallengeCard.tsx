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
};

const MAX_FINDINGS = 4;

const SEVERITY_MARK: Record<FindingSeverity, string> = {
  warning: "!",
  suggestion: "→",
  good: "✓",
};

const SCORE_ROWS: { key: keyof Evaluation; label: string }[] = [
  { key: "scalability", label: "Scalability" },
  { key: "reliability", label: "Reliability" },
  { key: "latency", label: "Latency" },
  { key: "costEfficiency", label: "Cost efficiency" },
];

// Findings arrive most important first (warnings, suggestions, then good observations).
const topFindings = (findings: Finding[]) => findings.slice(0, MAX_FINDINGS);

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <li>
      <div className="flex items-baseline justify-between text-[10px]">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="ax-bar" aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </div>
    </li>
  );
}

// Small floating card over the canvas; the canvas stays fully interactive around it.
export default function ChallengeCard({
  challenge,
  result,
  onRun,
  onBack,
  stale = false,
  running = false,
  error = null,
}: ChallengeCardProps) {
  return (
    <div className="ax-card ax-learn" aria-live="polite">
      <span className="ax-panel-title">Challenge</span>

      {running && <p className="ax-card-label mt-3">Checking your design…</p>}
      {error && (
        <p role="alert" className="ax-card-label mt-3">
          Submission failed: {error}
        </p>
      )}
      {result && stale && !running && (
        <p role="status" className="ax-card-label mt-3">
          Your design changed — submit again.
        </p>
      )}

      {result ? (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="ax-card-title">Design score</span>
            <span className="text-[16px] font-light tabular-nums">
              {result.overallScore}
            </span>
          </div>

          <ul className="mt-3 space-y-2.5">
            {SCORE_ROWS.map(({ key, label }) => (
              <ScoreRow key={key} label={label} value={result[key] as number} />
            ))}
          </ul>

          <ul className="mt-4 space-y-2.5 border-t border-(--ax-line) pt-4">
            {topFindings(result.findings).map((finding) => (
              <li key={finding.title} className="text-[10px]">
                <p>
                  <span
                    className={`ax-mark ax-mark-${finding.severity}`}
                    aria-hidden="true"
                  >
                    {SEVERITY_MARK[finding.severity]}
                  </span>{" "}
                  {finding.title}
                </p>
                {finding.severity !== "good" && (
                  <p className="ax-card-label mt-0.5 pl-4 leading-snug">
                    {finding.explanation}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={onBack} className="ax-more">
              Back to requirements
            </button>
            <button type="button" onClick={onRun} className="ax-card-link mt-0!">
              Submit again →
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="ax-card-title mt-4">{challenge.title}</p>
          <ul className="ax-card-body">
            {challenge.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <p className="ax-card-label mt-4">Requirements</p>
          <ul className="mt-1 space-y-0.5 text-[10px]">
            {challenge.highlights.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>

          <button type="button" onClick={onRun} className="ax-card-link">
            Submit design →
          </button>
        </>
      )}
    </div>
  );
}
