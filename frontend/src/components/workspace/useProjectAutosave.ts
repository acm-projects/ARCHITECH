import type { Edge } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { projectStore, serializeProjectContent } from "../projects/projectStore";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

export type SaveStatus = "saved" | "saving" | "error";

export const AUTOSAVE_DEBOUNCE_MS = 500;

// Saves a project's title, nodes and edges shortly after they stop changing.
// Changes that do not alter the saved content (selection, measuring, a drag that ends
// where it started) are ignored, so opening a project never changes its edit time.
export function useProjectAutosave(
  projectId: string | null,
  title: string,
  nodes: ArchitectureFlowNode[],
  edges: Edge[],
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const lastSaved = useRef<string | null>(null);
  const pendingSave = useRef<(() => void) | null>(null);

  // Declared first so its cleanup runs before the debounce effect's cleanup on unmount.
  // Writes any pending change when leaving the page or the project.
  useEffect(() => {
    if (!projectId) return;
    const flush = () => pendingSave.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const snapshot = serializeProjectContent(title, nodes, edges);

    // The first run is the content that was just loaded, which is already saved.
    if (lastSaved.current === null) {
      lastSaved.current = snapshot;
      return;
    }
    if (snapshot === lastSaved.current) {
      setStatus("saved");
      return;
    }

    setStatus("saving");
    const save = () => {
      pendingSave.current = null;
      try {
        projectStore.updateProject(projectId, { title, nodes, edges });
        lastSaved.current = snapshot;
        setStatus("saved");
      } catch (error) {
        console.error("Could not save project", error);
        setStatus("error");
      }
    };
    pendingSave.current = save;
    const timer = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      pendingSave.current = null;
    };
  }, [projectId, title, nodes, edges]);

  return status;
}
