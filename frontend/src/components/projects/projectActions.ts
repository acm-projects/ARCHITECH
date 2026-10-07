// this file works as the middle layer between your ui and however projects are stored

import {
  ProjectStoreError,
  projectStore,
  type NewProjectInit,
  type Project,
  type ProjectMode,
  type ProjectStore,
  type ProjectStoreErrorCode,
} from "./projectStore.ts";

// All project actions return the same shape so the UI can handle success and errors consistently.
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProjectStoreErrorCode; message: string };

// Wraps a project operation so components don't need their own try/catch every time.
// If something fails, we log the real error and return a simple error the UI can show.
function run<T>(failure: string, operation: () => T | null): ActionResult<T> {
  try {
    const value = operation();

    if (value === null) {
      return { ok: false, code: "not-found", message: failure };
    }

    return { ok: true, value };
  } catch (error) {
    console.error(failure, error);

    const code =
      error instanceof ProjectStoreError ? error.code : "unexpected";

    return { ok: false, code, message: failure };
  }
}

// Dashboard and Workspace use these actions instead of talking to storage directly.
//
// BACKEND: This is the main project API boundary. Replace the local store calls with
// backend requests for create/rename/duplicate/delete/mode updates while keeping the
// same result behavior so the UI does not need to be rewritten.
export function createProjectActions(store: ProjectStore) {
  return {
    // Creates the project first. The caller only opens its workspace if this succeeds.
    create: (init?: NewProjectInit): ActionResult<Project> =>
      run("Couldn't create the project.", () => store.createProject(init)),

    rename: (id: string, title: string): ActionResult<Project> =>
      run("Couldn't rename the project.", () => store.renameProject(id, title)),

    duplicate: (id: string): ActionResult<Project> =>
      run("Couldn't duplicate the project.", () => store.duplicateProject(id)),

    remove: (id: string): ActionResult<true> =>
      run(
        "Couldn't delete the project.",
        () => (store.deleteProject(id) ? true : null),
      ),

    // Learn and Challenge are two modes of the same project.
    // Switching modes should not count as editing the architecture itself.
    setMode: (id: string, mode: ProjectMode): ActionResult<Project> =>
      run(
        "Couldn't switch the project mode.",
        () => store.setProjectMode(id, mode),
      ),

    // Tracks when a project was last opened so Recent Projects can be ordered correctly.
    markOpened: (id: string): ActionResult<Project> =>
      run(
        "Couldn't record that the project was opened.",
        () => store.markProjectOpened(id),
      ),
  };
}

// Default actions used by the app with the current project store.
export const projectActions = createProjectActions(projectStore);

/* Big Picture:
Dashboard / Workspace
        ↓
  projectActions.ts
        ↓
    BACKEND API
        ↓
     Database
 */