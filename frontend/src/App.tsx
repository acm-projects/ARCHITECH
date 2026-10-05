import { useEffect, useRef, useState } from "react";

import {
  createProject,
  ensureRecoveredProject,
  getActiveProjectId,
  getProject,
  touchProject,
  updateProjectState,
  type CreateProjectInput,
} from "./lib/projects";
import { parseSharedProjectHash } from "./lib/share";
import { removeStorage, readStorageOption, STORAGE_KEYS, writeStorage } from "./lib/storage";
import { AuthPage, Onboarding } from "./screens/Auth";
import { Home } from "./screens/Home";
import { Landing } from "./screens/Marketing";
import { Workspace } from "./screens/Workspace";
import type { ExperienceLevel, Mode, Page } from "./types";

export default function App() {
  const sharedImportHandled = useRef(false);
  const [page, setPage] = useState<Page>(() =>
    readStorageOption(STORAGE_KEYS.lastPage, ["landing", "signin", "signup", "onboarding", "home", "workspace"] as const, "landing"),
  );
  const [mode, setMode] = useState<Mode>(() =>
    readStorageOption(STORAGE_KEYS.mode, ["learn", "challenge"] as const, "learn"),
  );
  const [level, setLevel] = useState<ExperienceLevel>(() =>
    readStorageOption(STORAGE_KEYS.level, ["Beginner", "Intermediate", "Advanced"] as const, "Intermediate"),
  );
  const [activeProjectId, setActiveProjectIdState] = useState(() => getActiveProjectId());

  useEffect(() => {
    if (sharedImportHandled.current) return;
    sharedImportHandled.current = true;

    const shared = parseSharedProjectHash(window.location.hash);
    if (!shared) return;

    const project = createProject({
      name: shared.name,
      mode: shared.mode,
      source: "template",
      sourceLabel: "Shared link",
    });
    updateProjectState(project.id, shared.state);

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    setMode(shared.mode);
    setActiveProjectIdState(project.id);
    setPage("workspace");
  }, []);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.mode, mode);
  }, [mode]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.level, level);
  }, [level]);

  useEffect(() => {
    if (page === "workspace" || page === "home") {
      writeStorage(STORAGE_KEYS.lastPage, page);
    }
  }, [page]);

  useEffect(() => {
    if (page !== "workspace") return;
    if (activeProjectId && getProject(activeProjectId)) return;

    const recovered = ensureRecoveredProject(mode);
    if (recovered) {
      setMode(recovered.mode);
      setActiveProjectIdState(recovered.id);
      return;
    }

    setPage("home");
  }, [page, activeProjectId, mode]);

  const openNewProject = (input: CreateProjectInput) => {
    const project = createProject(input);
    setMode(project.mode);
    setActiveProjectIdState(project.id);
    setPage("workspace");
  };

  const openExistingProject = (projectId: string) => {
    const project = touchProject(projectId);
    if (!project) return;
    setMode(project.mode);
    setActiveProjectIdState(project.id);
    setPage("workspace");
  };

  const demo = () => {
    openNewProject({
      name: "Netflix streaming architecture",
      mode: "learn",
      source: "template",
      sourceLabel: "Demo",
    });
  };

  const signOut = () => {
    removeStorage(STORAGE_KEYS.lastPage);
    setPage("landing");
  };

  if (page === "landing") {
    return <Landing signIn={() => setPage("signin")} signUp={() => setPage("signup")} demo={demo} />;
  }

  if (page === "signin") {
    return <AuthPage kind="signin" back={() => setPage("landing")} done={() => setPage("home")} switchKind={() => setPage("signup")} />;
  }

  if (page === "signup") {
    return <AuthPage kind="signup" back={() => setPage("landing")} done={() => setPage("onboarding")} switchKind={() => setPage("signin")} />;
  }

  if (page === "onboarding") {
    return <Onboarding level={level} setLevel={setLevel} done={() => setPage("home")} />;
  }

  if (page === "home") {
    return (
      <Home
        openNewProject={openNewProject}
        openProject={openExistingProject}
        landing={signOut}
        level={level}
      />
    );
  }

  if (!activeProjectId) return null;

  return (
    <Workspace
      key={activeProjectId}
      projectId={activeProjectId}
      mode={mode}
      onModeChange={setMode}
      home={() => setPage("home")}
      landing={signOut}
      level={level}
    />
  );
}
