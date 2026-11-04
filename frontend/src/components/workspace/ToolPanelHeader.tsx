"use client";

import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";

// The header every bottom-bar tool panel uses (Live estimates, Design check), so they read
// and behave alike: icon, title, short state on the right, optional controls, close.
export default function ToolPanelHeader({
  toolKey,
  icon,
  title,
  meta,
  metaTitle,
  actions,
  onClose,
  headingRef,
}: {
  // Matches the bar button's data-tool, which gets focus back when the panel closes.
  toolKey: string;
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  metaTitle?: string;
  actions?: ReactNode;
  onClose: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="ax-panel-heading ax-tool-head">
      <span className="ax-tool-head-icon">{icon}</span>
      <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
      {meta !== undefined && <span className="ax-tool-head-meta" title={metaTitle}>{meta}</span>}
      {actions}
      <button
        type="button"
        className="ax-icon-btn"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={(event) => {
          event.currentTarget
            .closest(".ax-canvas-panel")
            ?.querySelector<HTMLButtonElement>(`.ax-panel-rail [data-tool="${toolKey}"]`)
            ?.focus();
          onClose();
        }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </header>
  );
}
