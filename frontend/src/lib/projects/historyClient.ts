import type { VersionKind, VersionSummary } from "./versions.ts";

// The browser side of /api/projects/[id]/versions.

export type VersionItem = {
  id: string;
  title: string;
  kind: VersionKind;
  label: string | null;
  summary: VersionSummary;
  createdAt: string;
};

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/versions`;

// null when the history cannot be read (not saved to the account yet, offline).
export async function listVersions(projectId: string, signal?: AbortSignal): Promise<VersionItem[] | null> {
  try {
    const response = await fetch(base(projectId), { signal, cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as { versions: VersionItem[] }).versions;
  } catch {
    return null;
  }
}

export async function saveVersion(projectId: string, options: { label?: string; kind?: "manual" | "before-restore" } = {}): Promise<VersionItem | null> {
  try {
    const response = await fetch(base(projectId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { version: VersionItem }).version;
  } catch {
    return null;
  }
}

export async function loadVersionGraph(projectId: string, versionId: string): Promise<{ nodes: unknown[]; edges: unknown[] } | null> {
  try {
    const response = await fetch(`${base(projectId)}/${encodeURIComponent(versionId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { graph?: { nodes?: unknown; edges?: unknown } };
    return Array.isArray(body.graph?.nodes) && Array.isArray(body.graph?.edges) ? { nodes: body.graph.nodes, edges: body.graph.edges } : null;
  } catch {
    return null;
  }
}

export function versionName(version: Pick<VersionItem, "kind" | "label">): string {
  if (version.label) return version.label;
  if (version.kind === "before-restore") return "Before restoring";
  if (version.kind === "other-device") return "Saved on another device";
  if (version.kind === "manual") return "Saved version";
  return "Auto-saved";
}

// "just now", "5 min ago", "3 h ago", "2 days ago", then the date.
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h ago`;
  if (seconds < 7 * 86_400) {
    const days = Math.floor(seconds / 86_400);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
