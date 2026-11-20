import { projectToPayload } from "../../lib/projects/projectPayload.ts";
import { fingerprint } from "../../lib/projects/syncPlan.ts";
import type { Project } from "./projectStore.ts";

// Whether the server has this exact version of a project: what pages served from the server
// (Run as app) will show. The sync engine records the fingerprint of every version it has
// uploaded (projectSyncEngine.ts); this compares the browser's copy with it.
export function isProjectSaved(project: Project | null, synced: Record<string, string> | undefined): boolean {
  if (!project || !synced) return false;
  return synced[project.id] === fingerprint(projectToPayload(project));
}

export const SAVE_WAIT_MS = 8_000;
const POLL_MS = 150;

// Waits (up to `timeoutMs`) until the server has the project as it is in the browser now.
// `read` returns the current local copy and the sync engine's record each time it is asked,
// since autosave and the upload both finish in the background. True once saved, false on timeout.
export async function waitForProjectSaved(
  read: () => { project: Project | null; synced: Record<string, string> | undefined },
  { timeoutMs = SAVE_WAIT_MS, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), now = Date.now }: {
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<boolean> {
  const deadline = now() + timeoutMs;
  for (;;) {
    const { project, synced } = read();
    if (isProjectSaved(project, synced)) return true;
    if (now() >= deadline) return false;
    await sleep(POLL_MS);
  }
}
