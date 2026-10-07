import type { Edge } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { createProjectAutosave } from "../projects/projectAutosave";
import type { AutosaveStatus } from "../projects/autosaveController";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

export { AUTOSAVE_DEBOUNCE_MS } from "../projects/projectAutosave";

// What the header shows. "dirty" (changed, waiting for the debounce) reads as "saving".
export type SaveStatus = "saved" | "saving" | "error";

const toSaveStatus = (status: AutosaveStatus): SaveStatus =>
  status === "dirty" ? "saving" : status;

const noopSubscribe = () => () => {};

// Saves a project's title, nodes and edges shortly after they stop changing. Changes that
// do not alter the saved content (selection, measuring, a drag that ends where it
// started) are ignored, so opening a project never changes its edit time. Pass null for
// sessions that are not saved. The save logic is in projects/autosaveController.ts.
export function useProjectAutosave(
  projectId: string | null,
  title: string,
  nodes: ArchitectureFlowNode[],
  edges: Edge[],
): { status: SaveStatus; flush: () => void } {
  // One controller per project: switching projects starts from a clean controller.
  const controller = useMemo(
    () => (projectId ? createProjectAutosave(projectId) : null),
    [projectId],
  );

  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : noopSubscribe()),
    [controller],
  );
  const status = useSyncExternalStore(
    subscribe,
    (): AutosaveStatus => controller?.getStatus() ?? "saved",
    (): AutosaveStatus => "saved",
  );

  useEffect(() => {
    // While a node is being dragged the graph changes on every frame. The position it ends on
    // is saved once the drag is over, so there is nothing to compare or copy until then.
    if (nodes.some((node) => node.dragging)) return;
    controller?.update({ title, nodes, edges });
  }, [controller, title, nodes, edges]);

  // Writes a pending change when the page is hidden or closed, or the workspace is left.
  useEffect(() => {
    if (!controller) return;
    const flush = () => controller.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, [controller]);

  // Writes a pending change now (Ctrl/Cmd+S). Does nothing when nothing is pending.
  const flush = useCallback(() => controller?.flush(), [controller]);

  return { status: toSaveStatus(status), flush };
}
