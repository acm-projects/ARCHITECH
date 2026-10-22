"use client";
// The failure message, or null once an action has succeeded.
// Deleting cannot be undone, so it needs confirmation.
// Shown in the same place as other errors when projects cannot be listed or saved at all.
// Captured once so relative times do not change during render.
// A new project opens an empty canvas in the chosen mode; a repeat click is ignored.
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatRelativeTime } from "../projects/preview";
import TopologyPreview from "../projects/TopologyPreview";
import { projectActions, type ActionResult } from "../projects/projectActions";
import type { Project, ProjectMode } from "../projects/projectStore";
import { useProjectList, useProjectStorageIssue } from "../projects/useProjects";
import { useStartProject } from "../projects/useStartProject";
import { projectRoute } from "../../lib/routes";
import NewProjectDialog from "./NewProjectDialog";

type ProjectMenuProps = {
  project: Project;
  onRename: () => void;
  onError: (message: string | null) => void;
};
function ProjectMenu({ project, onRename, onError }: ProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open)
      return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node))
        setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const run = (action: () => ActionResult<unknown>) => {
    setOpen(false);
    const result = action();
    onError(result.ok ? null : result.message);
  };
  return (<div ref={rootRef} className="absolute right-2 top-2 z-10">
    <button
      type="button"
      aria-label={`Project options for ${project.title}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm leading-none text-[#0A0A0A] transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-600 group-hover/card:opacity-100 ${open ? "opacity-100" : "opacity-100 [@media(hover:hover)]:opacity-0"}`}
    >
      ⋯
    </button>

    {open && (<ul
      role="menu"
      className="absolute right-0 top-9 z-20 w-36 rounded-md border border-neutral-200 bg-white py-1 text-[13px] shadow-sm"
    >
      <li role="none">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onRename();
          }}
          className="block w-full px-3 py-1.5 text-left hover:bg-neutral-100"
        >
          Rename
        </button>
      </li>
      <li role="none">
        <button
          type="button"
          role="menuitem"
          onClick={() => run(() => projectActions.duplicate(project.id))}
          className="block w-full px-3 py-1.5 text-left hover:bg-neutral-100"
        >
          Duplicate
        </button>
      </li>
      <li role="none">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (!window.confirm(`Delete "${project.title}"? This cannot be undone.`)) {
              setOpen(false);
              return;
            }
            run(() => projectActions.remove(project.id));
          }}
          className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-neutral-100"
        >
          Delete
        </button>
      </li>
    </ul>)}
  </div>);
}
type RenameFieldProps = {
  title: string;
  onCommit: (title: string) => void;
};
function RenameField({ title, onCommit }: RenameFieldProps) {
  const cancelled = useRef(false);
  return (<input
    autoFocus
    defaultValue={title}
    maxLength={80}
    aria-label="Project name"
    onBlur={(event) => onCommit(cancelled.current ? title : event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter")
        event.currentTarget.blur();
      if (event.key === "Escape") {
        cancelled.current = true;
        event.currentTarget.blur();
      }
    }}
    className="w-full border-b border-neutral-400 bg-transparent text-[13px] font-medium focus:border-[#0A0A0A] focus:outline-none"
  />);
}
const STORAGE_ISSUE_MESSAGES = {
  unavailable: "Browser storage is blocked, so projects can't be saved.",
  unreadable: "Saved projects couldn't be read. They haven't been changed.",
} as const;
export default function RecentProjects() {
  const startProject = useStartProject();
  const projects = useProjectList();
  const storageIssue = useProjectStorageIssue();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [resumeGit, setResumeGit] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("newProject") !== "git") return;
    const frame = requestAnimationFrame(() => {
      setResumeGit(true);
      setShowNewProject(true);
      url.searchParams.delete("newProject");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const [nowMs] = useState(() => Date.now());
  const [isOpening, startOpening] = useTransition();
  const [openingProjects, setOpeningProjects] = useState<Project[]>([]);
  // Storage publishes creation immediately; keep that new record out of the
  // dashboard while Next.js is transitioning to its workspace.
  const displayedProjects = isOpening ? openingProjects : projects;
  const createProject = (mode: ProjectMode) => {
    if (isOpening) return;
    setOpeningProjects(projects ?? []);
    startOpening(() => {
      const result = startProject({ mode });
      if (result) setError(result.ok ? null : result.message);
    });
  };
  const commitRename = (project: Project, title: string) => {
    setRenamingId(null);
    const result = projectActions.rename(project.id, title);
    setError(result.ok ? null : result.message);
  };
  return (<section className="ax-dashboard-projects bg-white px-5 py-6 sm:px-8 lg:px-14">
    <div className="ax-dashboard-project-heading mb-5">
      <div>
        <h2 className="ax-dashboard-section-title ax-dashboard-project-title">Projects</h2>
        <p className="mt-1 text-xs text-[#737373]">Continue your projects</p>
      </div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setResumeGit(false);
          setShowNewProject(true);
        }}
        aria-haspopup="dialog"
        disabled={isOpening}
        aria-busy={isOpening}
        className="ax-dashboard-project-create"
      >
        <span aria-hidden="true">+</span>
        New project
      </button>
    </div>
    {showNewProject && (
      <NewProjectDialog
        onDismiss={() => setShowNewProject(false)}
        onStart={createProject}
        isOpening={isOpening}
        creationError={error}
        initialGit={resumeGit}
      />
    )}
    {(error ?? (storageIssue ? STORAGE_ISSUE_MESSAGES[storageIssue] : null)) && (
      <p role="alert" className="mb-3 text-xs text-red-700">
        {error ?? (storageIssue ? STORAGE_ISSUE_MESSAGES[storageIssue] : null)}
      </p>
    )}
    {displayedProjects?.length === 0 && (
      <p className="text-sm text-[#737373]">No architectures yet.</p>
    )}

    {displayedProjects !== null && displayedProjects.length > 0 && (<ul
      className="ax-dashboard-project-grid"
      aria-label="Projects"
      tabIndex={0}
    >
      {displayedProjects.map((project) => (<li key={project.id} className="ax-dashboard-project-card group/card relative min-w-0">
        <Link
          href={projectRoute(project.id)}
          aria-label={`Open ${project.title}`}
          className="ax-dashboard-project-preview-link focus-visible:outline-none"
        >
          <div
            className="ax-dashboard-project-preview h-full w-full p-4 text-neutral-400"
          >
            {project.nodes.length > 0 ? (
              <TopologyPreview nodes={project.nodes} edges={project.edges} />
            ) : (
              <span className="text-xs text-neutral-500">Empty canvas</span>
            )}
          </div>
        </Link>

        <ProjectMenu
          project={project}
          onRename={() => setRenamingId(project.id)}
          onError={setError}
        />

        <div className="ax-dashboard-project-metadata">
          <div className="flex items-baseline justify-between gap-3">
          {renamingId === project.id ? (<RenameField title={project.title} onCommit={(title) => commitRename(project, title)} />) : (<Link
            href={projectRoute(project.id)}
            className="min-w-0 truncate text-sm font-medium tracking-tight focus-visible:underline focus-visible:outline-none"
          >
            {project.title}
          </Link>)}
          <span className="shrink-0 text-[11px] text-neutral-500">
            {formatRelativeTime(project.updatedAt, nowMs)}
          </span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            {project.nodes.length} nodes &middot; {project.edges.length} connections
          </p>
        </div>
      </li>))}
    </ul>)}
  </section>);
}
