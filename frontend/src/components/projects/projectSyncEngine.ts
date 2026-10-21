// Keeps the browser's projects and the server's /api/projects in step for the signed-in user.
//
// The canvas keeps working exactly as before against the local project store (instant, and
// still usable offline). This runs next to it:
//   1. On sign-in: download the user's projects and merge them with this browser's copy
//      (src/lib/projects/syncPlan.ts decides what wins), then upload anything only here.
//   2. After that: every change the store makes is uploaded (or deleted) in the background.
//      Failed requests are retried, so a dropped connection only delays saving.
//   3. Each save says which server revision it was based on (If-Match). If another device
//      saved the project since, the server refuses (409). Only genuinely different content
//      is kept as a recovery project before retrying. A lost response or timestamp change
//      must not turn an ordinary autosave into another project.

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
  validateProjectInput,
  type ProjectPayload,
} from "../../lib/projects/projectPayload.ts";
import {
  conflictCopy,
  fingerprint,
  needsConflictCopy,
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
type SyncState = {
  owner: string;
  synced: SyncedFingerprints;
  revisions?: Record<string, string>;
  // At most one unacknowledged save per project. Persist before sending so a reload can
  // distinguish our own saved content from another device's edit.
  pending?: SyncedFingerprints;
};

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readSyncState(storage: Storage): SyncState | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SYNC_STATE_KEY) ?? "null");
    if (
      parsed && typeof parsed === "object" &&
      typeof (parsed as SyncState).owner === "string" &&
      typeof (parsed as SyncState).synced === "object" && (parsed as SyncState).synced !== null
    ) {
      const state = parsed as SyncState;
      return { owner: state.owner, synced: stringRecord(state.synced), revisions: stringRecord(state.revisions), pending: stringRecord(state.pending) };
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
  readonly retry: boolean;
  constructor(message: string, retry: boolean) {
    super(message);
    this.retry = retry;
  }
}

class ConflictError extends Error {
  readonly server: ProjectPayload;
  readonly revision: string;
  constructor(server: ProjectPayload, revision: string) {
    super(`"${server.title}" was changed on another device.`);
    this.server = server;
    this.revision = revision;
  }
}

type SavedProject = Pick<ConflictError, "server" | "revision">;

const revisionFrom = (response: Response): string | null => response.headers.get("etag")?.replace(/^W\//, "").replace(/"/g, "") || null;

function parseSavedProject(raw: unknown, revision: unknown, id: string): SavedProject {
  const parsed = validateProjectInput(raw);
  if (!parsed.ok || !raw || (raw as { id?: unknown }).id !== id || typeof revision !== "string" || !/^\d+$/.test(revision)) {
    throw new SyncError("The server returned an invalid saved project. Saving will be retried.", true);
  }
  return { server: { id, ...parsed.value }, revision };
}

// Before sending newer edits after an uncertain save, read what actually reached the
// server. This keeps a successful save with a lost response from being backed up as a
// supposed edit from another device.
async function readSavedProject(id: string): Promise<SavedProject | null> {
  const response = await request(`/api/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new SyncError(`Checking the last save failed (${response.status}).`, true);
  return parseSavedProject(await response.json(), revisionFrom(response), id);
}

// Returns the new server revision.
async function upload(project: ProjectPayload, revision: string | undefined): Promise<string> {
  const response = await request(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    body: JSON.stringify(project),
    headers: revision ? { "If-Match": `"${revision}"` } : {},
  });
  if (response.ok) {
    const revision = revisionFrom(response);
    if (revision && /^\d+$/.test(revision)) return revision;
    throw new SyncError("The save response did not include a valid revision. Saving will be checked again.", true);
  }
  const body = await response.json().catch(() => ({}));
  if (response.status === 409 && body.project && typeof body.revision === "string") {
    const saved = parseSavedProject(body.project, body.revision, project.id);
    throw new ConflictError(saved.server, saved.revision);
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

// All tabs share the local project store. Let one tab upload it so overlapping saves
// cannot mistake another tab's intermediate version for an edit from another device.
// Waiting tabs take over when the writer stops or closes.
export function startProjectSync(userId: string): () => void {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) {
    const stop = startProjectSyncSession(userId);
    return () => { void stop(); };
  }

  const controller = new AbortController();
  let stopSession: (() => Promise<void>) | undefined;
  let release: (() => void) | undefined;
  void locks.request(`architech:project-sync:${userId}`, { signal: controller.signal }, async () => {
    if (controller.signal.aborted) return;
    await new Promise<void>((resolve) => {
      release = resolve;
      stopSession = startProjectSyncSession(userId);
    });
  }).catch((error: unknown) => {
    if (!controller.signal.aborted) console.error("Could not start project synchronization", error);
  });

  return () => {
    controller.abort();
    // Finish any request already sent before the next tab reads the shared baseline.
    // Otherwise its first save could race the previous writer's final request.
    if (stopSession) void stopSession().then(() => release?.());
  };
}

function startProjectSyncSession(userId: string): () => Promise<void> {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return async () => {};
  }

  let stopped = false;
  let ready = false;
  let running = false;
  let again = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let inFlight: Promise<unknown> | undefined;
  // Data the server refused, by id -> fingerprint; not retried until the project changes.
  const refused = new Map<string, string>();

  const previous = readSyncState(storage);
  // Another account used this browser before: its projects stay with that account.
  if (previous && previous.owner !== userId) replaceLocalProjects(storage, []);
  const state: SyncState = {
    owner: userId,
    synced: previous && previous.owner === userId ? previous.synced : {},
    revisions: previous && previous.owner === userId ? (previous.revisions ?? {}) : {},
    pending: previous && previous.owner === userId ? (previous.pending ?? {}) : {},
  };
  const revisions = () => (state.revisions ??= {});
  const pending = (state.pending ??= {});

  // Keep the other device's version as its own project, then save ours over the original.
  function resolveConflict(conflict: SavedProject, project: ProjectPayload) {
    if (needsConflictCopy(conflict.server, project, state.synced[project.id], pending[project.id])) {
      console.warn(`"${project.title}" was changed on another device. Keeping both versions.`);
      const copy = conflictCopy(conflict.server, crypto.randomUUID(), MAX_TITLE_LENGTH);
      replaceLocalProjects(storage, [...localPayloads(), copy]);
    }
    revisions()[conflict.server.id] = conflict.revision;
    // Remember the observed server content so retrying the same conflict cannot create
    // a second recovery project. The unsaved local edit still remains pending.
    state.synced[project.id] = fingerprint(conflict.server);
    delete pending[project.id];
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
      for (let project of toUpload) {
        if (stopped) return;
        let print = fingerprint(project);
        if (refused.get(project.id) === print) continue;
        try {
          if (pending[project.id]) {
            const saved = await readSavedProject(project.id);
            if (stopped) return;
            // The project may have been deleted locally while the request was in flight.
            const current = projectStore.getProject(project.id);
            if (!current) {
              if (saved) state.synced[project.id] = fingerprint(saved.server);
              delete pending[project.id];
              again = true;
              continue;
            }
            project = projectToPayload(current);
            print = fingerprint(project);
            if (saved) resolveConflict(saved, project);
            else {
              delete pending[project.id];
              delete revisions()[project.id];
            }
          }
          pending[project.id] = print;
          writeSyncState(storage, state);
          const saving = upload(project, revisions()[project.id]);
          inFlight = saving;
          const revision = await saving;
          if (stopped) return;
          state.synced[project.id] = print;
          revisions()[project.id] = revision;
          delete pending[project.id];
          refused.delete(project.id);
          // Edits made during this request need their own save, using its new revision.
          const current = projectStore.getProject(project.id);
          if (!current || fingerprint(projectToPayload(current)) !== print) again = true;
        } catch (error) {
          if (stopped) return;
          if (error instanceof ConflictError) {
            const current = projectStore.getProject(project.id);
            if (current) resolveConflict(error, projectToPayload(current));
            else {
              delete pending[project.id];
              again = true;
            }
            continue;
          }
          console.error(error);
          if (error instanceof SyncError && !error.retry) {
            delete pending[project.id];
            refused.set(project.id, print);
          } else failed = true;
        }
      }
      for (const id of toRemove) {
        if (stopped) return;
        try {
          const deleting = remove(id);
          inFlight = deleting;
          await deleting;
          if (stopped) return;
          delete state.synced[id];
          delete revisions()[id];
          delete pending[id];
        } catch (error) {
          if (stopped) return;
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

  return async () => {
    stopped = true;
    clearTimeout(debounce);
    clearTimeout(retry);
    window.removeEventListener(PROJECTS_CHANGED_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("online", onOnline);
    if (inFlight) await Promise.allSettled([inFlight]);
  };
}
