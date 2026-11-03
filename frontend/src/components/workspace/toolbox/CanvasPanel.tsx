"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Canvas chrome for the toolbox rail and flyout; content and project logic stay outside.
export default function CanvasPanel({
  side,
  label,
  icon,
  wide = false,
  rail,
  expanded,
  onExpandedChange,
  hoverFlyout = false,
  children,
}: {
  side: "left" | "right";
  label: string;
  icon: ReactNode;
  wide?: boolean;
  rail?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  hoverFlyout?: boolean;
  children: ReactNode;
}) {
  // Category selection controls the toolbox's open state; an optional local toggle
  // supports callers without a category rail.
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded ?? localOpen;
  const setOpen = onExpandedChange ?? setLocalOpen;
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  return (
    <aside className="ax-canvas-panel" data-side={side} data-wide={wide} aria-label={label}
      data-hover-flyout={hoverFlyout || undefined}
      onPointerEnter={cancelClose}
      onPointerLeave={!hoverFlyout ? undefined : (event) => {
        if (event.pointerType !== "mouse") return;
        const panel = event.currentTarget;
        cancelClose();
        // Allow diagonal travel into the flyout without a flash of closed content.
        closeTimer.current = setTimeout(() => {
          closeTimer.current = null;
          if (!panel.matches(":hover") && !panel.contains(document.activeElement)) setOpen(false);
        }, 150);
      }}
      onBlur={!hoverFlyout ? undefined : (event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          cancelClose();
          event.currentTarget.querySelector<HTMLButtonElement>('.ax-panel-rail button[aria-expanded="true"]')?.focus();
          setOpen(false);
        }
      }}>
      <div className="ax-panel-rail">
        {rail}
      {!rail && <button
        type="button"
        className="ax-panel-handle"
        aria-label={`${open ? "Collapse" : "Expand"} ${label.toLowerCase()}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span className="ax-rail-name" aria-hidden="true">{label}</span>
      </button>}
      </div>
      {/* Keep content mounted when closed so search state survives reopening.
          The hidden attribute also removes those controls from keyboard navigation. */}
      <div id={id} className="ax-panel-content" hidden={!open}>
        {children}
      </div>
    </aside>
  );
}
