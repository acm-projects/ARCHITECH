"use client";

import { useState } from "react";

import {
  NODE_TYPE_LABELS,
  type ArchitectureFlowNode,
} from "./nodes/ArchitectureNode";

const MAX_NAME_LENGTH = 60;

type PropertiesPanelProps = {
  selectedNode: ArchitectureFlowNode | undefined;
  onRenameNode: (nodeId: string, name: string) => void;
  onDeleteNode: (nodeId: string) => void;
};

type NodeNameFieldProps = {
  name: string;
  onRename: (name: string) => void;
};

// The node is renamed while typing, but only with non-empty names. If the field is
// left empty, it snaps back to the last valid name instead of renaming the node to "".
function NodeNameField({ name, onRename }: NodeNameFieldProps) {
  const [draft, setDraft] = useState(name);

  return (
    <input
      id="component-name"
      value={draft}
      maxLength={MAX_NAME_LENGTH}
      aria-label="Component name"
      onChange={(event) => {
        setDraft(event.target.value);
        const nextName = event.target.value.trim();
        if (nextName) onRename(nextName);
      }}
      onBlur={() => setDraft(name)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="ax-field"
    />
  );
}

export default function PropertiesPanel({
  selectedNode,
  onRenameNode,
  onDeleteNode,
}: PropertiesPanelProps) {
  return (
    <aside className="max-h-48 shrink-0 overflow-y-auto border-t border-(--ax-line) bg-(--ax-surface) md:max-h-none md:w-70 md:border-l md:border-t-0">
      <h2 className="px-5 pb-6 pt-7">
        <span className="ax-label block">Properties</span>
        <span className="ax-label mt-2 block text-(--ax-ink)">
          / {selectedNode ? "01" : "00"}
        </span>
      </h2>

      {selectedNode ? (
        <div className="px-5">
          <p className="wrap-break-word text-[32px] font-light leading-[1.05] tracking-[-0.02em] text-(--ax-ink)">
            {NODE_TYPE_LABELS[selectedNode.data.type]}
          </p>
          <p className="mt-3 wrap-break-word text-[15px] text-(--ax-muted)">
            {selectedNode.data.label}
          </p>

          <dl className="mt-8 space-y-6 border-t border-(--ax-ink) pt-6">
            <div>
              <dt className="ax-label">Type</dt>
              <dd className="mt-3 text-[13px] text-(--ax-ink)">
                {NODE_TYPE_LABELS[selectedNode.data.type]}
              </dd>
            </div>
            <div className="border-t border-(--ax-line) pt-6">
              <dt className="ax-label">
                <label htmlFor="component-name">Name</label>
              </dt>
              <dd className="mt-1">
                <NodeNameField
                  key={selectedNode.id}
                  name={selectedNode.data.label}
                  onRename={(name) => onRenameNode(selectedNode.id, name)}
                />
              </dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-(--ax-line) py-6">
            <button
              type="button"
              onClick={() => onDeleteNode(selectedNode.id)}
              className="ax-delete"
            >
              Delete component
            </button>
          </div>
        </div>
      ) : (
        <p className="px-5 text-[13px] text-(--ax-muted)">
          Select a component to configure it.
        </p>
      )}
    </aside>
  );
}
