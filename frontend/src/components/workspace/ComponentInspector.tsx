import { useState } from "react";
import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import { buildPropertyViews } from "../../lib/architecture/componentConfigView";
import { ACTS_AS_LABELS, ACTS_AS_TYPES, actsAsOf } from "../../lib/architecture/customComponents";
import { commitPropertyDraft, resetComponentProperty, setCustomRole } from "../../lib/architecture/propertyEditing";
import { ConfigureCard, ExplainCard } from "./NodeContextUi";
import { TechnologyChooser } from "./TechnologyPicker";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

type ComponentInspectorProps = {
  node: ArchitectureFlowNode;
  onAskArchie?: () => void;
  showReview?: boolean;
  hidden?: boolean;
};

export default function ComponentInspector({ node, onAskArchie, showReview = true, hidden = false }: ComponentInspectorProps) {
  const { getNodes, setNodes, updateNodeData } = useReactFlow<ArchitectureFlowNode, Edge>();
  const { id, data } = node;
  const [reviewOpen, setReviewOpen] = useState(false);

  // Reuse the canvas edits so validation, history, and autosave stay together.
  const setProperty = (key: string, text: string) => {
    const result = commitPropertyDraft(getNodes(), id, key, text);
    if (!result.ok) return { message: result.message };
    if (result.changed) setNodes(result.nodes);
    return null;
  };
  const resetProperty = (key: string) => {
    const result = resetComponentProperty(getNodes(), id, key);
    if (result.ok && result.changed) setNodes(result.nodes);
  };

  return (
    <>
      <div hidden={hidden || reviewOpen}>
        <ConfigureCard
          type={data.type}
          name={data.label}
          onRename={(label) => updateNodeData(id, { label })}
          properties={buildPropertyViews(data.type, data.properties ?? {}, {}, data.implementation)}
          onSetProperty={setProperty}
          onResetProperty={resetProperty}
          technology={
            data.type === "custom" ? (
              <CustomRoleChooser
                value={actsAsOf(data.properties)}
                onChange={(actsAs) => {
                  const result = setCustomRole(getNodes(), id, actsAs);
                  if (result.ok && result.changed) setNodes(result.nodes);
                }}
              />
            ) : (
              <TechnologyChooser nodeId={id} type={data.type} implementation={data.implementation} />
            )
          }
        />
      </div>
      {showReview && (
        <details
          className="ax-inspector-details"
          hidden={hidden}
          open={reviewOpen}
          onToggle={(event) => setReviewOpen(event.currentTarget.open)}
        >
          <summary>Component review</summary>
          <ExplainCard type={data.type} nodeId={id} onAskArchie={onAskArchie} compact />
        </details>
      )}
    </>
  );
}

// What a custom component behaves like. Once chosen it is measured in live metrics and Run
// Design with that role's numbers, which its settings below can then change.
function CustomRoleChooser({ value, onChange }: { value: string | null; onChange: (actsAs: string | null) => void }) {
  return (
    <div className="ax-card-section ax-configure-technology">
      <label className="ax-card-label" htmlFor="ax-custom-role">Acts like</label>
      <select
        id="ax-custom-role"
        className="ax-field mt-1"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        <option value="">Not measured</option>
        {ACTS_AS_TYPES.map((type) => (
          <option key={type} value={type}>{ACTS_AS_LABELS[type]}</option>
        ))}
      </select>
      <p className="ax-tech-basis">
        {value
          ? "Measured like this kind of component. Set its capacity, latency, cost and uptime below."
          : "Choose what it behaves like to include it in live metrics and Run Design."}
      </p>
    </div>
  );
}
