import { useEffect, useRef, useState } from "react";

import { getCurrentUser, signOut as endSession, type AuthUser } from "./lib/authApi";
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

const DEFAULT_LEVEL: ExperienceLevel = "Intermediate"; // used until the account has a saved level

export default function App() {
  const sharedImportHandled = useRef(false);
  const [page, setPage] = useState<Page>(() =>
    readStorageOption(STORAGE_KEYS.lastPage, ["landing", "signin", "signup", "onboarding", "home", "workspace"] as const, "landing"),
  );
  const [mode, setMode] = useState<Mode>(() =>
    readStorageOption(STORAGE_KEYS.mode, ["learn", "challenge"] as const, "learn"),
  );
  // The account lives in the database. `user` is only this tab's copy of what the
  // backend returned; it is re-fetched from GET /api/auth/me on every load.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [level, setLevel] = useState<ExperienceLevel>(DEFAULT_LEVEL);
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

  // Ask the backend who is signed in (the session cookie is httpOnly, so JS can't read it).
  useEffect(() => {
    getCurrentUser()
      .then((current) => {
        if (!current) return;
        setUser((signedIn) => signedIn ?? current); // keep a sign-in that finished first
        if (current.experienceLevel) setLevel(current.experienceLevel);
      })
      .catch((error) => console.error("session check failed:", error))
      .finally(() => setSessionChecked(true));
  }, []);

  // Home and onboarding belong to an account; without a session, go sign in.
  const needsAccount = page === "home" || page === "onboarding";
  useEffect(() => {
    if (sessionChecked && !user && needsAccount) setPage("signin");
  }, [sessionChecked, user, needsAccount]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.mode, mode);
  }, [mode]);

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

  const signedIn = (account: AuthUser) => {
    setUser(account);
    setLevel(account.experienceLevel ?? DEFAULT_LEVEL);
  };

  const toLanding = () => {
    removeStorage(STORAGE_KEYS.lastPage);
    setPage("landing");
  };

  // Ends the session on the backend (clears the cookie). If that request fails the
  // session is still open, so the account stays loaded rather than pretending otherwise.
  const signOut = async () => {
    try {
      await endSession();
      setUser(null);
      setLevel(DEFAULT_LEVEL);
    } catch (error) {
      console.error("signout failed:", error);
    }
    toLanding();
  };

  if (page === "landing") {
    return <Landing signIn={() => setPage(user ? "home" : "signin")} signUp={() => setPage("signup")} demo={demo} />;
  }

  if (page === "signin") {
    return <AuthPage kind="signin" back={() => setPage("landing")} done={(account) => { signedIn(account); setPage("home"); }} switchKind={() => setPage("signup")} />;
  }

  if (page === "signup") {
    return <AuthPage kind="signup" back={() => setPage("landing")} done={(account) => { signedIn(account); setPage("onboarding"); }} switchKind={() => setPage("signin")} />;
  }

  // Render nothing while the session check is in flight or the redirect above is pending.
  if (needsAccount && !user) return null;

  if (page === "onboarding") {
    return <Onboarding level={level} setLevel={setLevel} onLevelSaved={signedIn} done={() => setPage("home")} />;
  }

  if (page === "home" && user) {
    return (
      <Home
        openNewProject={openNewProject}
        openProject={openExistingProject}
        landing={toLanding}
        signOut={signOut}
        user={user}
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
      landing={toLanding}
      level={level}
    />
  );
}
