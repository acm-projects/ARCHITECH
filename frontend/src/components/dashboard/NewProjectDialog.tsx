"use client";

import { FolderGit2, GraduationCap, Target, Workflow, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { projectRoute } from "../../lib/routes";
import { projectActions } from "../projects/projectActions";
import type { Project, ProjectMode } from "../projects/projectStore";
import GitRepositoryPicker from "./GitRepositoryPicker";

type SetupStep =
  | { kind: "start" }
  | { kind: "git" }
  | { kind: "mode"; project: Project | null };

export default function NewProjectDialog({
  onDismiss,
  onStart,
  isOpening,
  creationError,
  initialGit = false,
}: {
  onDismiss: () => void;
  onStart: (mode: ProjectMode) => void;
  isOpening: boolean;
  creationError: string | null;
  initialGit?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openingRef = useRef(false);
  const [step, setStep] = useState<SetupStep>({ kind: initialGit ? "git" : "start" });
  const [isImporting, setIsImporting] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const [modeError, setModeError] = useState<string | null>(null);
  const busy = isOpening || isImporting || isNavigating;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step.kind]);

  const chooseMode = (mode: ProjectMode) => {
    if (busy || openingRef.current || step.kind !== "mode") return;
    setModeError(null);
    if (!step.project) {
      onStart(mode);
      return;
    }
    const projectId = step.project.id;
    openingRef.current = true;
    startNavigation(() => {
      const result = projectActions.setMode(projectId, mode);
      if (!result.ok) {
        openingRef.current = false;
        setModeError(result.message);
        return;
      }
      router.push(projectRoute(projectId));
    });
  };

  const title = step.kind === "git" ? "Choose a repository"
    : step.kind === "mode" ? "Choose a mode" : "New project";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-project-title"
      className="ax-new-project-dialog"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      onClick={event => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) onDismiss();
      }}
    >
      <div className="ax-new-project-heading">
        <h2 ref={headingRef} tabIndex={-1} id="new-project-title">{title}</h2>
        <button type="button" aria-label="Close new project" onClick={onDismiss} disabled={busy}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {step.kind === "git" && (
        <GitRepositoryPicker
          onBack={() => setStep({ kind: "start" })}
          onBusyChange={setIsImporting}
          onImported={project => setStep({ kind: "mode", project })}
        />
      )}
      {step.kind === "start" && (
        <div className="ax-new-project-options">
          <button type="button" onClick={() => setStep({ kind: "git" })} disabled={busy}>
            <span className="ax-new-project-icon"><FolderGit2 size={18} aria-hidden="true" /></span>
            Connect with Git
          </button>
          <button type="button" onClick={() => setStep({ kind: "mode", project: null })} disabled={busy}>
            <span className="ax-new-project-icon"><Workflow size={18} aria-hidden="true" /></span>
            Start new space
          </button>
        </div>
      )}
      {step.kind === "mode" && (
        <>
          {step.project && <p className="mb-3 break-words text-xs text-neutral-500">{step.project.title}</p>}
          <div className="ax-new-project-options" aria-busy={busy}>
            <button type="button" onClick={() => chooseMode("learn")} disabled={busy}>
              <span className="ax-new-project-icon"><GraduationCap size={18} aria-hidden="true" /></span>
              Learn
            </button>
            <button type="button" onClick={() => chooseMode("challenge")} disabled={busy}>
              <span className="ax-new-project-icon"><Target size={18} aria-hidden="true" /></span>
              Challenge
            </button>
          </div>
          {busy && <p role="status" className="mt-3 text-xs text-neutral-500">Opening workspace…</p>}
          {(modeError || creationError) && <p role="alert" className="mt-3 text-xs text-red-700">{modeError || creationError}</p>}
          {!step.project && <button type="button" className="ax-repository-back mt-3 text-xs" disabled={busy} onClick={() => setStep({ kind: "start" })}>← Back</button>}
        </>
      )}
    </dialog>
  );
}
