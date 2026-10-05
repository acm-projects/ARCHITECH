import {
  readJsonStorage,
  readStorage,
  removeStorage,
  STORAGE_KEYS,
  writeJsonStorage,
  writeStorage,
} from "./storage";
import {
  defaultProjectState,
  normalizeProjectState,
  type ProjectAddedComponent,
  type ProjectConnection,
  type ProjectNodeProperties,
  type ProjectPoint,
  type ProjectState,
} from "./projectSchema";
import type { Mode } from "../types";

export {
  defaultProjectState,
  normalizeProjectState,
  type ProjectAddedComponent,
  type ProjectConnection,
  type ProjectNodeProperties,
  type ProjectPoint,
  type ProjectState,
} from "./projectSchema";

export interface ProjectRecord {
  id: string;
  name: string;
  mode: Mode;
  source: "blank" | "github" | "template" | "challenge" | "recovered";
  sourceLabel?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  manualSavedAt?: string;
  state: ProjectState;
}

export interface CreateProjectInput {
  name: string;
  mode: Mode;
  source?: ProjectRecord["source"];
  sourceLabel?: string;
}

function now() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isMode(value: unknown): value is Mode {
  return value === "learn" || value === "challenge";
}

function isSource(value: unknown): value is ProjectRecord["source"] {
  return (
    value === "blank" ||
    value === "github" ||
    value === "template" ||
    value === "challenge" ||
    value === "recovered"
  );
}

function safeDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return fallback;
  }
  return value;
}

function sanitizeProjects(value: unknown): ProjectRecord[] {
  if (!Array.isArray(value)) return [];

  const fallbackDate = now();

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !("id" in entry)) return [];
    const project = entry as Record<string, unknown>;
    if (typeof project.id !== "string" || !project.id) return [];

    const createdAt = safeDate(project.createdAt, fallbackDate);
    const updatedAt = safeDate(project.updatedAt, createdAt);
    const lastOpenedAt = safeDate(project.lastOpenedAt, updatedAt);

    return [{
      id: project.id,
      name:
        typeof project.name === "string" && project.name.trim()
          ? project.name.trim()
          : "Untitled project",
      mode: isMode(project.mode) ? project.mode : "learn",
      source: isSource(project.source) ? project.source : "recovered",
      sourceLabel:
        typeof project.sourceLabel === "string" ? project.sourceLabel : undefined,
      createdAt,
      updatedAt,
      lastOpenedAt,
      manualSavedAt:
        typeof project.manualSavedAt === "string" &&
        Number.isFinite(Date.parse(project.manualSavedAt))
          ? project.manualSavedAt
          : undefined,
      state: normalizeProjectState(project.state),
    }];
  });
}

export function listProjects(): ProjectRecord[] {
  return sanitizeProjects(readJsonStorage<unknown>(STORAGE_KEYS.projects, []))
    .sort(
      (a, b) =>
        new Date(b.lastOpenedAt || b.updatedAt).getTime() -
        new Date(a.lastOpenedAt || a.updatedAt).getTime(),
    );
}

function writeProjects(projects: ProjectRecord[]): boolean {
  return writeJsonStorage(STORAGE_KEYS.projects, projects);
}

export function getProject(projectId: string): ProjectRecord | null {
  return listProjects().find((project) => project.id === projectId) ?? null;
}

export function getActiveProjectId(): string {
  return readStorage(STORAGE_KEYS.activeProjectId);
}

export function setActiveProjectId(projectId: string) {
  writeStorage(STORAGE_KEYS.activeProjectId, projectId);
}

export function clearActiveProjectId() {
  removeStorage(STORAGE_KEYS.activeProjectId);
}

export function createProject(input: CreateProjectInput): ProjectRecord {
  const timestamp = now();
  const project: ProjectRecord = {
    id: makeId(),
    name: input.name.trim() || "Untitled project",
    mode: input.mode,
    source: input.source ?? "blank",
    sourceLabel: input.sourceLabel,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    manualSavedAt: timestamp,
    state: defaultProjectState(),
  };

  const projects = listProjects();
  writeProjects([project, ...projects]);
  setActiveProjectId(project.id);
  return project;
}

export function updateProject(
  projectId: string,
  updater: (project: ProjectRecord) => ProjectRecord,
): ProjectRecord | null {
  let updated: ProjectRecord | null = null;
  const projects = listProjects().map((project) => {
    if (project.id !== projectId) return project;
    updated = updater(project);
    return updated;
  });
  if (updated && !writeProjects(projects)) return null;
  return updated;
}

export function updateProjectState(
  projectId: string,
  patch: Partial<ProjectState>,
): ProjectRecord | null {
  return updateProject(projectId, (project) => ({
    ...project,
    updatedAt: now(),
    state: normalizeProjectState({
      ...project.state,
      ...patch,
    }),
  }));
}

export function touchProject(projectId: string): ProjectRecord | null {
  setActiveProjectId(projectId);
  return updateProject(projectId, (project) => ({
    ...project,
    lastOpenedAt: now(),
  }));
}

export function markProjectSaved(projectId: string): ProjectRecord | null {
  const timestamp = now();
  return updateProject(projectId, (project) => ({
    ...project,
    updatedAt: timestamp,
    manualSavedAt: timestamp,
  }));
}

export function renameProject(projectId: string, name: string): ProjectRecord | null {
  const trimmed = name.trim();
  if (!trimmed) return getProject(projectId);
  return updateProject(projectId, (project) => ({
    ...project,
    name: trimmed,
    updatedAt: now(),
  }));
}

export function duplicateProject(projectId: string): ProjectRecord | null {
  const original = getProject(projectId);
  if (!original) return null;

  const timestamp = now();
  const copy: ProjectRecord = {
    ...original,
    id: makeId(),
    name: `${original.name} copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    manualSavedAt: timestamp,
    state: normalizeProjectState(structuredClone(original.state)),
  };

  if (!writeProjects([copy, ...listProjects()])) return null;
  return copy;
}

export function deleteProject(projectId: string): void {
  writeProjects(listProjects().filter((project) => project.id !== projectId));
  if (getActiveProjectId() === projectId) clearActiveProjectId();
}

export function ensureRecoveredProject(mode: Mode): ProjectRecord | null {
  const activeId = getActiveProjectId();
  if (activeId) {
    const active = getProject(activeId);
    if (active) return active;
  }

  const projects = listProjects();
  if (projects.length > 0) {
    setActiveProjectId(projects[0].id);
    return projects[0];
  }

  const legacyAdded = normalizeProjectState({
    addedComponents: readJsonStorage<Array<string | ProjectAddedComponent>>(
      STORAGE_KEYS.addedComponents,
      [],
    ),
    nodeOffsets: readJsonStorage<Record<string, ProjectPoint>>(
      STORAGE_KEYS.nodeOffsets,
      {},
    ),
    deletedNodes: readJsonStorage<string[]>(STORAGE_KEYS.deletedNodes, []),
    connections: readJsonStorage<ProjectConnection[]>(STORAGE_KEYS.connections, []),
    nodeProperties: readJsonStorage<ProjectNodeProperties>(
      STORAGE_KEYS.nodeProperties,
      {},
    ),
  });

  const legacySave = readStorage(STORAGE_KEYS.lastSave);
  const hasLegacyState =
    legacyAdded.addedComponents.length > 0 ||
    Object.keys(legacyAdded.nodeOffsets).length > 0 ||
    legacyAdded.deletedNodes.length > 0 ||
    legacyAdded.connections.length > 0 ||
    Object.keys(legacyAdded.nodeProperties).length > 0 ||
    Boolean(legacySave);

  if (!hasLegacyState) return null;

  const recovered = createProject({
    name: "Recovered project",
    mode,
    source: "recovered",
  });

  updateProjectState(recovered.id, {
    addedComponents: legacyAdded.addedComponents,
    nodeOffsets: legacyAdded.nodeOffsets,
    deletedNodes: legacyAdded.deletedNodes,
    connections: legacyAdded.connections,
    nodeProperties: legacyAdded.nodeProperties,
  });

  return getProject(recovered.id);
}
