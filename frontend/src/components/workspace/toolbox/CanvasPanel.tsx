"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";

// Canvas chrome for the toolbox rail and flyout; content and project logic stay outside.
export default function CanvasPanel({
  side,
  label,
  icon,
  wide = false,
  rail,
  expanded,
  onExpandedChange,
  flyoutOffset,
  children,
}: {
  side: "left" | "right";
  label: string;
  icon: ReactNode;
  wide?: boolean;
  rail?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  flyoutOffset?: number;
  children: ReactNode;
}) {
  // Category selection controls the toolbox's open state; an optional local toggle
  // supports callers without a category rail.
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded ?? localOpen;
  const setOpen = onExpandedChange ?? setLocalOpen;
  const id = useId();

  return (
    <aside className="ax-canvas-panel" data-side={side} data-wide={wide} aria-label={label}
      data-hover-flyout={flyoutOffset !== undefined || undefined}
      style={flyoutOffset === undefined ? undefined : { "--ax-flyout-offset": `${flyoutOffset}px` } as CSSProperties}
      onPointerLeave={flyoutOffset === undefined ? undefined : (event) => {
        if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={flyoutOffset === undefined ? undefined : (event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) setOpen(false);
      }}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
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
