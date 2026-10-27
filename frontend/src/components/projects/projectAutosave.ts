import { createAutosaveController, type AutosaveTimers } from "./autosaveController.ts";
import {
  ProjectStoreError,
  diffProjectContent,
  projectStore,
  serializeProjectContent,
  type ProjectContent,
  type ProjectStore,
} from "./projectStore.ts";

export const AUTOSAVE_DEBOUNCE_MS = 500;

// Autosave for one project. It only ever writes to `projectId`, so a project that is closed
// or replaced cannot have its content saved into another one.
export function createProjectAutosave(
  projectId: string,
  store: ProjectStore = projectStore,
  timers?: AutosaveTimers,
) {
  return createAutosaveController<ProjectContent>({
    debounceMs: AUTOSAVE_DEBOUNCE_MS,
    timers,
    serialize: ({ title, nodes, edges }) => serializeProjectContent(title, nodes, edges),
    // BACKEND: replace with a project API call that sends the same patch.
    save: (content, saved) => {
      const updated = store.updateProject(projectId, diffProjectContent(saved, content));
      // The project was deleted while it was open. It is not recreated, and the editor
      // must not report these edits as saved.
      if (!updated) {
        throw new ProjectStoreError("not-found", "This project no longer exists.");
      }
    },
    onError: (error) => console.error("Could not save project", error),
  });
}
