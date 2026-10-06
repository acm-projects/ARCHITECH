"use client";

import Link from "next/link";
import { useState } from "react";

import type { Project } from "../projects/projectStore";
import { useProject } from "../projects/useProjects";
import ArchitectureWorkspace from "./ArchitectureWorkspace";

// Opens a saved project in the free workspace. Never creates a project implicitly.
export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const project = useProject(projectId);

  // The workspace owns the canvas state after it mounts, so it only needs the project as
  // first loaded. Later storage updates (its own autosaves) must not remount it.
  const [initial, setInitial] = useState<Project | null>(null);
  if (project && !initial) setInitial(project);

  if (initial) {
    return <ArchitectureWorkspace key={initial.id} project={initial} />;
  }

  // Before the browser has read storage there is nothing to show yet.
  if (project === undefined) return <div className="h-screen bg-white" />;

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 bg-white text-[#0A0A0A]">
      <h1 className="text-lg font-medium">Project not found</h1>
      <p className="text-sm text-neutral-500">
        It may have been deleted, or it was saved in a different browser.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 text-sm text-blue-700 transition-opacity hover:opacity-60"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
