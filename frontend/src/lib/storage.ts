export const STORAGE_KEYS = {
  lastPage: "architech-last-page",
  mode: "architech-mode",
  level: "architech-level",
  user: "architech-user",
  githubConnected: "architech-github-connected",
  theme: "architech-theme",
  aiEnabled: "architech-ai-enabled",
  addedComponents: "architech-added-components",
  nodeOffsets: "architech-node-offsets",
  deletedNodes: "architech-deleted-nodes",
  connections: "architech-connections",
  nodeProperties: "architech-node-properties",
  lastSave: "architech-last-save",
  challengeSeen: "architech-challenge-v1",
  projects: "architech-projects-v2",
  activeProjectId: "architech-active-project-id",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function readStorage(key: StorageKey, fallback = ""): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readStorageOption<T extends string>(
  key: StorageKey,
  options: readonly T[],
  fallback: T,
): T {
  const value = readStorage(key);
  return options.includes(value as T) ? (value as T) : fallback;
}

export function writeStorage(key: StorageKey, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage can be unavailable in private browsing or restricted embeds.
    return false;
  }
}

export function removeStorage(key: StorageKey): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // No-op when storage is unavailable.
  }
}

export function readJsonStorage<T>(key: StorageKey, fallback: T): T {
  const raw = readStorage(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage<T>(key: StorageKey, value: T): boolean {
  return writeStorage(key, JSON.stringify(value));
}

export function readBooleanStorage(key: StorageKey, fallback = false): boolean {
  const raw = readStorage(key);
  if (!raw) return fallback;
  return raw === "true";
}

export function writeBooleanStorage(key: StorageKey, value: boolean): boolean {
  return writeStorage(key, String(value));
}
