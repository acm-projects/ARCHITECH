"use client";

import { useId, useState, type ReactNode } from "react";

// Shared canvas chrome: the toolbox supplies category buttons; guidance uses one toggle.
// Each caller keeps its own content and project logic outside this wrapper.
export default function CanvasPanel({
  side,
  label,
  icon,
  wide = false,
  rail,
  expanded,
  onExpandedChange,
  children,
}: {
  side: "left" | "right";
  label: string;
  icon: ReactNode;
  wide?: boolean;
  rail?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  // Category selection controls the toolbox's open state. Guidance has no category
  // controller, so it uses the local toggle instead. Both start as icon-only rails.
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded ?? localOpen;
  const setOpen = onExpandedChange ?? setLocalOpen;
  const id = useId();

  return (
    <aside className="ax-canvas-panel" data-side={side} data-wide={wide} aria-label={label}>
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
      {/* Keep content mounted when closed so search and guidance state survive reopening.
          The hidden attribute also removes those controls from keyboard navigation. */}
      <div id={id} className="ax-panel-content" hidden={!open}>
        {children}
      </div>
    </aside>
  );
}
