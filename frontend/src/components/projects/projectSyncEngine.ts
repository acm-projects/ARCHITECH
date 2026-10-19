// Keeps the browser's projects and the server's /api/projects in step for the signed-in user.
//
// The canvas keeps working exactly as before against the local project store (instant, and
// still usable offline). This runs next to it:
//   1. On sign-in: download the user's projects and merge them with this browser's copy
//      (src/lib/projects/syncPlan.ts decides what wins), then upload anything only here.
//   2. After that: every change the store makes is uploaded (or deleted) in the background.
//      Failed requests are retried, so a dropped connection only delays saving.
//   3. Each save says which server revision it was based on (If-Match). If another device
//      saved the project since, the server refuses (409) and sends its copy: that copy is kept
//      as a new project "… (from another device)", and this browser's version is saved over
//      the original. Nothing is lost, and the open canvas is not touched.

import {
  MAX_TITLE_LENGTH,
  PROJECTS_CHANGED_EVENT,
  STORAGE_KEY,
  parseProject,
  projectStore,
  type Project,
} from "./projectStore.ts";
import {
  payloadToStoredProject,
  projectToPayload,
  type ProjectPayload,
} from "../../lib/projects/projectPayload.ts";
import {
  conflictCopy,
  fingerprint,
  planInitialMerge,
  planPendingChanges,
  type SyncedFingerprints,
} from "../../lib/projects/syncPlan.ts";

const SYNC_STATE_KEY = "architech:projects:sync";
// Same envelope projectStore writes.
const STORAGE_VERSION = 1;
const DEBOUNCE_MS = 400;
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];

// revisions: the server revision (ETag) each project was last synced at, for If-Match.
type SyncState = { owner: string; synced: SyncedFingerprints; revisions?: Record<string, string> };

function readSyncState(storage: Storage): SyncState | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SYNC_STATE_KEY) ?? "null");
    if (
      parsed && typeof parsed === "object" &&
      typeof (parsed as SyncState).owner === "string" &&
      typeof (parsed as SyncState).synced === "object" && (parsed as SyncState).synced !== null
    ) {
      return parsed as SyncState;
    }
  } catch {
    // Unreadable state is treated as "never synced".
  }
  return null;
}

function writeSyncState(storage: Storage, state: SyncState) {
  try {
    storage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save project sync state", error);
  }
}

// Replace this browser's projects with `projects`, keeping any stored entries that fail
// validation (the store never destroys those either), then tell open views to refresh.
function replaceLocalProjects(storage: Storage, projects: readonly ProjectPayload[]) {
  let rejected: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    const entries = parsed && typeof parsed === "object" ? (parsed as { projects?: unknown }).projects : null;
    if (Array.isArray(entries)) rejected = entries.filter((entry) => parseProject(entry) === null);
  } catch {
    // The store backs up unreadable text itself; nothing worth keeping here.
  }
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      projects: [...projects.map(payloadToStoredProject), ...rejected],
    }),
  );
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}

const localPayloads = (): ProjectPayload[] =>
  projectStore.listProjects().map((project: Project) => projectToPayload(project));

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return response;
}

class SyncError extends Error {
  constructor(message: string, readonly retry: boolean) {
    super(message);
  }
}

class ConflictError extends Error {
  constructor(readonly server: ProjectPayload, readonly revision: string) {
    super(`"${server.title}" was changed on another device.`);
  }
}

const revisionFrom = (response: Response): string | null => response.headers.get("etag")?.replace(/^W\//, "").replace(/"/g, "") || null;

// Returns the new server revision.
async function upload(project: ProjectPayload, revision: string | undefined): Promise<string | null> {
  const response = await request(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    body: JSON.stringify(project),
    headers: revision ? { "If-Match": `"${revision}"` } : {},
  });
  if (response.ok) return revisionFrom(response);
  const body = await response.json().catch(() => ({}));
  if (response.status === 409 && body.project && typeof body.revision === "string") {
    throw new ConflictError(body.project as ProjectPayload, body.revision);
  }
  const message = `Saving "${project.title}" failed (${response.status}): ${body.error ?? "unknown error"}`;
  // 400 means the data itself was refused, so retrying the same data cannot help.
  throw new SyncError(message, response.status !== 400);
}

async function remove(id: string): Promise<void> {
  const response = await request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  // Already gone counts as deleted.
  if (response.ok || response.status === 404) return;
  throw new SyncError(`Deleting project ${id} failed (${response.status}).`, true);
}

// Starts syncing for `userId`. Returns a function that stops it (sign-out, user change).
export function startProjectSync(userId: string): () => void {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return () => {};
  }

  let stopped = false;
  let ready = false;
  let running = false;
  let again = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  // Data the server refused, by id -> fingerprint; not retried until the project changes.
  const refused = new Map<string, string>();

  const previous = readSyncState(storage);
  // Another account used this browser before: its projects stay with that account.
  if (previous && previous.owner !== userId) replaceLocalProjects(storage, []);
  const state: SyncState = {
    owner: userId,
    synced: previous && previous.owner === userId ? previous.synced : {},
    revisions: previous && previous.owner === userId ? (previous.revisions ?? {}) : {},
  };
  const revisions = () => (state.revisions ??= {});

  // Keep the other device's version as its own project, then save ours over the original.
  function resolveConflict(conflict: ConflictError) {
    const copy = conflictCopy(conflict.server, crypto.randomUUID(), MAX_TITLE_LENGTH);
    revisions()[conflict.server.id] = conflict.revision;
    replaceLocalProjects(storage, [...localPayloads(), copy]);
    again = true;
  }

  function scheduleRetry() {
    clearTimeout(retry);
    const delay = RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)];
    retry = setTimeout(() => void flush(), delay);
  }

  // Upload or delete whatever changed since the last successful sync, one request at a time.
  async function flush() {
    if (stopped || !ready) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    let failed = false;
    try {
      const { upload: toUpload, remove: toRemove } = planPendingChanges(localPayloads(), state.synced);
      for (const project of toUpload) {
        if (stopped) return;
        const print = fingerprint(project);
        if (refused.get(project.id) === print) continue;
        try {
          const revision = await upload(project, revisions()[project.id]);
          state.synced[project.id] = print;
          if (revision) revisions()[project.id] = revision;
          refused.delete(project.id);
        } catch (error) {
          if (error instanceof ConflictError) {
            console.warn(error.message, "Keeping both versions.");
            resolveConflict(error);
            continue;
          }
          console.error(error);
          if (error instanceof SyncError && !error.retry) refused.set(project.id, print);
          else failed = true;
        }
      }
      for (const id of toRemove) {
        if (stopped) return;
        try {
          await remove(id);
          delete state.synced[id];
          delete revisions()[id];
        } catch (error) {
          console.error(error);
          failed = true;
        }
      }
      writeSyncState(storage, state);
    } finally {
      running = false;
    }
    if (failed) {
      failures += 1;
      scheduleRetry();
    } else {
      failures = 0;
    }
    if (again && !stopped) {
      again = false;
      void flush();
    }
  }

  function onLocalChange() {
    clearTimeout(debounce);
    debounce = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  async function initialSync() {
    try {
      const response = await request("/api/projects");
      if (!response.ok) throw new SyncError(`Loading projects failed (${response.status}).`, true);
      const { projects: server, revisions: serverRevisions } = (await response.json()) as {
        projects: ProjectPayload[];
        revisions?: Record<string, string>;
      };
      if (stopped) return;
      state.revisions = { ...(serverRevisions ?? {}) };

      const plan = planInitialMerge(localPayloads(), server, state.synced);
      state.synced = plan.synced;
      replaceLocalProjects(storage, plan.projects);
      // Uploads and deletes the plan asked for are just pending changes now.
      for (const id of plan.remove) state.synced[id] = "deleted-here";
      writeSyncState(storage, state);
      ready = true;
      failures = 0;
      void flush();
    } catch (error) {
      console.error("Could not load projects from the server", error);
      if (stopped) return;
      failures += 1;
      clearTimeout(retry);
      retry = setTimeout(() => void initialSync(), RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)]);
    }
  }

  window.addEventListener(PROJECTS_CHANGED_EVENT, onLocalChange);
  // Changes made in another tab of this browser.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onLocalChange();
  };
  window.addEventListener("storage", onStorage);
  // Back online: send whatever piled up.
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);

  void initialSync();

  return () => {
    stopped = true;
    clearTimeout(debounce);
    clearTimeout(retry);
    window.removeEventListener(PROJECTS_CHANGED_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("online", onOnline);
  };
}
