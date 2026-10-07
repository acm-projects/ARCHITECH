import type { Edge } from "@xyflow/react";

import { sanitizeNodeProperties } from "../../lib/architecture/nodeProperties.ts";
import { COMPONENT_CATALOG } from "../workspace/componentCatalog.ts";
import type {
  ArchitectureFlowNode,
  ArchitectureNodeType,
} from "../workspace/nodes/ArchitectureNode";
import { STARTER_EDGES, STARTER_NODES } from "./starterArchitecture.ts";

// What a project is being used for. A project is one architecture that can be worked on in
// either mode; the mode only decides which guidance and judging is shown around the canvas.
// Projects saved before modes were consolidated may carry "workspace"; they read as "learn".
export type ProjectMode = "learn" | "challenge";
// Where a project came from. Absent on projects saved before this field existed.
export type ProjectSource = "blank" | "duplicate" | "template" | "shared";

const PROJECT_MODES: readonly ProjectMode[] = ["learn", "challenge"];
export const DEFAULT_PROJECT_MODE: ProjectMode = "learn";
const PROJECT_SOURCES: readonly ProjectSource[] = [
  "blank",
  "duplicate",
  "template",
  "shared",
];

// A saved architecture. Only content is stored, never UI state such as selection,
// measurements or viewport.
//
// createdAt:    when the project was created.
// updatedAt:    the last time its title or architecture actually changed. Opening a project
//               never changes it.
// lastOpenedAt: the last time it was opened. Starts equal to createdAt.
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

// ---- Errors ----

export type ProjectStoreErrorCode =
  | "storage-unavailable"
  | "write-failed"
  | "not-found"
  | "id-exhausted"
  | "unexpected";

// What the store throws when an operation could not be persisted. An operation that
// throws has changed nothing.
export class ProjectStoreError extends Error {
  readonly code: ProjectStoreErrorCode;

  constructor(code: ProjectStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProjectStoreError";
    this.code = code;
  }
}

// What loading one project can produce. "loading" is not here: it only exists before the
// browser has read storage (see useProjectLoad).
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

// ---- Sanitizing and validation ----

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isNodeType(value: unknown): value is ArchitectureNodeType {
  return typeof value === "string" && Object.hasOwn(COMPONENT_CATALOG, value);
}

const isProjectSource = (value: unknown): value is ProjectSource =>
  PROJECT_SOURCES.includes(value as ProjectSource);

// A title entered by a user: trimmed, non-empty and at most MAX_TITLE_LENGTH. Returns
// null otherwise. Rename and content updates reject such titles instead of cutting them.
export function normalizeTitle(raw: string | undefined): string | null {
  const title = raw?.trim();
  return title && title.length <= MAX_TITLE_LENGTH ? title : null;
}

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

// Reduces live React Flow nodes to their saved shape; invalid entries are dropped, and so
// is any later node that reuses an id (React Flow needs ids to be unique).
export function sanitizeNodes(nodes: readonly unknown[]): ArchitectureFlowNode[] {
  const seen = new Set<string>();
  return nodes.flatMap((raw) => {
    const node = parseNode(raw);
    if (!node || seen.has(node.id)) return [];
    seen.add(node.id);
    return [node];
  });
}

// Also drops edges whose endpoints are not among the given nodes, and repeats: an edge
// that reuses an id, or connects the same pair the same way as an earlier one.
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

// Stable text form of the saved content, used to detect real changes (a drag that ends
// where it started, a selection or a measurement is not a change).
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

// The fields of `next` that really differ from `previous`, ready to pass to
// updateProject. Sending only what changed means saving a node edit cannot overwrite a
// title that was renamed elsewhere (another tab, the dashboard) in the meantime.
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

// Returns null for anything that cannot be a project, so one bad entry never blocks
// the others. Bad nodes and edges inside a project are dropped, not fatal. Fields added
// later (lastOpenedAt, mode, source) fall back to defaults, so older records still load.
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

// Dashboard order: whatever was opened or edited most recently comes first.
const lastActivity = (project: Project) =>
  Math.max(Date.parse(project.updatedAt), Date.parse(project.lastOpenedAt));

const byMostRecentActivity = (a: Project, b: Project) =>
  lastActivity(b) - lastActivity(a) ||
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

// BACKEND: a server would assign project ids.
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

// ---- Store ----

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

  // Throws a ProjectStoreError if storage is unavailable or full, so callers can report a
  // failed operation. Nothing is written in that case.
  // BACKEND: replace this local write with a project API call. The operations below only
  // need "persist this list or throw".
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

  // An id that no project, including a rejected record, already uses.
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

  // Why the stored projects cannot be used at all, or null when they can. Unlike a project
  // that is simply missing, this means storage is blocked or its contents are not a project
  // list, and nothing in it has been changed.
  function getStorageIssue(): "unavailable" | "unreadable" | null {
    const loaded = load();
    if (!loaded.available || loaded.readFailed) return "unavailable";
    return loaded.unreadable ? "unreadable" : null;
  }

  // Why a project can or cannot be opened. The same object is returned until the stored
  // text changes, which is what useSyncExternalStore needs.
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

  // The single place projects are created. Unless told otherwise a project is `source: "blank"`
  // in `mode: "learn"`, starting from the starter architecture.
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

  // Applies a content change. Does nothing, and writes nothing, when the result equals what
  // is already saved. A title that is empty or longer than MAX_TITLE_LENGTH is ignored.
  // BACKEND: the server should become authoritative for updatedAt.
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

  // An empty or over-long title is rejected and the project is returned unchanged.
  function renameProject(id: string, title: string): Project | null {
    const existing = getProject(id);
    if (!existing) return null;
    const next = normalizeTitle(title);
    if (next === null || next === existing.title) return existing;
    return updateProject(id, { title: next });
  }

  // Switches which mode a project opens in. Like opening, this is not an edit: it leaves
  // updatedAt alone. An unknown mode is refused (null would mean "not found", so it throws).
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

  // Records that a project was opened. Changes lastOpenedAt only: opening is not an edit.
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

  // The copy has its own id, timestamps and deep-copied content, and a title no other
  // project uses.
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

export const projectStore = createProjectStore({
  getStorage: browserStorage,
  onChange: () => window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT)),
});

// Notifies on writes from this tab and, via the storage event, from other tabs.
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
