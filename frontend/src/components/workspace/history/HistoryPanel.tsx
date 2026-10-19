"use client";

import { useCallback, useEffect, useState } from "react";

import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { History, RotateCcw, X } from "lucide-react";

import { sanitizeEdges, sanitizeNodes } from "../../projects/projectStore";
import { sharedEvaluationCache } from "../../../lib/architecture/evaluation/liveMetrics";
import { DEFAULT_TRAFFIC } from "../../../lib/architecture/evaluation/traffic";
import { formatLatency, formatMonthlyCost } from "../../../lib/architecture/implementationStats";
import {
  listVersions,
  loadVersionGraph,
  relativeTime,
  saveVersion,
  versionName,
  type VersionItem,
} from "../../../lib/projects/historyClient";
import type { ArchitectureFlowNode } from "../nodes/ArchitectureNode";
import "./history-panel.css";

// Version history, docked beside the canvas like the AI Architect. Versions are recorded by the
// server when the design changes (at most every 10 minutes) and with "Save version". Each shows
// the score, cost and p95 it had (at the default traffic) and how that compares with now.
// Restoring saves the current design as a version first, then loads the old one as one undo step.

export function HistoryToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  if (open) return null;
  return (
    <button type="button" className="ax-ai-toggle" onClick={onToggle} aria-label="Open the version history">
      <History size={15} aria-hidden="true" />
      History
    </button>
  );
}

function Delta({ then, now, higherIsBetter, format }: { then: number; now: number; higherIsBetter: boolean; format: (n: number) => string }) {
  if (Math.abs(then - now) < 1e-9) return null;
  const better = (now > then) === higherIsBetter;
  return (
    <span className="ax-history-delta" data-tone={better ? "better" : "worse"} title="How it compares with your design now">
      {" → "}
      {format(now)}
    </span>
  );
}

export default function HistoryPanel({
  projectId,
  onClose,
  onRestore,
}: {
  projectId: string;
  onClose: () => void;
  // Replaces the design in one undo step.
  onRestore: (next: { nodes: ArchitectureFlowNode[]; edges: Edge[] }) => void;
}) {
  const { getNodes, getEdges } = useReactFlow<ArchitectureFlowNode, Edge>();
  const [versions, setVersions] = useState<VersionItem[] | null | undefined>(undefined);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => setVersions(await listVersions(projectId)), [projectId]);
  useEffect(() => {
    const controller = new AbortController();
    void listVersions(projectId, controller.signal).then((list) => {
      if (!controller.signal.aborted) setVersions(list);
    });
    return () => controller.abort();
  }, [projectId]);

  // The design now, at the same traffic the versions were measured at.
  const current = sharedEvaluationCache.get({ nodes: getNodes(), edges: getEdges() }, DEFAULT_TRAFFIC).summary;

  const save = async () => {
    setBusy(true);
    const version = await saveVersion(projectId, { label: label.trim() || undefined });
    setBusy(false);
    if (!version) return setMessage("Could not save a version. Check your connection and try again.");
    setLabel("");
    setMessage(null);
    await refresh();
  };

  const restore = async (version: VersionItem) => {
    setBusy(true);
    setConfirming(null);
    const saved = await saveVersion(projectId, { kind: "before-restore", label: `Before restoring ${versionName(version).toLowerCase()} (${relativeTime(version.createdAt)})` });
    const graph = saved ? await loadVersionGraph(projectId, version.id) : null;
    setBusy(false);
    if (!graph) return setMessage("Could not restore that version. Nothing was changed.");
    const nodes = sanitizeNodes(graph.nodes);
    onRestore({ nodes, edges: sanitizeEdges(graph.edges, nodes) });
    setMessage("Restored. Undo with Ctrl/Cmd+Z, or restore the “Before restoring” version.");
    await refresh();
  };

  return (
    <aside className="ax-ai-panel" aria-label="Version history">
      <div className="ax-ai-header">
        <p className="ax-ai-title">
          <History size={15} aria-hidden="true" />
          History
        </p>
        <button type="button" className="ax-icon-btn" aria-label="Close the version history" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <form
        className="ax-history-save"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          className="ax-field"
          value={label}
          maxLength={80}
          placeholder="Name this version (optional)"
          aria-label="Version name"
          onChange={(event) => setLabel(event.target.value)}
        />
        <button type="submit" className="ax-ai-send" disabled={busy}>
          Save version
        </button>
      </form>
      {message && <p className="ax-history-message" role="status">{message}</p>}

      <div className="ax-ai-messages">
        {versions === undefined && <p className="ax-ai-thinking">Loading history…</p>}
        {versions === null && <p className="ax-ai-empty">History appears once this project is saved to your account.</p>}
        {versions?.length === 0 && <p className="ax-ai-empty">No versions yet. They are saved automatically as your design changes, or with Save version.</p>}
        <ol className="ax-history-list">
          {versions?.map((version) => (
            <li key={version.id} className="ax-history-item" data-kind={version.kind}>
              <div className="ax-history-row">
                <span className="ax-history-name">{versionName(version)}</span>
                <span className="ax-history-time" title={new Date(version.createdAt).toLocaleString()}>
                  {relativeTime(version.createdAt)}
                </span>
              </div>
              {version.summary.ready ? (
                <p className="ax-history-metrics">
                  Score {version.summary.score}
                  {current.ready && <Delta then={version.summary.score} now={current.score} higherIsBetter format={String} />}
                  {" · "}
                  {formatMonthlyCost(version.summary.monthlyCost)}
                  {current.ready && <Delta then={version.summary.monthlyCost} now={current.monthlyCost} higherIsBetter={false} format={formatMonthlyCost} />}
                  {" · p95 "}
                  {formatLatency(version.summary.p95LatencyMs)}
                </p>
              ) : (
                <p className="ax-history-metrics">{version.summary.components} components · not connected yet</p>
              )}
              {confirming === version.id ? (
                <div className="ax-history-confirm">
                  <span>Your current design is saved first.</span>
                  <button type="button" className="ax-ai-apply" disabled={busy} onClick={() => void restore(version)}>
                    Restore
                  </button>
                  <button type="button" className="ax-ai-starter" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="ax-history-restore" disabled={busy} onClick={() => setConfirming(version.id)}>
                  <RotateCcw size={12} aria-hidden="true" /> Restore
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
