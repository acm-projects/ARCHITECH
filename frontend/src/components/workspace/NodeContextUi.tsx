"use client";

import { useState } from "react";

import ComponentGlyph from "./ComponentGlyph";
import {
  COMPONENT_CATALOG,
  FAMILY_COLORS,
  FAMILY_LABELS,
} from "./componentCatalog";
import type { ArchitectureNodeType } from "./nodes/ArchitectureNode";

export type NodePanel = "none" | "ai" | "configure";

const MAX_NAME_LENGTH = 60;

type NodeActionBarProps = {
  panel: NodePanel;
  onAskAi: () => void;
  onConfigure: () => void;
  onDelete: () => void;
};

// `nodrag nopan` keep clicks on the bar from dragging the node or panning the canvas.
export function NodeActionBar({
  panel,
  onAskAi,
  onConfigure,
  onDelete,
}: NodeActionBarProps) {
  return (
    <div className="ax-nodebar nodrag nopan" role="toolbar" aria-label="Component actions">
      <button
        type="button"
        onClick={onAskAi}
        aria-pressed={panel === "ai"}
        className="ax-nodebar-ai"
      >
        Ask AI
      </button>
      <span className="ax-nodebar-sep" aria-hidden="true" />
      <button
        type="button"
        onClick={onConfigure}
        aria-pressed={panel === "configure"}
        className="ax-nodebar-config"
      >
        Configure
      </button>
      <span className="ax-nodebar-sep" aria-hidden="true" />
      <button type="button" onClick={onDelete} className="ax-nodebar-delete">
        Delete
      </button>
    </div>
  );
}

// Static explanation from the component catalog. No AI request is made.
export function ExplainCard({ type }: { type: ArchitectureNodeType }) {
  const { label, description, family } = COMPONENT_CATALOG[type];

  return (
    <div className="ax-card ax-popover nodrag nopan nowheel">
      <p className="ax-card-eyebrow">{FAMILY_LABELS[family]}</p>
      <div className="mt-1 flex items-center gap-2">
        <ComponentGlyph
          type={type}
          className="h-3 w-3"
          style={{ color: FAMILY_COLORS[family] }}
        />
        <p className="ax-card-title">{label}</p>
      </div>
      <p className="ax-card-body">{description}</p>
      <div className="ax-card-section">
        <button
          type="button"
          disabled
          title="AI explanations are not connected yet"
          className="ax-card-link mt-0!"
        >
          Ask AI →
        </button>
      </div>
    </div>
  );
}

type ConfigureCardProps = {
  type: ArchitectureNodeType;
  name: string;
  onRename: (name: string) => void;
};

// Same rule as the old Properties panel: rename while typing with non-empty names, and
// snap back to the last valid name if the field is left empty.
export function ConfigureCard({ type, name, onRename }: ConfigureCardProps) {
  const [draft, setDraft] = useState(name);

  return (
    <div className="ax-card ax-popover nodrag nopan nowheel">
      <p className="ax-card-eyebrow">Configure</p>

      <label htmlFor="node-name" className="ax-card-label mt-3 block">
        Name
      </label>
      <input
        id="node-name"
        value={draft}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.target.value.trim();
          if (next) onRename(next);
        }}
        onBlur={() => setDraft(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="ax-field"
      />

      <div className="ax-card-section">
        <p className="ax-card-label">Type</p>
        <p className="mt-1 text-[10px]">{COMPONENT_CATALOG[type].label}</p>
      </div>
    </div>
  );
}
