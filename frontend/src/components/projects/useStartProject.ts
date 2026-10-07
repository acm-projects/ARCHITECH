"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

import { projectRoute } from "../../lib/routes";
import { projectActions, type ActionResult } from "./projectActions";
import type { NewProjectInit, Project } from "./projectStore";

// Where a new project starts: an empty canvas. The mode decides what is shown around it.
export const NEW_PROJECT_START: Pick<NewProjectInit, "nodes" | "edges"> = { nodes: [], edges: [] };

// How long a second request is ignored after a project was created, so a double click creates
// one project, not two, while the navigation is under way.
const DUPLICATE_GUARD_MS = 1500;

// Creates a real project and opens it. Every canvas session belongs to a project, so this is
// the only way into the workspace. Returns null when the request was ignored as a repeat;
// otherwise the creation result, so the caller can show a failure. Navigates only on success.
export function useStartProject(): (init?: NewProjectInit) => ActionResult<Project> | null {
  const router = useRouter();
  const creating = useRef(false);

  return useCallback(
    (init) => {
      if (creating.current) return null;
      const result = projectActions.create({ ...NEW_PROJECT_START, ...init });
      if (!result.ok) return result;
      creating.current = true;
      window.setTimeout(() => {
        creating.current = false;
      }, DUPLICATE_GUARD_MS);
      router.push(projectRoute(result.value.id));
      return result;
    },
    [router],
  );
}
