"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { computePreview, formatRelativeTime } from "../projects/preview";
import { projectActions, type ActionResult } from "../projects/projectActions";
import type { Project } from "../projects/projectStore";
import { useProjectList, useProjectStorageIssue } from "../projects/useProjects";
import { useStartProject } from "../projects/useStartProject";
import { projectRoute } from "../../lib/routes";


function TopologyPreview({ project }: { project: Project }) {
  const preview = computePreview(project.nodes, project.edges);
  return (
    <svg viewBox="0 0 200 64" className="h-full w-full" aria-hidden="true">
      {preview.lines.map((line, index) => (
        <line
          key={index}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="currentColor"
          strokeWidth="0.75"
        />
      ))}
      {preview.nodes.map((node) => (
        <rect
          key={node.id}
          x={node.x - 6}
          y={node.y - 4.5}
          width="12"
          height="9"
          rx="1.5"
          fill="var(--tile)"
          stroke="currentColor"
          strokeWidth="0.75"
        />
      ))}
    </svg>
  );
}

type ProjectMenuProps = {
  project: Project;
  onRename: () => void;
  // The failure message, or null once an action has succeeded.
  onError: (message: string | null) => void;
};

function ProjectMenu({ project, onRename, onError }: ProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
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

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        aria-label={`Project options for ${project.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm leading-none text-[#0A0A0A] transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-600 group-hover/card:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        ⋯
      </button>

      {open && (
        <ul
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
                // Deleting cannot be undone, so it needs confirmation.
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
        </ul>
      )}
    </div>
  );
}

type RenameFieldProps = {
  title: string;
  onCommit: (title: string) => void;
};

function RenameField({ title, onCommit }: RenameFieldProps) {
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      defaultValue={title}
      maxLength={80}
      aria-label="Project name"
      onBlur={(event) => onCommit(cancelled.current ? title : event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className="w-full border-b border-neutral-400 bg-transparent text-[13px] font-medium focus:border-[#0A0A0A] focus:outline-none"
    />
  );
}

// Shown in the same place as other errors when projects cannot be listed or saved at all.
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
  // Captured once so relative times do not change during render.
  const [nowMs] = useState(() => Date.now());

  // A new project opens in Learn mode on an empty canvas; a repeat click is ignored.
  const createProject = () => {
    const result = startProject({ mode: "learn" });
    if (result) setError(result.ok ? null : result.message);
  };

  const commitRename = (project: Project, title: string) => {
    setRenamingId(null);
    const result = projectActions.rename(project.id, title);
    setError(result.ok ? null : result.message);
  };

  const count = projects?.length ?? 0;

  return (
    <section className="shrink-0 bg-white px-8 pb-2 pt-[clamp(0.75rem,2.5vh,1.75rem)] lg:px-14">
      <div className="mb-[clamp(0.5rem,1.5vh,1rem)] flex items-baseline justify-between">
        <h2
          data-reveal="fade"
          className="flex items-baseline gap-3 text-lg font-light tracking-[-0.02em]"
        >
          Projects
          <span
            className="text-xs tabular-nums text-neutral-400"
            aria-label={`${count} projects`}
          >
            {String(count).padStart(2, "0")}
          </span>
        </h2>
        {(error ?? (storageIssue ? STORAGE_ISSUE_MESSAGES[storageIssue] : null)) && (
          <p role="alert" className="text-xs text-red-700">
            {error ?? (storageIssue ? STORAGE_ISSUE_MESSAGES[storageIssue] : null)}
          </p>
        )}
      </div>

      {projects !== null && (
        <ul className="-mx-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-8 pb-3 [scrollbar-width:thin] lg:-mx-14 lg:px-14">
          <li className="shrink-0 snap-start">
            <button
              type="button"
              onClick={createProject}
              className="group flex aspect-[16/10] h-[clamp(5.5rem,15vh,9rem)] flex-col items-start justify-between border border-neutral-300 bg-white p-4 text-left transition-colors duration-200 hover:border-blue-700 hover:bg-blue-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 motion-reduce:transition-none"
            >
              <span
                className="text-3xl font-light leading-none text-blue-700 transition-colors duration-200 group-hover:text-white motion-reduce:transition-none"
                aria-hidden="true"
              >
                +
              </span>
              <span className="text-xs">New project</span>
            </button>
            <p className="mt-2 max-w-[14rem] text-xs text-neutral-500">
              {projects.length === 0
                ? "No architectures yet. Create your first system design."
                : "00a0"}
            </p>
          </li>

          {projects.map((project) => (
            <li key={project.id} className="group/card relative shrink-0 snap-start">
              <Link
                href={projectRoute(project.id)}
                aria-label={`Open ${project.title}`}
                className="block focus-visible:outline-none"
              >
                <div className="aspect-[16/10] h-[clamp(5.5rem,15vh,9rem)] bg-[#F2F2EF] p-4 text-neutral-400 transition-colors duration-200 [--tile:#F2F2EF] group-hover/card:bg-[#0A0A0A] group-hover/card:text-neutral-500 group-hover/card:[--tile:#0A0A0A] group-focus-within/card:ring-2 group-focus-within/card:ring-blue-700 motion-reduce:transition-none">
                  <TopologyPreview project={project} />
                </div>
              </Link>

              <ProjectMenu
                project={project}
                onRename={() => setRenamingId(project.id)}
                onError={setError}
              />

              <div className="mt-2 flex items-baseline justify-between gap-3">
                {renamingId === project.id ? (
                  <RenameField
                    title={project.title}
                    onCommit={(title) => commitRename(project, title)}
                  />
                ) : (
                  <Link
                    href={projectRoute(project.id)}
                    className="min-w-0 truncate text-sm tracking-tight focus-visible:underline focus-visible:outline-none"
                  >
                    {project.title}
                  </Link>
                )}
                <span className="shrink-0 text-[11px] text-neutral-500">
                  {formatRelativeTime(project.updatedAt, nowMs)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
