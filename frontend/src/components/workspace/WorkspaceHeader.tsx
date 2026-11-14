"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, CircleAlert, Menu as MenuIcon, Moon, Pencil, RotateCcw, Trophy } from "lucide-react";
import WorkspaceHeaderShell from "./WorkspaceHeaderShell";
import { useAppTheme } from "../AppThemeBoundary";

import type { ProjectMode } from "../projects/projectStore";

type WorkspaceHeaderProps = {
  title: string;
  // Absent where the title is fixed, as in a system breakdown.
  onTitleChange?: (title: string) => void;
  // Absent where there is no design to reset.
  onReset?: () => void;
  saveStatus?: "saved" | "saving" | "error";
  // The project's mode. Learn and Challenge are two ways of working in the same project.
  mode: ProjectMode;
  onModeChange: (mode: ProjectMode) => void;
  // Progress inside the mode, for example "Step 3 / 8".
  modeStatus?: string;
  // The caller supplies Run only where testing is available.
  runControl?: ReactNode;
  projectActions?: (menuId: string) => ReactNode;
  // The canvas's zoom, fit and Auto align, where there is a canvas to look around.
  viewControls?: ReactNode;
  // Header controls of the page itself, placed before the mode switch.
  actions?: ReactNode;
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
  viewControls,
  actions,
}: WorkspaceHeaderProps) {
  const { theme, toggleTheme } = useAppTheme();
  const nightShift = theme === "dark";
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
    if (save && nextTitle) onTitleChange?.(nextTitle);
    setIsEditing(false);
  };

  return (
    <WorkspaceHeaderShell
      project={<>
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
        ) : !onTitleChange ? (
          <h1 className="ax-title"><span>{title}</span></h1>
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
            {saveStatus === "saved" && <Check size={14} aria-hidden="true" />}
            {saveStatus === "error" && <CircleAlert size={14} aria-hidden="true" />}
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? "Couldn't save"
                : "Saved"}
          </span>
        )}
      </>}
      actions={<>
        {viewControls && <>
          {viewControls}
          <span className="ax-header-divider" aria-hidden="true" />
        </>}
        {actions}
        {/* Learn and Challenge are two ways of working on the same design, one click apart. */}
        <div className="ax-mode-switch" role="radiogroup" aria-label="Project mode">
          {MODES.map((option) => {
            const ModeIcon = option.mode === "learn" ? BookOpen : Trophy;
            const selected = mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                title={selected && modeStatus ? `${option.label} · ${modeStatus}` : option.label}
                onClick={() => { if (!selected) onModeChange(option.mode); }}
              >
                <ModeIcon size={16} aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
        <span className="ax-header-divider" aria-hidden="true" />
        <>
          <button
            type="button"
            popoverTarget={menuId}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="ax-header-menu-trigger"
          >
            <MenuIcon size={15} aria-hidden="true" />
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
            {/* Actions target this popover directly, without depending on click bubbling. */}
            <div className="ax-project-menu-actions">
              {projectActions?.(menuId)}
            </div>
            {onReset && (
              <div className="ax-project-menu-group">
                <button type="button" className="ax-project-menu-item" onClick={() => {
                  closeMenu();
                  onReset();
                }}>
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>Reset design</span>
                </button>
              </div>
            )}
            {/* The menu stays open, so the switch can be flipped back while looking at it. */}
            <div className="ax-project-menu-group">
              <button type="button" className="ax-project-menu-item ax-night-shift" aria-pressed={nightShift} onClick={toggleTheme}>
                <Moon size={15} aria-hidden="true" />
                <span>Night shift</span>
                <span className="ax-switch" aria-hidden="true" data-on={nightShift || undefined} />
              </button>
            </div>
          </div>
        </>
        {runControl}
      </>}
    />
  );
}
