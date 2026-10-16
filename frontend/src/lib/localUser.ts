import { readJsonStorage, STORAGE_KEYS } from "./storage";

interface LocalUser {
  name?: string;
  email?: string;
}

export function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LU"
  );
}

// The signed-in (local) user's display name and initials.
export function readLocalUser(): { displayName: string; initials: string } {
  const user = readJsonStorage<LocalUser>(STORAGE_KEYS.user, {});
  const displayName = user.name?.trim() || "Local user";
  return { displayName, initials: initialsFor(displayName) };
}
