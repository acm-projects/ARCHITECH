// this file shows when someone click start/new project, create the project and get them into its workspace
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

import { projectRoute } from "../../lib/routes";
import { projectActions, type ActionResult } from "./projectActions";
import type { NewProjectInit, Project } from "./projectStore";

// Every new project starts with an empty canvas. Learn or Challenge mode
// decides what guidance gets shown around that canvas.
export const NEW_PROJECT_START: Pick<NewProjectInit, "nodes" | "edges"> = {
  nodes: [],
  edges: [],
};

// Stops a double click from accidentally creating two projects while the first one is opening.
const DUPLICATE_GUARD_MS = 1500;

// Creates a project and opens its workspace. We always create the project first
// because there is no standalone/scratch canvas anymore.
export function useStartProject(): (init?: NewProjectInit) => ActionResult<Project> | null {
  const router = useRouter();

  // Remember if a project is already being created so repeated clicks can be ignored.
  const creating = useRef(false);

  return useCallback(
    (init) => {
      if (creating.current) return null;

      // Start from the shared empty canvas, then add the title/mode/source passed by the caller.
      const result = projectActions.create({
        ...NEW_PROJECT_START,
        ...init,
      });

      // Stay on the current page if creation failed so the caller can show the error.
      if (!result.ok) return result;

      // Give navigation a moment to finish before allowing another project to be created.
      creating.current = true;
      window.setTimeout(() => {
        creating.current = false;
      }, DUPLICATE_GUARD_MS);

      // Creation worked, so open this project's workspace using its new ID.
      router.push(projectRoute(result.value.id));

      return result;
    },
    [router],
  );
}

/*Big picture:
Click Start
   ↓
useStartProject()
   ↓
create project
   ↓
creation worked?
  ↙       ↘
no        yes
↓          ↓
return    get project ID
error       ↓
         open /workspace/[id]
 */