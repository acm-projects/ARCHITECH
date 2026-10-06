import type { Edge } from "@xyflow/react";

import { COMPONENT_CATALOG } from "../workspace/componentCatalog.ts";
import type {
  ArchitectureFlowNode,
  ArchitectureNodeType,
} from "../workspace/nodes/ArchitectureNode";
import { STARTER_EDGES, STARTER_NODES } from "./starterArchitecture.ts";

// A saved free-form architecture. Only content is stored, never UI state such as
// selection, measurements or viewport.
export type Project = {
  id: string;
  title: string;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectContent = Pick<Project, "title" | "nodes" | "edges">;

export const STORAGE_KEY = "architech:projects";
export const DEFAULT_TITLE = "Untitled Architecture";
export const MAX_TITLE_LENGTH = 80;
const MAX_LABEL_LENGTH = 60;
const STORAGE_VERSION = 1;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type ProjectStoreOptions = {
  // Returns null when storage is unavailable (server render, blocked storage).
  getStorage: () => StorageLike | null;
  now?: () => string;
  newId?: () => string;
  // Called after every successful write so views can refresh.
  onChange?: () => void;
};

// ---- Sanitizing and validation ----

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isNodeType(value: unknown): value is ArchitectureNodeType {
  return typeof value === "string" && Object.hasOwn(COMPONENT_CATALOG, value);
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
  return {
    id: raw.id,
    type: "architecture",
    position: { x: position.x, y: position.y },
    data: { type: data.type, label: data.label },
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

// Reduces live React Flow nodes to their saved shape; invalid entries are dropped.
export function sanitizeNodes(nodes: readonly unknown[]): ArchitectureFlowNode[] {
  return nodes.flatMap((node) => parseNode(node) ?? []);
}

// Also drops edges whose endpoints are not among the given nodes.
export function sanitizeEdges(
  edges: readonly unknown[],
  nodes: readonly ArchitectureFlowNode[],
): Edge[] {
  const ids = new Set(nodes.map((node) => node.id));
  return edges.flatMap((edge) => parseEdge(edge, ids) ?? []);
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

const isDateString = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

// Returns null for anything that cannot be a project, so one bad entry never blocks
// the others. Bad nodes and edges inside a project are dropped, not fatal.
export function parseProject(raw: unknown): Project | null {
  if (!isRecord(raw)) return null;
  const { id, title, nodes, edges, createdAt, updatedAt } = raw;
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
    createdAt,
    updatedAt,
  };
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const byNewestFirst = (a: Project, b: Project) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

const defaultNewId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---- Store ----

type Loaded = {
  raw: string | null;
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

  function load(): Loaded {
    const storage = options.getStorage();
    let raw: string | null = null;
    try {
      raw = storage ? storage.getItem(STORAGE_KEY) : null;
    } catch {
      raw = null;
    }
    // The same raw text yields the same array, so list snapshots are referentially stable.
    if (cache && cache.raw === raw) return cache;

    const loaded: Loaded = { raw, projects: [], rejected: [], unreadable: null };
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
          loaded.projects.sort(byNewestFirst);
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

  // Throws if storage is unavailable or full, so callers can report a failed save.
  function write(projects: Project[]) {
    const storage = options.getStorage();
    if (!storage) throw new Error("Project storage is not available.");
    const current = load();
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
    cache = null;
    options.onChange?.();
  }

  function listProjects(): Project[] {
    return load().projects;
  }

  function getProject(id: string): Project | null {
    return load().projects.find((project) => project.id === id) ?? null;
  }

  function createProject(
    init: Partial<ProjectContent> = {},
  ): Project {
    const nodes = sanitizeNodes(init.nodes ?? copy(STARTER_NODES));
    const timestamp = now();
    const title = init.title?.trim() || DEFAULT_TITLE;
    const project: Project = {
      id: newId(),
      title: title.slice(0, MAX_TITLE_LENGTH),
      nodes,
      edges: sanitizeEdges(init.edges ?? copy(STARTER_EDGES), nodes),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    write([project, ...load().projects]);
    return project;
  }

  function updateProject(
    id: string,
    patch: Partial<ProjectContent>,
  ): Project | null {
    const projects = load().projects;
    const existing = projects.find((project) => project.id === id);
    if (!existing) return null;

    const nodes = patch.nodes ? sanitizeNodes(patch.nodes) : existing.nodes;
    const title = patch.title?.trim();
    const updated: Project = {
      ...existing,
      title: title ? title.slice(0, MAX_TITLE_LENGTH) : existing.title,
      nodes,
      edges: patch.edges ? sanitizeEdges(patch.edges, nodes) : sanitizeEdges(existing.edges, nodes),
      updatedAt: now(),
    };
    write(projects.map((project) => (project.id === id ? updated : project)));
    return updated;
  }

  // An empty or over-long title is rejected and the project is returned unchanged.
  function renameProject(id: string, title: string): Project | null {
    const existing = getProject(id);
    if (!existing) return null;
    const next = title.trim();
    if (!next || next.length > MAX_TITLE_LENGTH || next === existing.title) {
      return existing;
    }
    return updateProject(id, { title: next });
  }

  function deleteProject(id: string): boolean {
    const projects = load().projects;
    if (!projects.some((project) => project.id === id)) return false;
    write(projects.filter((project) => project.id !== id));
    return true;
  }

  function duplicateProject(id: string): Project | null {
    const existing = getProject(id);
    if (!existing) return null;
    const timestamp = now();
    const clone: Project = {
      id: newId(),
      title: `${existing.title} Copy`.slice(0, MAX_TITLE_LENGTH),
      nodes: copy(existing.nodes),
      edges: copy(existing.edges),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    write([clone, ...load().projects]);
    return clone;
  }

  return {
    listProjects,
    getProject,
    createProject,
    updateProject,
    renameProject,
    deleteProject,
    duplicateProject,
  };
}

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
