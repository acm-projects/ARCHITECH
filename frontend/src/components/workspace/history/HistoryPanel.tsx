"use client";

import { useCallback, useEffect, useState } from "react";

import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { History } from "lucide-react";

import Panel, { PanelAction, PanelActions, PanelDelta, PanelDetail, PanelGroup, PanelLink, PanelRow, PanelText } from "../panel/Panel";
import { sanitizeEdges, sanitizeNodes } from "../../projects/projectStore";
import { sharedEvaluationCache } from "../../../lib/architecture/evaluation/liveMetrics";
import { DEFAULT_TRAFFIC } from "../../../lib/architecture/evaluation/traffic";
import { formatLatency, formatMonthlyCost } from "../../../lib/architecture/implementationStats";
import { spreadOverlappingNodes } from "../../../lib/architecture/nodeLayout";
import {
  listVersions,
  loadVersionGraph,
  relativeTime,
  saveVersion,
  versionName,
  type VersionItem,
} from "../../../lib/projects/historyClient";
import type { ArchitectureFlowNode } from "../nodes/ArchitectureNode";

// Version history, docked beside the canvas like the AI Architect. Versions are recorded by the
// server when the design changes (at most every 10 minutes) and with "Save version". Each shows
// the score, cost and p95 it had (at the default traffic) and how that compares with now, one
// version at a time.
// Restoring saves the current design as a version first, then loads the old one as one undo step.

export function HistoryToggle({ open, onToggle, popoverTarget }: { open: boolean; onToggle: () => void; popoverTarget?: string }) {
  if (open) return null;
  return (
    <button type="button" className="ax-ai-toggle" onClick={onToggle} popoverTarget={popoverTarget} popoverTargetAction="hide" aria-label="Open the version history">
      <History size={15} aria-hidden="true" />
      History
    </button>
  );
}

// The latest versions, and the rest behind a row.
const SHORT_LIST = 6;

function Compared({ then, now, higherIsBetter, format }: { then: number; now: number | null; higherIsBetter: boolean; format: (n: number) => string }) {
  if (now === null || Math.abs(then - now) < 1e-9) return <>{format(then)}</>;
  const better = (now > then) === higherIsBetter;
  return <>{format(then)}<PanelDelta better={better} title="How it compares with your design now"> → {format(now)}</PanelDelta></>;
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
  const [confirming, setConfirming] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
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
    setConfirming(false);
    const saved = await saveVersion(projectId, { kind: "before-restore", label: `Before restoring ${versionName(version).toLowerCase()} (${relativeTime(version.createdAt)})` });
    const graph = saved ? await loadVersionGraph(projectId, version.id) : null;
    setBusy(false);
    if (!graph) return setMessage("Could not restore that version. Nothing was changed.");
    const nodes = spreadOverlappingNodes(sanitizeNodes(graph.nodes));
    onRestore({ nodes, edges: sanitizeEdges(graph.edges, nodes) });
    setOpenId(null);
    setMessage("Restored. Undo with Ctrl/Cmd+Z, or restore the “Before restoring” version.");
    await refresh();
  };

  const back = () => {
    setOpenId(null);
    setConfirming(false);
  };
  const opened = versions?.find((version) => version.id === openId);
  const shown = showAll ? versions : versions?.slice(0, SHORT_LIST);
  return (
    <Panel label="Version history" icon={<History size={17} aria-hidden="true" />} title="History" closeLabel="Close the version history" onClose={onClose}>
      <div hidden={Boolean(opened)}>
        <form
          className="axp-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            className="axp-input axp-input-box"
            value={label}
            maxLength={80}
            placeholder="Name this version"
            aria-label="Version name"
            onChange={(event) => setLabel(event.target.value)}
          />
          <PanelAction type="submit" variant="primary" disabled={busy}>Save</PanelAction>
        </form>
        {message && <PanelText role="status">{message}</PanelText>}
        <PanelGroup>
          {versions === undefined && <PanelText>Loading history…</PanelText>}
          {versions === null && <PanelText>History appears once this project is saved to your account.</PanelText>}
          {versions?.length === 0 && <PanelText>No versions yet. They are saved automatically as your design changes.</PanelText>}
          {shown?.map((version) => (
            <PanelLink
              key={version.id}
              item
              label={versionName(version)}
              value={relativeTime(version.createdAt)}
              title={new Date(version.createdAt).toLocaleString()}
              onClick={() => setOpenId(version.id)}
            />
          ))}
          {versions && versions.length > SHORT_LIST && (
            <PanelLink label={showAll ? "Show fewer" : `Show all ${versions.length}`} onClick={() => setShowAll((value) => !value)} />
          )}
        </PanelGroup>
      </div>

      {opened && (
        <PanelDetail key={opened.id} title={versionName(opened)} onBack={back}>
          <PanelGroup>
            <PanelRow label="Saved" value={relativeTime(opened.createdAt)} title={new Date(opened.createdAt).toLocaleString()} />
            {opened.summary.ready ? (
              <>
                <PanelRow label="Score" value={<Compared then={opened.summary.score} now={current.ready ? current.score : null} higherIsBetter format={String} />} />
                <PanelRow label="Monthly cost" value={<Compared then={opened.summary.monthlyCost} now={current.ready ? current.monthlyCost : null} higherIsBetter={false} format={formatMonthlyCost} />} />
                <PanelRow label="p95 latency" value={formatLatency(opened.summary.p95LatencyMs)} />
              </>
            ) : (
              <PanelRow label="Components" value={`${opened.summary.components} · not connected yet`} />
            )}
          </PanelGroup>
          {confirming ? (
            <>
              <PanelText>Your current design is saved first.</PanelText>
              <PanelActions>
                <PanelAction onClick={() => setConfirming(false)}>Cancel</PanelAction>
                <PanelAction variant="primary" disabled={busy} onClick={() => void restore(opened)}>Restore</PanelAction>
              </PanelActions>
            </>
          ) : (
            <PanelActions>
              <PanelAction disabled={busy} onClick={() => setConfirming(true)}>Restore this version</PanelAction>
            </PanelActions>
          )}
        </PanelDetail>
      )}
    </Panel>
  );
}
