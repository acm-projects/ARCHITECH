import { evaluateArchitecture } from "../architecture/evaluation/evaluate.ts";
import { fingerprintEvaluationInput } from "../architecture/evaluation/fingerprint.ts";
import type { GraphDocument } from "./projectPayload.ts";

// Project version history. A version is a snapshot of a project's title and diagram with the
// engine's headline numbers at that moment (at the default traffic), so the history can say
// "score 62 then, 78 now".
//
// Automatic versions are taken when a save changes the design in a way that changes its
// evaluation (renaming or moving components does not), at most once per AUTO_INTERVAL_MS.
// Manual versions ("Save version", "Before restoring …", and "Saved on another device" when a
// save from another tab or device is about to be overwritten) are always taken.
// A project keeps at most MAX_VERSIONS; the oldest automatic ones are removed first.

export const AUTO_INTERVAL_MS = 10 * 60_000;
export const MAX_VERSIONS = 50;
export const MAX_LABEL_LENGTH = 80;

export type VersionKind = "auto" | "manual" | "before-restore" | "other-device";

export type VersionSummary = {
  ready: boolean;
  score: number;
  p95LatencyMs: number;
  monthlyCost: number;
  capacityRps: number | null;
  uptimePercent: number;
  components: number;
};

export function summarizeGraph(graph: GraphDocument): { fingerprint: string; summary: VersionSummary } {
  const evaluation = evaluateArchitecture({ graph: graph as never });
  return {
    fingerprint: fingerprintEvaluationInput({ graph }),
    summary: {
      ready: evaluation.ready,
      score: evaluation.overallScore,
      p95LatencyMs: Math.round(evaluation.metrics.p95LatencyMs * 10) / 10,
      monthlyCost: Math.round(evaluation.metrics.estimatedMonthlyCost),
      capacityRps: evaluation.metrics.capacityRps === null ? null : Math.round(evaluation.metrics.capacityRps),
      uptimePercent: evaluation.metrics.uptimeAvailability,
      components: graph.nodes.length,
    },
  };
}

// Whether a save should record an automatic version, given the latest version (if any).
export function shouldSnapshot(
  latest: { fingerprint: string; createdAt: Date } | null,
  fingerprint: string,
  now: Date,
): boolean {
  if (!latest) return true;
  if (latest.fingerprint === fingerprint) return false;
  return now.getTime() - latest.createdAt.getTime() >= AUTO_INTERVAL_MS;
}

// Which versions to delete so at most `max` remain: oldest automatic first, then oldest of any kind.
export function versionsToPrune(versions: readonly { id: string; kind: string; createdAt: Date }[], max = MAX_VERSIONS): string[] {
  const excess = versions.length - max;
  if (excess <= 0) return [];
  const byAge = [...versions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const auto = byAge.filter((version) => version.kind === "auto");
  const rest = byAge.filter((version) => version.kind !== "auto");
  return [...auto, ...rest].slice(0, excess).map((version) => version.id);
}

export function validateLabel(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "label must be text." };
  const label = raw.trim();
  if (label.length > MAX_LABEL_LENGTH) return { ok: false, error: `label can be at most ${MAX_LABEL_LENGTH} characters.` };
  return { ok: true, value: label || null };
}
