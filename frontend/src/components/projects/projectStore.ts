/* Most important file for backend 
   this file defines what a project looks like, validates project data, saves/loads projects,
   and implements create/update/rename/delete/duplicate/mode switching
   
   Big picture:
   UI
   ↓
  projectActions.ts
    ↓
projectStore.ts
 ├── validate/sanitize data
 ├── create
 ├── update
 ├── rename
 ├── duplicate
 ├── delete
 ├── mode
 └── timestamps
 ↓
localStorage

BACKEND LATER:
 ↓
API + Database
*/

import type { Edge } from "@xyflow/react";

import { sanitizeNodeProperties } from "../../lib/architecture/nodeProperties.ts";
import { COMPONENT_CATALOG } from "../workspace/componentCatalog.ts";
import type {
  ArchitectureFlowNode,
  ArchitectureNodeType,
} from "../workspace/nodes/ArchitectureNode";
import { STARTER_EDGES, STARTER_NODES } from "./starterArchitecture.ts";

// Learn and Challenge use the same project and architecture.
// The mode only changes the guidance/evaluation shown around the canvas.
export type ProjectMode = "learn" | "challenge";

// Keeps track of how the project was originally created.
export type ProjectSource = "blank" | "duplicate" | "template" | "shared";

const PROJECT_MODES: readonly ProjectMode[] = ["learn", "challenge"];
export const DEFAULT_PROJECT_MODE: ProjectMode = "learn";
const PROJECT_SOURCES: readonly ProjectSource[] = [
  "blank",
  "duplicate",
  "template",
  "shared",
];

// This is the main saved shape of a project.
// We save the architecture itself, but not temporary UI stuff like selection or viewport.
//
// BACKEND: This is basically the project model the frontend expects from the API.
// Keep these fields in mind when creating the database/project response.
//
// createdAt = when it was created
// updatedAt = when the title or architecture actually changed
// lastOpenedAt = when the user last opened it
export type Project = {
  id: string;
  title: string;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  mode: ProjectMode;
  source?: ProjectSource;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

export const isProjectMode = (value: unknown): value is ProjectMode =>
  PROJECT_MODES.includes(value as ProjectMode);

export type ProjectContent = Pick<Project, "title" | "nodes" | "edges">;

export type NewProjectInit = Partial<ProjectContent> & {
  mode?: ProjectMode;
  source?: ProjectSource;
};

// These limits keep locally saved project data predictable.
// BACKEND: Match important validation rules like title length when projects move to the API.
export const STORAGE_KEY = "architech:projects";
export const DEFAULT_TITLE = "Untitled Architecture";
export const MAX_TITLE_LENGTH = 80;
const MAX_LABEL_LENGTH = 60;
const STORAGE_VERSION = 1;
const MAX_ID_ATTEMPTS = 10;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type ProjectStoreOptions = {
  // Returns null when storage is unavailable (server render, blocked storage).
  getStorage: () => StorageLike | null;
  now?: () => string;
  newId?: () => string;
  // Called after every successful write so views can refresh.
  onChange?: () => void;
};

// gives the ui a useful reason when saving/loading fails instead of throwing random storage errors
export type ProjectStoreErrorCode =
  | "storage-unavailable"
  | "write-failed"
  | "not-found"
  | "id-exhausted"
  | "unexpected";
// Store operations throw this when they cannot safely finish.
// projectActions.ts turns these errors into something the UI can show.
export class ProjectStoreError extends Error {
  readonly code: ProjectStoreErrorCode;

  constructor(code: ProjectStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProjectStoreError";
    this.code = code;
  }
}

// Tells the workspace exactly what happened when it tries to load a project:
// it either loaded, does not exist, or could not be safely read.
export type ProjectLoadState =
  | { status: "ready"; project: Project }
  | { status: "not-found" }
  // storage-unavailable: blocked or failing. unreadable: the stored text is not a project
  // list. invalid: this project's own record failed validation (it is kept, not deleted).
  | { status: "error"; reason: "storage-unavailable" | "unreadable" | "invalid" };

const NOT_FOUND: ProjectLoadState = { status: "not-found" };
const STORAGE_UNAVAILABLE: ProjectLoadState = {
  status: "error",
  reason: "storage-unavailable",
};
const UNREADABLE: ProjectLoadState = { status: "error", reason: "unreadable" };
const INVALID: ProjectLoadState = { status: "error", reason: "invalid" };

// Sanitizing and validation
//
// Projects can come from storage now and the backend later, so don't trust the raw data.
// These helpers clean nodes/edges and drop invalid pieces before the canvas uses them.
//
// BACKEND: The server should validate project data too. Keep this frontend validation
// as a safety layer for anything coming back to the browser.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isNodeType(value: unknown): value is ArchitectureNodeType {
  return typeof value === "string" && Object.hasOwn(COMPONENT_CATALOG, value);
}

const isProjectSource = (value: unknown): value is ProjectSource =>
  PROJECT_SOURCES.includes(value as ProjectSource);

// A valid title has to contain something and stay within the title limit.
export function normalizeTitle(raw: string | undefined): string | null {
  const title = raw?.trim();
  return title && title.length <= MAX_TITLE_LENGTH ? title : null;
}

// Turns unknown saved data into a safe canvas node.
// If the important fields are bad, we drop the node instead of letting it break the canvas.
function parseNode(raw: unknown): ArchitectureFlowNode | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const { position, data } = raw;
  if (!isRecord(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
    return null;
  }
  if (!isRecord(data) || !isNodeType(data.type)) return null;
  if (
    typeof data.label !== "string" ||
    !data.label.trim() ||
    data.label.length > MAX_LABEL_LENGTH
  ) {
    return null;
  }
  // Properties are optional. Projects saved before they existed have none, and invalid
  // entries are dropped rather than failing the whole node.
  const properties = sanitizeNodeProperties(data.properties);
  return {
    id: raw.id,
    type: "architecture",
    position: { x: position.x, y: position.y },
    data: {
      type: data.type,
      label: data.label,
      ...(properties ? { properties } : {}),
    },
  };
}
// Only keep connections whose source and target nodes actually exist.
function parseEdge(raw: unknown, nodeIds: ReadonlySet<string>): Edge | null {
  if (!isRecord(raw)) return null;
  const { id, source, target, sourceHandle, targetHandle } = raw;
  if (typeof id !== "string" || !id) return null;
  if (typeof source !== "string" || typeof target !== "string") return null;
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null;
  const edge: Edge = { id, source, target };
  if (typeof sourceHandle === "string") edge.sourceHandle = sourceHandle;
  if (typeof targetHandle === "string") edge.targetHandle = targetHandle;
  return edge;
}

// Clean the node list and make sure every node has a unique ID.
export function sanitizeNodes(nodes: readonly unknown[]): ArchitectureFlowNode[] {
  const seen = new Set<string>();
  return nodes.flatMap((raw) => {
    const node = parseNode(raw);
    if (!node || seen.has(node.id)) return [];
    seen.add(node.id);
    return [node];
  });
}
// Clean connections and remove broken or duplicate edges.
export function sanitizeEdges(
  edges: readonly unknown[],
  nodes: readonly ArchitectureFlowNode[],
): Edge[] {
  const ids = new Set(nodes.map((node) => node.id));
  const seenIds = new Set<string>();
  const seenConnections = new Set<string>();
  return edges.flatMap((raw) => {
    const edge = parseEdge(raw, ids);
    if (!edge || seenIds.has(edge.id)) return [];
    const connection = JSON.stringify([
      edge.source,
      edge.target,
      edge.sourceHandle ?? null,
      edge.targetHandle ?? null,
    ]);
    if (seenConnections.has(connection)) return [];
    seenIds.add(edge.id);
    seenConnections.add(connection);
    return [edge];
  });
}

// Gives us a stable version of the actual saved architecture.
// Temporary React Flow state does not count as a project change.
export function serializeProjectContent(
  title: string,
  nodes: readonly unknown[],
  edges: readonly unknown[],
): string {
  const cleanNodes = sanitizeNodes(nodes);
  return JSON.stringify({
    title,
    nodes: cleanNodes,
    edges: sanitizeEdges(edges, cleanNodes),
  });
}

// Only return the parts that actually changed.
// This keeps autosave from overwriting unrelated project data with stale values.
//
// BACKEND: This patch can map nicely to a PATCH/update-project endpoint later.
export function diffProjectContent(
  previous: ProjectContent,
  next: ProjectContent,
): Partial<ProjectContent> {
  const patch: Partial<ProjectContent> = {};

  const title = normalizeTitle(next.title);
  if (title !== null && title !== (normalizeTitle(previous.title) ?? previous.title)) {
    patch.title = title;
  }

  const previousNodes = sanitizeNodes(previous.nodes);
  const nextNodes = sanitizeNodes(next.nodes);
  if (JSON.stringify(previousNodes) !== JSON.stringify(nextNodes)) {
    patch.nodes = nextNodes;
  }

  const previousEdges = sanitizeEdges(previous.edges, previousNodes);
  const nextEdges = sanitizeEdges(next.edges, nextNodes);
  if (JSON.stringify(previousEdges) !== JSON.stringify(nextEdges)) {
    patch.edges = nextEdges;
  }

  return patch;
}

const isDateString = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

// Safely rebuild a Project from stored data.
// Older projects get defaults for fields that did not exist when they were saved.
export function parseProject(raw: unknown): Project | null {
  if (!isRecord(raw)) return null;
  const { id, title, nodes, edges, createdAt, updatedAt, lastOpenedAt, mode, source } = raw;
  if (typeof id !== "string" || !id) return null;
  if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE_LENGTH) {
    return null;
  }
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  if (!isDateString(createdAt) || !isDateString(updatedAt)) return null;

  const cleanNodes = sanitizeNodes(nodes);
  return {
    id,
    title,
    nodes: cleanNodes,
    edges: sanitizeEdges(edges, cleanNodes),
    mode: isProjectMode(mode) ? mode : DEFAULT_PROJECT_MODE,
    ...(isProjectSource(source) ? { source } : {}),
    createdAt,
    updatedAt,
    lastOpenedAt: isDateString(lastOpenedAt) ? lastOpenedAt : updatedAt,
  };
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Recent Projects uses whichever happened later: editing the project or opening it.
const lastActivity = (project: Project) =>
  Math.max(Date.parse(project.updatedAt), Date.parse(project.lastOpenedAt));

const byMostRecentActivity = (a: Project, b: Project) =>
  lastActivity(b) - lastActivity(a) ||
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

// BACKEND: Let the server/database create project IDs once projects are persisted remotely.
const defaultNewId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// "Shop" -> "Shop Copy" -> "Shop Copy 2" -> ..., never equal to a title in `taken`.
function uniqueCopyTitle(title: string, taken: ReadonlySet<string>): string {
  const base = `${title} Copy`.slice(0, MAX_TITLE_LENGTH);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, MAX_TITLE_LENGTH - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}
// Project store
//
// Everything below handles loading, saving, and changing projects.
// The UI should go through projectActions instead of calling these pieces directly.
type Loaded = {
  raw: string | null;
  available: boolean;
  // getItem threw. Nothing is known about what is stored, so nothing may be written.
  readFailed: boolean;
  projects: Project[];
  // Entries that failed validation. Kept and written back so they are never destroyed.
  rejected: unknown[];
  // The stored text when it could not be parsed at all; backed up before overwriting.
  unreadable: string | null;
};

export function createProjectStore(options: ProjectStoreOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? defaultNewId;
  let cache: Loaded | null = null;
  let loadStateMemo: { loaded: Loaded; id: string; state: ProjectLoadState } | null = null;

  // Read and validate the saved project list. We keep bad records separate instead
  // of deleting them, so one broken project cannot destroy the user's other projects.
  function load(): Loaded {
    const storage = options.getStorage();
    let raw: string | null = null;
    let readFailed = false;
    try {
      raw = storage ? storage.getItem(STORAGE_KEY) : null;
    } catch {
      readFailed = true;
    }
    const available = storage !== null;
    // The same raw text yields the same array, so list snapshots are referentially stable.
    if (
      cache &&
      cache.raw === raw &&
      cache.available === available &&
      cache.readFailed === readFailed
    ) {
      return cache;
    }

    const loaded: Loaded = {
      raw,
      available,
      readFailed,
      projects: [],
      rejected: [],
      unreadable: null,
    };
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        const entries =
          isRecord(parsed) && Array.isArray(parsed.projects) ? parsed.projects : null;
        if (entries) {
          for (const entry of entries) {
            const project = parseProject(entry);
            if (project) loaded.projects.push(project);
            else loaded.rejected.push(entry);
          }
          loaded.projects.sort(byMostRecentActivity);
        } else {
          loaded.unreadable = raw;
        }
      } catch {
        loaded.unreadable = raw;
      }
    }
    cache = loaded;
    return loaded;
  }

 // Save the full local project list and report a real error if the write fails.
 // We never pretend a project saved successfully when storage was unavailable.
 //
 // BACKEND: Replace this localStorage write with project API/database persistence.
 // Once that happens, the server should be the source of truth instead of this browser.
  function write(projects: Project[]) {
    const storage = options.getStorage();
    if (!storage) {
      throw new ProjectStoreError("storage-unavailable", "Project storage is not available.");
    }
    const current = load();
    if (current.readFailed) {
      throw new ProjectStoreError(
        "storage-unavailable",
        "Project storage could not be read, so it was not overwritten.",
      );
    }
    try {
      if (current.unreadable) {
        storage.setItem(`${STORAGE_KEY}:unreadable`, current.unreadable);
      }
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: STORAGE_VERSION,
          projects: [...projects, ...current.rejected],
        }),
      );
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new ProjectStoreError("write-failed", `Could not write projects: ${reason}`, {
        cause,
      });
    }
    cache = null;
    options.onChange?.();
  }

  // Keep generating IDs until we find one that isn't already used by another project.
  function freshId(loaded: Loaded): string {
    const taken = new Set(loaded.projects.map((project) => project.id));
    for (const entry of loaded.rejected) {
      if (isRecord(entry) && typeof entry.id === "string") taken.add(entry.id);
    }
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const id = newId();
      if (!taken.has(id)) return id;
    }
    throw new ProjectStoreError("id-exhausted", "Could not generate a unique project id.");
  }

  function listProjects(): Project[] {
    return load().projects;
  }

  function getProject(id: string): Project | null {
    return load().projects.find((project) => project.id === id) ?? null;
  }

  // Lets the dashboard tell the difference between "no projects" and
  // "we couldn't safely read your projects."
  function getStorageIssue(): "unavailable" | "unreadable" | null {
    const loaded = load();
    if (!loaded.available || loaded.readFailed) return "unavailable";
    return loaded.unreadable ? "unreadable" : null;
  }

  // Gives the workspace the full load result for one project instead of just project/null.
  function getProjectState(id: string): ProjectLoadState {
    const loaded = load();
    if (loadStateMemo && loadStateMemo.loaded === loaded && loadStateMemo.id === id) {
      return loadStateMemo.state;
    }

    const project = loaded.projects.find((candidate) => candidate.id === id);
    let state: ProjectLoadState;
    if (!loaded.available || loaded.readFailed) state = STORAGE_UNAVAILABLE;
    else if (project) state = { status: "ready", project };
    else if (loaded.unreadable) state = UNREADABLE;
    else if (loaded.rejected.some((entry) => isRecord(entry) && entry.id === id)) {
      state = INVALID;
    } else state = NOT_FOUND;

    loadStateMemo = { loaded, id, state };
    return state;
  }

  // Single place where a Project object is created.
  // The caller can provide its starting graph; otherwise the store falls back to the starter graph.
  //
  // BACKEND: Project creation should eventually happen on the server so the server
  // owns the ID and timestamps.
  function createProject(init: NewProjectInit = {}): Project {
    const loaded = load();
    const nodes = sanitizeNodes(init.nodes ?? copy(STARTER_NODES));
    const timestamp = now();
    const title = init.title?.trim() || DEFAULT_TITLE;
    const project: Project = {
      id: freshId(loaded),
      title: title.slice(0, MAX_TITLE_LENGTH),
      nodes,
      edges: sanitizeEdges(init.edges ?? copy(STARTER_EDGES), nodes),
      mode: isProjectMode(init.mode) ? init.mode : DEFAULT_PROJECT_MODE,
      source: isProjectSource(init.source) ? init.source : "blank",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    };
    write([project, ...loaded.projects]);
    return project;
  }

  // Apply only the changed project content. If nothing actually changed,
  // don't save again or change updatedAt.
  //
  // BACKEND: The server should eventually own updatedAt and resolve concurrent updates.
  function updateProject(
    id: string,
    patch: Partial<ProjectContent>,
  ): Project | null {
    const projects = load().projects;
    const existing = projects.find((project) => project.id === id);
    if (!existing) return null;

    const nodes = patch.nodes ? sanitizeNodes(patch.nodes) : existing.nodes;
    const candidate: Project = {
      ...existing,
      title: normalizeTitle(patch.title) ?? existing.title,
      nodes,
      edges: sanitizeEdges(patch.edges ?? existing.edges, nodes),
    };
    if (
      serializeProjectContent(candidate.title, candidate.nodes, candidate.edges) ===
      serializeProjectContent(existing.title, existing.nodes, existing.edges)
    ) {
      return existing;
    }

    const updated: Project = { ...candidate, updatedAt: now() };
    write(projects.map((project) => (project.id === id ? updated : project)));
    return updated;
  }
  // Ignore empty/invalid titles instead of saving a broken project name.
  function renameProject(id: string, title: string): Project | null {
    const existing = getProject(id);
    if (!existing) return null;
    const next = normalizeTitle(title);
    if (next === null || next === existing.title) return existing;
    return updateProject(id, { title: next });
  }

  // Learn and Challenge are modes of the same project.
  // Switching modes is not an architecture edit, so updatedAt stays unchanged.
  function setProjectMode(id: string, mode: ProjectMode): Project | null {
    if (!isProjectMode(mode)) {
      throw new ProjectStoreError("unexpected", "Unknown project mode.");
    }
    const projects = load().projects;
    const existing = projects.find((project) => project.id === id);
    if (!existing) return null;
    if (existing.mode === mode) return existing;
    const updated: Project = { ...existing, mode };
    write(projects.map((project) => (project.id === id ? updated : project)));
    return updated;
  }

  // Opening a project only changes lastOpenedAt, not updatedAt.
  function markProjectOpened(id: string): Project | null {
    const projects = load().projects;
    const existing = projects.find((project) => project.id === id);
    if (!existing) return null;
    const updated: Project = { ...existing, lastOpenedAt: now() };
    write(projects.map((project) => (project.id === id ? updated : project)));
    return updated;
  }

  function deleteProject(id: string): boolean {
    const projects = load().projects;
    if (!projects.some((project) => project.id === id)) return false;
    write(projects.filter((project) => project.id !== id));
    return true;
  }

  // Make a completely independent copy with its own ID, timestamps, title, nodes, and edges.
  function duplicateProject(id: string): Project | null {
    const loaded = load();
    const existing = loaded.projects.find((project) => project.id === id);
    if (!existing) return null;
    const timestamp = now();
    const clone: Project = {
      id: freshId(loaded),
      title: uniqueCopyTitle(
        existing.title,
        new Set(loaded.projects.map((project) => project.title)),
      ),
      nodes: copy(existing.nodes),
      edges: copy(existing.edges),
      mode: existing.mode,
      source: "duplicate",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    };
    write([clone, ...loaded.projects]);
    return clone;
  }

  // Public project operations used by projectActions and the project-loading hooks.
  return {
    listProjects,
    getProject,
    getProjectState,
    getStorageIssue,
    createProject,
    updateProject,
    renameProject,
    markProjectOpened,
    setProjectMode,
    deleteProject,
    duplicateProject,
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

// ---- Browser instance ----

export const PROJECTS_CHANGED_EVENT = "architech:projects-changed";

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Current browser implementation of the project store.
//
// BACKEND: This localStorage-backed instance is temporary. When the API is ready,
// projectActions/project loading should use the remote project source instead.
export const projectStore = createProjectStore({
  getStorage: browserStorage,
  onChange: () => window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT)),
});

// Keep open dashboard/workspace views in sync when projects change in this tab or another tab.
//
// BACKEND: Replace these browser storage events with whatever refresh/cache strategy
// the API layer uses.
export function subscribeToProjects(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(PROJECTS_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PROJECTS_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
