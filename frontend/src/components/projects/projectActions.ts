import {
  ProjectStoreError,
  projectStore,
  type NewProjectInit,
  type Project,
  type ProjectMode,
  type ProjectStore,
  type ProjectStoreErrorCode,
} from "./projectStore.ts";

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProjectStoreErrorCode; message: string };

// Runs a store operation for the UI: a failure becomes a result the UI can show, and the
// underlying error is logged. `null` means the project does not exist.
function run<T>(failure: string, operation: () => T | null): ActionResult<T> {
  try {
    const value = operation();
    if (value === null) return { ok: false, code: "not-found", message: failure };
    return { ok: true, value };
  } catch (error) {
    console.error(failure, error);
    const code = error instanceof ProjectStoreError ? error.code : "unexpected";
    return { ok: false, code, message: failure };
  }
}

// What the Dashboard and Workspace call. BACKEND: these are the seam to move behind an
// API; callers only depend on the result shape.
export function createProjectActions(store: ProjectStore) {
  return {
    // Dashboard "New project": creates one project. The caller navigates to
    // /workspace/<id> only when this succeeds.
    create: (init?: NewProjectInit): ActionResult<Project> =>
      run("Couldn't create the project.", () => store.createProject(init)),

    rename: (id: string, title: string): ActionResult<Project> =>
      run("Couldn't rename the project.", () => store.renameProject(id, title)),

    duplicate: (id: string): ActionResult<Project> =>
      run("Couldn't duplicate the project.", () => store.duplicateProject(id)),

    remove: (id: string): ActionResult<true> =>
      run("Couldn't delete the project.", () => (store.deleteProject(id) ? true : null)),

    // Learn <-> Challenge inside a project. Not an edit, so the project is not marked as changed.
    setMode: (id: string, mode: ProjectMode): ActionResult<Project> =>
      run("Couldn't switch the project mode.", () => store.setProjectMode(id, mode)),

    markOpened: (id: string): ActionResult<Project> =>
      run("Couldn't record that the project was opened.", () => store.markProjectOpened(id)),
  };
}

export const projectActions = createProjectActions(projectStore);
