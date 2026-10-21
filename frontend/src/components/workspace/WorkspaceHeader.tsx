"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, Pencil, RotateCcw, Trophy } from "lucide-react";
import { Logo } from "../ui";

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
  // The caller supplies Run only where testing is available.
  runControl?: ReactNode;
  projectActions?: (menuId: string) => ReactNode;
};

const MODES: { mode: ProjectMode; label: string }[] = [
  { mode: "learn", label: "Learn" },
  { mode: "challenge", label: "Challenge" },
];

const MAX_TITLE_LENGTH = 80;

export default function WorkspaceHeader({
  title,
  onTitleChange,
  onReset,
  saveStatus,
  mode,
  onModeChange,
  modeStatus,
  runControl,
  projectActions,
}: WorkspaceHeaderProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Enter, Escape and blur can all end an edit; this makes only the first one count.
  const editInProgress = useRef(false);
  const closeMenu = () => menuRef.current?.hidePopover();

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
    <header className="page-header ax-header">
      <div className="ax-header-project">
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
            className="ax-field ax-header-title-input"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            title="Rename architecture"
            className="ax-title"
          >
            <span>{title}</span>
            <Pencil size={12} aria-hidden="true" />
          </button>
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
      </div>

      <div className="ax-header-actions">
        <button
          type="button"
          popoverTarget={menuId}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="ax-header-menu-trigger"
        >
          Menu
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {/* Native popover keeps Escape, outside-click dismissal and focus return together. */}
        <div
          id={menuId}
          ref={menuRef}
          popover="auto"
          role="dialog"
          aria-label="Project menu"
          className="ax-project-menu"
          onToggle={(event) => setMenuOpen(event.currentTarget.matches(":popover-open"))}
        >
          <div role="group" aria-label="Project mode" className="ax-project-menu-group">
            <p className="ax-project-menu-label">Mode</p>
            {MODES.map((option) => {
              const ModeIcon = option.mode === "learn" ? BookOpen : Trophy;
              const selected = mode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    closeMenu();
                    if (!selected) onModeChange(option.mode);
                  }}
                  className="ax-project-menu-item"
                >
                  <ModeIcon size={15} aria-hidden="true" />
                  <span>{option.label}{selected && modeStatus && <small>{modeStatus}</small>}</span>
                  {selected && <Check size={14} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {/* Actions target this popover directly, without depending on click bubbling. */}
          <div className="ax-project-menu-actions">
            {projectActions?.(menuId)}
          </div>
          <div className="ax-project-menu-group">
            <button type="button" className="ax-project-menu-item" onClick={() => {
              closeMenu();
              onReset();
            }}>
              <RotateCcw size={15} aria-hidden="true" />
              <span>Reset design</span>
            </button>
          </div>
        </div>
        {runControl}
      </div>
    </header>
  );
}
