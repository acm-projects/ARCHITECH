"use client";

import { useContext, useState } from "react";

import { STALE_NOTICE, explainNodeInView } from "../../lib/architecture/archie/view";
import type { PropertyView } from "../../lib/architecture/componentConfigView";
import {
  formatPropertyValue,
  type ComponentPropertyKey,
} from "../../lib/architecture/componentProperties";
import { finishDraft } from "../../lib/architecture/propertyEditing";
import { ArchieContext } from "./ArchieContext";
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

// Explanation of a component: its catalog description, and, in the free workspace, Archie's
// explanation of it from the latest Run Design. Archie is deterministic: it explains the
// evaluation's own findings, and no AI request is made.
export function ExplainCard({ type, nodeId }: { type: ArchitectureNodeType; nodeId: string }) {
  const { label, description, family } = COMPONENT_CATALOG[type];
  const archie = useContext(ArchieContext);
  const answer = archie ? explainNodeInView(archie(), nodeId) : null;

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
      {answer && (
        <div className="ax-card-section">
          {(answer.status === "unavailable" || answer.status === "not-analyzed") && (
            <p className="ax-card-label">{answer.message}</p>
          )}
          {(answer.status === "findings" || answer.status === "no-findings") && (
            <>
              {answer.stale && (
                <p role="status" className="ax-card-label">
                  {STALE_NOTICE}
                </p>
              )}
              <p className="ax-card-body">{answer.summary}</p>
              {answer.explanations.slice(0, 2).map((explanation) => (
                <div key={explanation.id} className="mt-2">
                  <p className="ax-card-title">{explanation.title}</p>
                  <p className="ax-card-body">
                    <b>What</b> {explanation.what}
                  </p>
                  <p className="ax-card-body">
                    <b>Why</b> {explanation.why}
                  </p>
                  <p className="ax-card-body">
                    <b>Impact</b> {explanation.impact}
                  </p>
                  <p className="ax-card-body">
                    <b>Suggestion</b> {explanation.suggestion}
                  </p>
                  {explanation.tradeoff && (
                    <p className="ax-card-body">
                      <b>Tradeoff</b> {explanation.tradeoff}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
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
  // The settings this component has (none for a client).
  properties: PropertyView[];
  // Commits a finished edit; returns why it was refused, or null when it was accepted.
  onSetProperty: (key: ComponentPropertyKey, text: string) => { message: string } | null;
  onResetProperty: (key: ComponentPropertyKey) => void;
};

type PropertyFieldProps = {
  type: ArchitectureNodeType;
  view: PropertyView;
  onCommit: ConfigureCardProps["onSetProperty"];
  onReset: ConfigureCardProps["onResetProperty"];
};

// One setting. What is typed stays in this field as text and the graph is only changed when
// the edit is finished: Enter, or leaving the field. A half-typed or invalid value never
// reaches the graph. Escape drops the text. Enter on an invalid value keeps it on screen with
// the reason; leaving the field with an invalid value puts the current value back.
function PropertyField({ type, view, onCommit, onReset }: PropertyFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = `node-setting-${view.key}`;

  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  const finish = (leaving: boolean) => {
    if (draft === null) return;
    const outcome = finishDraft(type, view.key, draft, view.value, leaving);
    if (outcome.action === "discard") return cancel();
    if (outcome.action === "keep-editing") return setError(outcome.message);
    const failure = onCommit(view.key, draft);
    if (!failure) return cancel();
    if (leaving) cancel();
    else setError(failure.message);
  };

  return (
    <div className="mt-3">
      <label htmlFor={inputId} className="ax-card-label block" title={view.description}>
        {view.label}
      </label>
      <input
        id={inputId}
        value={draft ?? formatPropertyValue(view.value)}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error !== null}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(false);
          // With text being edited, Escape only drops it and does not also close the card.
          if (event.key === "Escape" && draft !== null) {
            event.stopPropagation();
            cancel();
          }
        }}
        className="ax-field"
      />
      {error && (
        <p role="alert" className="ax-card-label mt-1">
          {error}
        </p>
      )}
      <p className="ax-card-label mt-1">
        Default {formatPropertyValue(view.defaultValue)}
        {view.unit ? ` ${view.unit}` : ""}
        {view.canReset && (
          <>
            {" · "}
            <button type="button" onClick={() => onReset(view.key)} className="ax-card-link mt-0!">
              Reset
            </button>
          </>
        )}
      </p>
    </div>
  );
}

// Same rule as the old Properties panel: rename while typing with non-empty names, and
// snap back to the last valid name if the field is left empty.
export function ConfigureCard({
  type,
  name,
  onRename,
  properties,
  onSetProperty,
  onResetProperty,
}: ConfigureCardProps) {
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

      {properties.length > 0 && (
        <div className="ax-card-section">
          {properties.map((view) => (
            <PropertyField
              key={view.key}
              type={type}
              view={view}
              onCommit={onSetProperty}
              onReset={onResetProperty}
            />
          ))}
        </div>
      )}
    </div>
  );
}
