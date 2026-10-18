"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Logo } from "../ui";

import type { RunButtonState } from "../../lib/architecture/evaluation/resultsView";
import { HOME_ROUTE } from "../../lib/routes";
import type { ProjectMode } from "../projects/projectStore";

type WorkspaceHeaderProps = {
  title: string;
  onTitleChange: (title: string) => void;
  onReset: () => void;
  saveStatus?: "saved" | "saving" | "error";
  // The project's mode. Learn and Challenge are two ways of working in the same project.
  mode: ProjectMode;
  onModeChange: (mode: ProjectMode) => void;
  // Progress inside the mode, for example "Step 3 / 8".
  modeStatus?: string;
  // Run Design. Absent where the action is not available (the guided lesson, and Challenge,
  // which has its own Submit).
  onRun?: () => void;
  runState?: RunButtonState;
};

const MODES: { mode: ProjectMode; label: string }[] = [
  { mode: "learn", label: "Learn" },
  { mode: "challenge", label: "Challenge" },
];

const RUN_LABELS: Record<RunButtonState, string> = {
  idle: "Run design",
  analyzing: "Analyzing…",
  ready: "Run again",
  stale: "Run again",
  error: "Retry",
};

const MAX_TITLE_LENGTH = 80;

export default function WorkspaceHeader({
  title,
  onTitleChange,
  onReset,
  saveStatus,
  mode,
  onModeChange,
  modeStatus,
  onRun,
  runState = "idle",
}: WorkspaceHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Enter, Escape and blur can all end an edit; this makes only the first one count.
  const editInProgress = useRef(false);

  const startEditing = () => {
    editInProgress.current = true;
    setDraft(title);
    setIsEditing(true);
  };

  const finishEditing = (save: boolean) => {
    if (!editInProgress.current) return;
    editInProgress.current = false;

    // An empty title is not allowed, so the previous one is kept.
    const nextTitle = draft.trim();
    if (save && nextTitle) onTitleChange(nextTitle);
    setIsEditing(false);
  };

  return (
    <header className="page-header ax-header flex shrink-0 items-center justify-between">
      <div className="flex min-w-0 items-center gap-10">
        <Link href={HOME_ROUTE} className="ax-brand focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="ARCHITECH dashboard">
          <Logo variant="by-level" />
        </Link>

        {isEditing ? (
          <input
            autoFocus
            value={draft}
            maxLength={MAX_TITLE_LENGTH}
            aria-label="Architecture title"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => finishEditing(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") finishEditing(true);
              if (event.key === "Escape") finishEditing(false);
            }}
            className="ax-field w-64 py-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            title="Rename architecture"
            className="ax-title truncate"
          >
            {title}
          </button>
        )}
      </div>

      <div className="flex items-center gap-5">
        <div role="group" aria-label="Project mode" className="ax-modes">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={mode === option.mode}
              onClick={() => {
                if (mode !== option.mode) onModeChange(option.mode);
              }}
              className="ax-action"
            >
              {option.label}
            </button>
          ))}
        </div>
        {modeStatus && <span className="text-[10px] text-(--ax-muted)">{modeStatus}</span>}
        {saveStatus && (
          <span role="status" data-state={saveStatus} className="ax-save">
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? "Couldn't save"
                : "Saved"}
          </span>
        )}
        <button type="button" onClick={onReset} className="ax-action">
          Reset
        </button>
        {onRun && (
          <button
            type="button"
            onClick={() => onRun()}
            aria-disabled={runState === "analyzing"}
            data-run-state={runState}
            className="ax-action ax-action-primary"
          >
            {RUN_LABELS[runState]} <span className="ax-arrow">→</span>
          </button>
        )}
      </div>
    </header>
  );
}
