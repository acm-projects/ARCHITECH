import { ArchieMark, Button, Icon, IconButton } from "../../components/ui";
import type {
  ArchitectureAnalysis,
  ArchitectureFinding,
} from "./architectureAnalysis";

const SEVERITY_LABELS = {
  high: "HIGH",
  medium: "WATCH",
  low: "NOTE",
} as const;

export function ArchitectureInspector({
  analysis,
  activeFindingId,
  healthScore,
  availability,
  p95Latency,
  monthlyCost,
  onFinding,
  onClose,
  onAskArchie,
}: {
  analysis: ArchitectureAnalysis;
  activeFindingId: string | null;
  healthScore: number;
  availability: number;
  p95Latency: number;
  monthlyCost: number;
  onFinding: (finding: ArchitectureFinding) => void;
  onClose: () => void;
  onAskArchie: () => void;
}) {
  const health = [
    {
      label: "Scalability",
      value: `${healthScore} / 100`,
      tone: "green",
    },
    {
      label: "Reliability",
      value: `${availability.toFixed(2)}%`,
      tone: "green",
    },
    {
      label: "P95 Latency",
      value: `${p95Latency} ms`,
      tone: p95Latency >= 100 ? "orange" : "blue",
    },
    {
      label: "Monthly Cost",
      value: `$${monthlyCost}`,
      tone: "orange",
    },
  ];

  return (
    <aside className="inspector architecture-inspector health-inspector" aria-label="System health and architecture inspection">
      <div className="health-inspector-head">
        <div>
          <span>LIVE SYSTEM</span>
          <h2>System Health</h2>
        </div>
        <IconButton icon="chevron" label="Collapse system health" size="sm" onClick={onClose} />
      </div>

      <div className="health-metric-list" aria-label="System health metrics">
        {health.map((metric) => (
          <div className="health-metric-card" key={metric.label}>
            <span><i className={`health-dot ${metric.tone}`} />{metric.label}</span>
            <b>{metric.value}</b>
          </div>
        ))}
      </div>

      <div className="inspector-section-head">
        <span>INSPECTION</span>
        <small>{analysis.findings.length} flags</small>
      </div>

      <div className="architecture-scan-summary" aria-label="Inspection telemetry">
        <span><small>NODES</small><b>{analysis.connectedNodeCount}</b></span>
        <span><small>EDGES</small><b>{analysis.edgeCount}</b></span>
        <span><small>FLAGS</small><b>{analysis.findings.length}</b></span>
      </div>

      {!analysis.ready ? (
        <div className="architecture-empty">
          <span>WAITING FOR TOPOLOGY</span>
          <b>Connect at least three components.</b>
          <small>{analysis.nodeCount} nodes · {analysis.edgeCount} connections</small>
        </div>
      ) : analysis.findings.length === 0 ? (
        <div className="architecture-empty">
          <span>SCAN COMPLETE</span>
          <b>No structural checks triggered.</b>
          <small>Topology, resilience, connection, and scaling checks are clear.</small>
        </div>
      ) : (
        <div className="architecture-findings" role="list">
          {analysis.findings.map((finding) => (
            <button
              key={finding.id}
              role="listitem"
              className={activeFindingId === finding.id ? "active" : ""}
              onClick={() => onFinding(finding)}
              aria-pressed={activeFindingId === finding.id}
            >
              <span className={"finding-severity severity-" + finding.severity}>
                {SEVERITY_LABELS[finding.severity]}
              </span>
              <span className="finding-main">
                <small>{finding.category}</small>
                <strong>{finding.title}</strong>
                <p>{finding.detail}</p>
                {finding.components.length > 0 && <em>{finding.components.join(" · ")}</em>}
              </span>
              <Icon name="chevron" size={13} />
            </button>
          ))}
        </div>
      )}

      <div className="archie-health-card">
        <div className="archie-health-title">
          <ArchieMark variant="intermediate" size={28} />
          <span><b>Archie</b><small>Architecture assistant</small></span>
        </div>
        <p>I can explain the selected component, trace a bottleneck, or walk through a stress test.</p>
        <Button variant="outline" onClick={onAskArchie}>Ask Archie <Icon name="arrow" size={13} /></Button>
      </div>
    </aside>
  );
}
