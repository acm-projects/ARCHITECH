"use client";

import { useSyncExternalStore } from "react";

import {
  projectStore,
  subscribeToProjects,
  type Project,
} from "./projectStore";

// The store returns the same array while the stored text is unchanged, which is what
// useSyncExternalStore needs. `null` on the server means "not loaded yet".
export function useProjectList(): Project[] | null {
  return useSyncExternalStore(
    subscribeToProjects,
    () => projectStore.listProjects(),
    () => null,
  );
}

// undefined: not loaded yet (server render). null: no such project.
export function useProject(id: string): Project | null | undefined {
  return useSyncExternalStore(
    subscribeToProjects,
    () => projectStore.getProject(id),
    () => undefined,
  );
}
