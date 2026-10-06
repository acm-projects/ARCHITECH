"use client";

import { useRef, useState } from "react";

type WorkspaceHeaderProps = {
  title: string;
  onTitleChange: (title: string) => void;
  onReset: () => void;
  // Present only for saved projects.
  saveStatus?: "saved" | "saving" | "error";
  // Present only in Learn and Challenge modes: replaces the editable title and the
  // Learn/Run actions with a fixed title and a mode label.
  session?: { title: string; label: string; status?: string };
};

const MAX_TITLE_LENGTH = 80;

export default function WorkspaceHeader({
  title,
  onTitleChange,
  onReset,
  saveStatus,
  session,
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
    <header className="ax-header flex h-11 shrink-0 items-center justify-between px-6">
      <div className="flex min-w-0 items-center gap-10">
        <span className="ax-brand">ARCHITECH</span>

        {session ? (
          <span className="truncate text-[11px] text-(--ax-ink-soft)">
            {session.title}
          </span>
        ) : isEditing ? (
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
        {session && (
          <span className="text-[10px] text-(--ax-muted)">
            {session.label}
            {session.status ? ` · ${session.status}` : ""}
          </span>
        )}
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
        {!session && (
          <>
            <button type="button" className="ax-action">
              Learn
            </button>
            <button type="button" className="ax-action ax-action-primary">
              Run design <span className="ax-arrow">→</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
