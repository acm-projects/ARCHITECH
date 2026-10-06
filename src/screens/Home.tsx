import { useEffect, useState } from "react";

import { ProductHeader } from "../components/ProductShell";
import { Button, IconButton, Tab, Tabs } from "../components/ui";
import { useTheme } from "../hooks/useTheme";
import type { AuthUser } from "../lib/authApi";
import { isEditableTarget } from "../lib/dom";
import type { CreateProjectInput } from "../lib/projects";
import type { DashboardView, ExperienceLevel, Mode } from "../types";
import { DashboardTour } from "./home/DashboardTour";
import { ProfileMenu, SearchPalette } from "./home/DashboardOverlays";
import {
  Challenges,
  RecentProjects,
  TutorialSection,
} from "./home/DashboardSections";
import { getDashboardSearchItems } from "./home/homeData";
import { NewProjectModal } from "./home/ProjectModals";

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LU"
  );
}

export function Home({
  openNewProject,
  openProject,
  landing,
  signOut,
  user,
  level,
}: {
  openNewProject: (input: CreateProjectInput) => void;
  openProject: (projectId: string) => void;
  landing: () => void;
  signOut: () => void;
  user: AuthUser; // the signed-in account, loaded from the backend in App.tsx
  level: ExperienceLevel;
}) {
  const [tip, setTip] = useState(0);
  const [dashboardView, setDashboardView] = useState<DashboardView>("recent");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dark, setDark] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showAllTutorials, setShowAllTutorials] = useState(false);
  const displayName = user.name;
  const initials = initialsFor(displayName);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !isEditableTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key.toLowerCase() === "n" && !isEditableTarget(event.target)) {
        setNewProjectOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchItems = getDashboardSearchItems(searchQuery);
  const openModeAsProject = (mode: Mode, name?: string) =>
    openNewProject({
      name: name ?? (mode === "challenge" ? "New challenge" : "Untitled project"),
      mode,
      source: mode === "challenge" ? "challenge" : "template",
    });

  return (
    <main className={`home-page ${dark ? "dark" : ""}`}>
      <ProductHeader
        className="app-header"
        onLogoClick={landing}
        trail={<span className="product-location">Projects</span>}
        actions={(
          <>
            <IconButton icon="search" label="Search" onClick={() => setSearchOpen(true)} />
            <IconButton icon={dark ? "sun" : "moon"} label={dark ? "Switch to light theme" : "Switch to dark theme"} tooltip={dark ? "Light theme" : "Dark theme"} onClick={() => setDark(!dark)} />
            <button className="avatar avatar-button" aria-label="Open profile menu" aria-expanded={profileOpen} title="Profile" data-tooltip="Profile" onClick={() => setProfileOpen(!profileOpen)}>{initials}</button>
          </>
        )}
      />
      <div className="dashboard-layout-full">
        <div className="dashboard-main-full">
          <div className="dashboard-controlbar task-dashboard-controlbar">
            <div className="dashboard-controlbar-title">
              <span>WORKBENCH</span>
              <strong>Architecture work</strong>
            </div>
            <Tabs className="dashboard-tabs home-view-tabs" label="Project views">
              {(["recent", "challenge"] as DashboardView[]).map((view) => (
                <Tab
                  key={view}
                  selected={dashboardView === view}
                  onClick={() => setDashboardView(view)}
                >
                  {view === "challenge" ? "Challenges" : "Recent work"}
                </Tab>
              ))}
            </Tabs>
            <Button onClick={() => setNewProjectOpen(true)} icon="plus">New architecture</Button>
          </div>

          {dashboardView === "recent" && (
            <RecentProjects
              openProject={openProject}
              openTemplate={openModeAsProject}
            />
          )}

          {dashboardView === "challenge" && <Challenges open={openModeAsProject} />}

          {dashboardView === "recent" && (
            <TutorialSection
              showAll={showAllTutorials}
              onToggleShowAll={() => setShowAllTutorials((value) => !value)}
              open={openModeAsProject}
            />
          )}
        </div>
      </div>
      {tip >= 0 && <DashboardTour step={tip} level={level} close={() => setTip(-1)} next={() => { if (tip === 7) setTip(-1); else setTip(tip + 1); }} />}
      {newProjectOpen && <NewProjectModal close={() => setNewProjectOpen(false)} open={openNewProject} />}
      {searchOpen && (
        <SearchPalette
          query={searchQuery}
          items={searchItems}
          onQueryChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onOpen={(nextMode) => openModeAsProject(nextMode)}
        />
      )}
      {profileOpen && (
        <ProfileMenu
          name={displayName}
          initials={initials}
          level={level}
          dark={dark}
          onReplayTour={() => {
            setProfileOpen(false);
            setTip(0);
          }}
          onToggleTheme={() => setDark((value) => !value)}
          onSignOut={signOut}
        />
      )}
    </main>
  );
}
