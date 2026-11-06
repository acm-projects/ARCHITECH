"use client";

import { useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";

export type PanelCollapse = { collapsed: boolean; toggle: () => void };

// Whether a right panel is folded down to its header. The content stays mounted, so typed text
// and open rows survive. A new truthy `revealKey` unfolds it: something outside the panel, like
// a run starting or a design check marker, has just asked to show what is inside.
export function usePanelCollapse(revealKey?: unknown): PanelCollapse {
  const [collapsed, setCollapsed] = useState(false);
  const [seenKey, setSeenKey] = useState(revealKey);
  if (seenKey !== revealKey) {
    setSeenKey(revealKey);
    if (revealKey) setCollapsed(false);
  }
  return { collapsed, toggle: () => setCollapsed((value) => !value) };
}

// The whole header toggles, except for the controls that sit in it.
export function toggleFromHeader(event: MouseEvent<HTMLElement>, toggle: () => void) {
  if (!(event.target as Element).closest("button, input, select, a, label")) toggle();
}

// The one collapse control, in the same place in every panel header.
export function PanelCollapseToggle({ title, collapsed, onToggle }: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="axp-icon-btn axp-collapse"
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${title.toLowerCase()}`}
      aria-expanded={!collapsed}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <ChevronDown size={14} aria-hidden="true" />
    </button>
  );
}
