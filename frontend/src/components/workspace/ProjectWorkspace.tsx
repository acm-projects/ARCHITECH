"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { HOME_ROUTE } from "../../lib/routes";
import { projectActions } from "../projects/projectActions";
import type { Project } from "../projects/projectStore";
import { useProjectLoad } from "../projects/useProjects";
import ArchitectureWorkspace from "./ArchitectureWorkspace";

// Friendly messages for the different ways loading a saved project can fail.
const ERROR_MESSAGES = {
  "storage-unavailable": "Browser storage is blocked or unavailable.",
  unreadable: "The saved projects could not be read. They have not been changed.",
  invalid: "This project's saved data is damaged. It has not been deleted.",
} as const;

// Reusable fallback screen when a project can't be opened.
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

// Loads an existing project and hands it to the architecture editor.
// This page never creates a missing project automatically.
export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  // Watch the saved project until we know whether it loaded, is missing, or has an error.
  const load = useProjectLoad(projectId);

  // Once the project loads, give the editor that starting snapshot and let the editor
  // own its live canvas state from there. Autosaves should not keep resetting the editor.
  const [initial, setInitial] = useState<Project | null>(null);

  if (load.status === "ready" && initial?.id !== projectId) {
    setInitial(load.project);
  }

  const opened = initial?.id === projectId ? initial : null;

  // Record the project as opened once so it moves appropriately in Recent Projects.
  // This does not count as editing the architecture.
  const recordedOpen = useRef<string | null>(null);

  useEffect(() => {
    if (!opened || recordedOpen.current === opened.id) return;

    recordedOpen.current = opened.id;
    projectActions.markOpened(opened.id);
  }, [opened]);

  // Once loading succeeds, the full editor takes over from here.
  if (opened) {
    return <ArchitectureWorkspace key={opened.id} project={opened} />;
  }

  switch (load.status) {
    case "loading":
    case "ready":
      // Keep the page blank while the browser is still resolving the project.
      // This avoids flashing the wrong UI before the editor is ready.
      return <div className="h-screen bg-white" />;

    case "not-found":
      return (
        <Message
          title="Project not found"
          detail="It may have been deleted, or it was saved in a different browser."
        />
      );

    case "error":
      return (
        <Message
          title="Couldn't open project"
          detail={ERROR_MESSAGES[load.reason]}
        />
      );
    default:
      return (
        <Message
          title="Unknown status"
          detail="An unexpected error occurred while loading the project."
        />
      );
  }
}