"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, ChevronDown, CircleAlert, Menu as MenuIcon, Moon, Pencil, RotateCcw, Trophy, Workflow } from "lucide-react";
import WorkspaceHeaderShell from "./WorkspaceHeaderShell";
import Panel, { isPanelBehind } from "./panel/Panel";
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
  // Rows for the menu. `close` closes the menu, for rows that act and are done.
  projectActions?: (close: () => void) => ReactNode;
  // Lines the design up in the direction requests travel. Absent where there is nothing to align.
  onAutoAlign?: () => void;
  // Header controls of the page itself, placed before the mode switch.
  actions?: ReactNode;
  // Where the menu opens as a right panel, in the column with the others. Without it (a system
  // breakdown, which has no column) the menu drops down from its button.
  menuHost?: HTMLElement | null;
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
  onAutoAlign,
  actions,
  menuHost,
}: WorkspaceHeaderProps) {
  const { theme, toggleTheme } = useAppTheme();
  const nightShift = theme === "dark";
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuReveal, setMenuReveal] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Enter, Escape and blur can all end an edit; this makes only the first one count.
  const editInProgress = useRef(false);
  const asPanel = menuHost !== undefined;
  const closeMenu = () => {
    if (asPanel) setMenuOpen(false);
    else menuRef.current?.hidePopover();
  };

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

  const menuRows = (
    <>
      {/* Actions close the menu themselves once they have acted. */}
      <div className="ax-project-menu-actions">
        {projectActions?.(closeMenu)}
      </div>
      <div className="ax-project-menu-group" role="group" aria-label="Canvas">
        <p className="ax-project-menu-label" aria-hidden="true">Canvas</p>
        <button
          type="button"
          className="ax-project-menu-item"
          disabled={!onAutoAlign}
          title={onAutoAlign ? "Line components up in the direction requests travel (undo with Ctrl+Z)" : "Add at least two components to align"}
          onClick={() => {
            closeMenu();
            onAutoAlign?.();
          }}
        >
          <Workflow size={15} aria-hidden="true" />
          <span>Auto align</span>
        </button>
        {onReset && (
          <button type="button" className="ax-project-menu-item" data-tone="danger" onClick={() => {
            closeMenu();
            onReset();
          }}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>Reset design</span>
          </button>
        )}
      </div>
      {/* The menu stays open, so the switch can be flipped back while looking at it. */}
      <div className="ax-project-menu-group">
        <button type="button" className="ax-project-menu-item ax-night-shift" aria-pressed={nightShift} onClick={toggleTheme}>
          <Moon size={15} aria-hidden="true" />
          <span>Night shift</span>
          <span className="ax-switch" aria-hidden="true" data-on={nightShift || undefined} />
        </button>
      </div>
    </>
  );

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
        {asPanel ? (
          <>
            <button
              ref={triggerRef}
              type="button"
              aria-controls={menuId}
              aria-expanded={menuOpen}
              className="ax-header-menu-trigger"
              onClick={() => {
                // Open but behind another panel: Menu brings it forward instead of closing it.
                if (menuOpen && isPanelBehind("menu")) setMenuReveal((count) => count + 1);
                else setMenuOpen((open) => !open);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && menuOpen) setMenuOpen(false);
              }}
            >
              <MenuIcon size={15} aria-hidden="true" />
              Menu
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            {/* The menu is a right panel: it steps in front of the panel that was open, which
                comes back when the menu closes. */}
            {menuOpen && menuHost && createPortal(
              <Panel
                id={menuId}
                toolKey="menu"
                revealKey={menuReveal}
                icon={<MenuIcon size={17} aria-hidden="true" />}
                title="Menu"
                closeLabel="Close the menu"
                onClose={() => {
                  // Closed from inside (its close button, Escape): focus goes back to Menu. Closed
                  // because another panel opened: focus stays wherever that left it.
                  if (document.getElementById(menuId)?.contains(document.activeElement)) triggerRef.current?.focus();
                  setMenuOpen(false);
                }}
              >
                <div className="ax-project-menu-body">{menuRows}</div>
              </Panel>,
              menuHost,
            )}
          </>
        ) : (
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
              {menuRows}
            </div>
          </>
        )}
        {runControl}
      </>}
    />
  );
}
