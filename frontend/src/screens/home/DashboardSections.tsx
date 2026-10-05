import { useState } from "react";

import { Button, Icon, IconButton, Menu, MenuItem, StatusMessage } from "../../components/ui";
import {
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  type ProjectRecord,
} from "../../lib/projects";
import type { Mode } from "../../types";
import { DailyChallenge } from "./DailyChallenge";
import {
  CHALLENGES,
  PROJECTS,
  TUTORIAL_COMPANIES,
} from "./homeData";

interface RecentProjectsProps {
  openProject: (projectId: string) => void;
  openTemplate: (mode: Mode, name?: string) => void;
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function projectMeta(project: ProjectRecord) {
  const nodeCount =
    5 -
    project.state.deletedNodes.length +
    project.state.addedComponents.length;
  const source =
    project.source === "recovered"
      ? "Recovered"
      : project.mode === "challenge"
        ? "Challenge"
        : "Canvas";

  return `${source} · ${Math.max(0, nodeCount)} components · Updated ${relativeTime(project.updatedAt)}`;
}

export function RecentProjects({
  openProject,
  openTemplate,
}: RecentProjectsProps) {
  const [projects, setProjects] = useState(() => listProjects());
  const [actionMessage, setActionMessage] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const refresh = () => setProjects(listProjects());
  const notify = (message: string) => {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(""), 2200);
  };

  const handleRename = (project: ProjectRecord) => {
    setActionMenu(null);
    const nextName = window.prompt("Rename project", project.name);
    if (!nextName?.trim()) return;
    renameProject(project.id, nextName);
    refresh();
    notify("Project renamed");
  };

  const handleDuplicate = (project: ProjectRecord) => {
    setActionMenu(null);
    duplicateProject(project.id);
    refresh();
    notify("Project duplicated");
  };

  const handleDelete = (project: ProjectRecord) => {
    setActionMenu(null);
    if (!window.confirm(`Delete “${project.name}”? This removes the saved local project.`)) {
      return;
    }
    deleteProject(project.id);
    refresh();
    notify("Project deleted");
  };

  return (
    <div className="recent-projects">
      {projects.length > 0 && (
        <section className="dashboard-section">
          <div className="project-list-heading">
            <span>Recent work</span>
            <small>{projects.length} saved {projects.length === 1 ? "project" : "projects"}</small>
          </div>
          <div className="project-list" aria-label="Recent projects">
            {projects.map((project) => (
              <div className="project-row" key={project.id}>
                <button
                  className="project-row-main"
                  onClick={() => openProject(project.id)}
                >
                  <span className="project-row-icon">
                    <Icon name="connect" size={15} />
                  </span>
                  <span className="project-row-copy">
                    <b>{project.name}</b>
                    <small>{projectMeta(project)}</small>
                  </span>
                  <span className="project-row-mode">{project.mode}</span>
                </button>
                <div className="project-row-actions">
                  <IconButton
                    icon="more"
                    className="project-more"
                    label={`Project actions for ${project.name}`}
                    aria-expanded={actionMenu === project.id}
                    onClick={() => setActionMenu((current) => current === project.id ? null : project.id)}
                    size="sm"
                  />
                  {actionMenu === project.id && (
                    <Menu className="project-action-menu">
                      <MenuItem onClick={() => handleRename(project)}>Rename</MenuItem>
                      <MenuItem onClick={() => handleDuplicate(project)}>Duplicate</MenuItem>
                      <MenuItem destructive className="danger" onClick={() => handleDelete(project)}>Delete</MenuItem>
                    </Menu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {actionMessage && (
        <StatusMessage className="form-message project-action-feedback">
          {actionMessage}
        </StatusMessage>
      )}

      <section className="dashboard-section project-examples">
        <div className="project-list-heading">
          <span>{projects.length > 0 ? "Example systems" : "Start from an example"}</span>
          <small>Open a system and inspect the tradeoffs</small>
        </div>
        <div className="project-example-grid">
          {PROJECTS.map(({ name, mode, meta }) => (
            <button
              key={name}
              className="dashboard-project"
              onClick={() => openTemplate(mode, name)}
            >
              <span className="example-system-icon">
                <Icon name="connect" size={16} />
              </span>
              <span className="example-system-copy">
                <b>{name}</b>
                <small>{meta}</small>
              </span>
              <span className="example-system-mode">
                {mode === "challenge" ? "Challenge" : "Learn"}
              </span>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

interface ChallengesProps {
  open: (mode: Mode, name?: string) => void;
}

export function Challenges({ open }: ChallengesProps) {
  return (
    <section className="dashboard-section challenge-browser" aria-label="Architecture challenges">
      <div className="project-list-heading">
        <span>Architecture problems</span>
        <small>Constraint sets ready to build</small>
      </div>
      <div className="challenge-list">
        {CHALLENGES.map(({ name, difficulty, scale, time }, index) => (
          <button
            key={name}
            className="challenge-row"
            onClick={() => open("challenge", name)}
          >
            <span className="challenge-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="challenge-row-copy">
              <b>{name}</b>
              <small>{difficulty}</small>
            </span>
            <span className="challenge-scale">{scale}</span>
            <span className="challenge-time"><Icon name="history" size={12} /> {time}</span>
            <Icon name="chevron" size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}

interface TutorialSectionProps {
  showAll: boolean;
  onToggleShowAll: () => void;
  open: (mode: Mode, name?: string) => void;
}

export function TutorialSection({
  showAll,
  onToggleShowAll,
  open,
}: TutorialSectionProps) {
  const tutorials = TUTORIAL_COMPANIES.slice(
    0,
    showAll ? TUTORIAL_COMPANIES.length : 3,
  );

  return (
    <section className="company-tutorials">
      <div className="section-head">
        <h2>Guided builds</h2>
        <Button variant="ghost" size="sm" onClick={onToggleShowAll}>
          {showAll ? "Show less" : "View all"} <Icon name="arrow" size={14} />
        </Button>
      </div>

      <div className="tutorial-grid">
        {tutorials.map(({ company, title }) => (
          <article key={company}>
            <button
              className="tutorial-row"
              onClick={() => open("learn", `${company}: ${title}`)}
            >
              <strong>{company}</strong>
              <span>{title}</span>
              <span className="tutorial-action">
                Build <Icon name="arrow" size={13} />
              </span>
            </button>
          </article>
        ))}
      </div>

      <DailyChallenge onClick={() => open("challenge", "Daily challenge")} />
    </section>
  );
}
