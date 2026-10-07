"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { HOME_ROUTE } from "../../lib/routes";
import { projectActions } from "../projects/projectActions";
import type { Project } from "../projects/projectStore";
import { useProjectLoad } from "../projects/useProjects";
import ArchitectureWorkspace from "./ArchitectureWorkspace";

const ERROR_MESSAGES = {
  "storage-unavailable": "Browser storage is blocked or unavailable.",
  unreadable: "The saved projects could not be read. They have not been changed.",
  invalid: "This project's saved data is damaged. It has not been deleted.",
} as const;

function Message({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 bg-white text-[#0A0A0A]">
      <h1 className="text-lg font-medium">{title}</h1>
      <p className="text-sm text-neutral-500">{detail}</p>
      <Link
        href={HOME_ROUTE}
        className="mt-2 text-sm text-blue-700 transition-opacity hover:opacity-60"
      >
        Back to dashboard
      </Link>
    </main>
  );
}

// Opens a saved project (in the mode it was left in). Never creates a project implicitly.
// States: loading -> ready | not-found | error.
export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const load = useProjectLoad(projectId);

  // The workspace owns the canvas state after it mounts, so it only needs the project as
  // first loaded. Later storage updates (its own autosaves) must not remount it, and a
  // project deleted elsewhere keeps its open editor (autosave then reports an error).
  const [initial, setInitial] = useState<Project | null>(null);
  if (load.status === "ready" && initial?.id !== projectId) setInitial(load.project);
  const opened = initial?.id === projectId ? initial : null;

  // Opening is recorded once per project, and only changes the dashboard ordering.
  const recordedOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!opened || recordedOpen.current === opened.id) return;
    recordedOpen.current = opened.id;
    projectActions.markOpened(opened.id);
  }, [opened]);

  if (opened) return <ArchitectureWorkspace key={opened.id} project={opened} />;

  switch (load.status) {
    case "loading":
    case "ready":
      // Before the browser has read storage there is nothing to show yet.
      return <div className="h-screen bg-white" />;
    case "not-found":
      return (
        <Message
          title="Project not found"
          detail="It may have been deleted, or it was saved in a different browser."
        />
      );
    case "error":
      return <Message title="Couldn't open project" detail={ERROR_MESSAGES[load.reason]} />;
  }
}
