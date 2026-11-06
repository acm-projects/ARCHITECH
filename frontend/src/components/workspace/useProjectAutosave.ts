import type { Edge } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { createProjectAutosave } from "../projects/projectAutosave";
import type { AutosaveStatus } from "../projects/autosaveController";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

export { AUTOSAVE_DEBOUNCE_MS } from "../projects/projectAutosave";

// This is the simpler save status the header needs.
// "dirty" means we have a change waiting for autosave, so the UI just shows it as "saving".
export type SaveStatus = "saved" | "saving" | "error";

const toSaveStatus = (status: AutosaveStatus): SaveStatus =>
  status === "dirty" ? "saving" : status;

// Used when there is no autosave controller to subscribe to.
const noopSubscribe = () => () => {};

// Watches the project's title and architecture and autosaves real changes.
//
// We don't save temporary canvas stuff like selection or measurements.
// Small changes are also debounced so dragging/editing doesn't write on every single update.
//
// BACKEND: Keep this hook as the workspace-facing autosave layer, but let the
// autosave/project data layer eventually send updates to the backend instead of local storage.
export function useProjectAutosave(
  projectId: string | null,
  title: string,
  nodes: ArchitectureFlowNode[],
  edges: Edge[],
): {
  status: SaveStatus;
  flush: () => void;
} {
  // Give each project its own autosave controller.
  // Switching to another project creates a fresh controller for that project.
  const controller = useMemo(
    () => (projectId ? createProjectAutosave(projectId) : null),
    [projectId],
  );

  // Let React listen to the controller so the header updates when the save
  // state changes between saved, dirty/saving, and error.
  const subscribe = useCallback(
    (listener: () => void) =>
      controller
        ? controller.subscribe(listener)
        : noopSubscribe(),
    [controller],
  );

  const status = useSyncExternalStore(
    subscribe,
    (): AutosaveStatus => controller?.getStatus() ?? "saved",
    (): AutosaveStatus => "saved",
  );

  // Send the latest project content to the autosave controller whenever it changes.
  //
  // While a node is actively being dragged, React Flow updates its position constantly.
  // We wait until the drag finishes instead of trying to autosave every frame.
  useEffect(() => {
    if (nodes.some((node) => node.dragging)) return;

    controller?.update({
      title,
      nodes,
      edges,
    });
  }, [controller, title, nodes, edges]);

  // Try to finish any pending save before the user hides/closes the page
  // or leaves this workspace, so their latest edit is less likely to be lost.
  useEffect(() => {
    if (!controller) return;

    const flush = () => {
      controller.flush();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );

      // Also save anything still waiting when this project/controller is cleaned up.
      flush();
    };
  }, [controller]);

  // Ctrl/Cmd+S calls this to save immediately instead of waiting for the debounce.
  // If nothing has changed, the controller has nothing to write.
  const flush = useCallback(
    () => controller?.flush(),
    [controller],
  );

  // The workspace only needs the simple header status and a way to force a save.
  return {
    status: toSaveStatus(status),
    flush,
  };
}