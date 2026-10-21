// Decides what has to move between the browser and the server. Pure: no storage, no network,
// so every case can be unit tested (tests/projectSync.test.ts).
//
// `synced` remembers, per project id, a fingerprint of the version both sides last agreed
// on. Comparing against it tells "changed here" apart from "changed elsewhere", and "never
// uploaded" apart from "deleted on another device".

import type { ProjectPayload } from "./projectPayload.ts";

export type SyncedFingerprints = Record<string, string>;

// JSON with object keys sorted, so the same project always gives the same text. (Postgres
// jsonb does not keep key order, so the server's copy comes back with keys reordered.)
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const fingerprint = (project: ProjectPayload): string => canonicalJson(project);

const editedAt = (project: ProjectPayload) => Date.parse(project.updatedAt);

export type InitialMerge = {
  // What this browser should hold after the merge.
  projects: ProjectPayload[];
  // Local projects the server does not have yet (or has an older version of).
  upload: ProjectPayload[];
  // Projects deleted in this browser that still have to be deleted on the server.
  remove: string[];
  // Fingerprints after the merge, for versions both sides already agree on.
  synced: SyncedFingerprints;
};

// Run once per sign-in: combine this browser's projects with the server's.
export function planInitialMerge(
  local: readonly ProjectPayload[],
  server: readonly ProjectPayload[],
  synced: SyncedFingerprints,
): InitialMerge {
  const localById = new Map(local.map((project) => [project.id, project]));
  const serverById = new Map(server.map((project) => [project.id, project]));
  const result: InitialMerge = { projects: [], upload: [], remove: [], synced: {} };

  for (const [id, serverProject] of serverById) {
    const localProject = localById.get(id);
    if (!localProject) {
      // Synced before but gone here: deleted in this browser, delete it on the server too.
      if (Object.hasOwn(synced, id)) result.remove.push(id);
      else {
        result.projects.push(serverProject);
        result.synced[id] = fingerprint(serverProject);
      }
      continue;
    }

    const localPrint = fingerprint(localProject);
    const serverPrint = fingerprint(serverProject);
    const changedHere = localPrint !== synced[id];
    if (localPrint === serverPrint) {
      result.projects.push(serverProject);
      result.synced[id] = serverPrint;
    } else if (changedHere && editedAt(localProject) >= editedAt(serverProject)) {
      // Edited here since the last sync, and at least as recently as the server's copy.
      result.projects.push(localProject);
      result.upload.push(localProject);
    } else {
      result.projects.push(serverProject);
      result.synced[id] = serverPrint;
    }
  }

  for (const [id, localProject] of localById) {
    if (serverById.has(id)) continue;
    // Synced before but no longer on the server: deleted on another device.
    if (Object.hasOwn(synced, id)) continue;
    // Never uploaded (made offline, or before projects were saved to the server).
    result.projects.push(localProject);
    result.upload.push(localProject);
  }

  return result;
}

export type PendingChanges = { upload: ProjectPayload[]; remove: string[] };

// After the initial merge: what changed in this browser since the last successful sync.
export function planPendingChanges(
  local: readonly ProjectPayload[],
  synced: SyncedFingerprints,
): PendingChanges {
  const localIds = new Set(local.map((project) => project.id));
  return {
    upload: local.filter((project) => fingerprint(project) !== synced[project.id]),
    remove: Object.keys(synced).filter((id) => !localIds.has(id)),
  };
}

// ---- Conflicts (another tab or device saved the same project first) ----

// Whether two copies have the same title and diagram (timestamps and order of keys aside).
// Usually true: two tabs of the same browser share one project store, so a "conflict" between
// them is only an outdated revision, not different work.
export function sameDesign(a: ProjectPayload, b: ProjectPayload): boolean {
  return canonicalJson({ title: a.title, graph: a.graph }) === canonicalJson({ title: b.title, graph: b.graph });
}
