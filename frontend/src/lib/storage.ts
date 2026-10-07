// What the landing, sign-in and onboarding screens keep in this browser. The project store keeps
// projects under its own key (architech:projects).
export const STORAGE_KEYS = {
  lastPage: "architech-last-page",
  level: "architech-level",
  user: "architech-user",
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
