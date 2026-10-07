"use client";

import { useSyncExternalStore } from "react";

import {
  projectStore,
  subscribeToProjects,
  type Project,
  type ProjectLoadState,
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

// Whether the stored projects can be used at all. null until the browser has read storage.
export function useProjectStorageIssue(): "unavailable" | "unreadable" | null {
  return useSyncExternalStore(
    subscribeToProjects,
    () => projectStore.getStorageIssue(),
    () => null,
  );
}

export type ProjectLoad = { status: "loading" } | ProjectLoadState;

const LOADING: ProjectLoad = { status: "loading" };

// loading, then ready, not-found or error. `error` covers storage that is blocked or
// unreadable and a project record that failed validation.
export function useProjectLoad(id: string): ProjectLoad {
  return useSyncExternalStore(
    subscribeToProjects,
    () => projectStore.getProjectState(id),
    () => LOADING,
  );
}
