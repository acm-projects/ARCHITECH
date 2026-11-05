"use client";

import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";

// Gives focus back to the tool's bottom-bar button, which stays mounted when its panel closes.
function focusToolButton(toolKey: string) {
  document.querySelector<HTMLButtonElement>(`.ax-panel-rail [data-tool="${toolKey}"]`)?.focus();
}

// The surface of a tool opened from the bottom bar (Live estimates, Design check).
export function ToolWidget({ toolKey, onClose, children }: {
  toolKey: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="ax-canvas-panel ax-inspector ax-tool-widget ax-widget" onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      focusToolButton(toolKey);
      onClose();
    }}>
      {children}
    </div>
  );
}

// The header every tool panel uses, so they read and behave alike: icon, title, short state
// on the right, optional controls, close.
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
        onClick={() => {
          focusToolButton(toolKey);
          onClose();
        }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </header>
  );
}
