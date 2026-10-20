import { useState } from "react";
import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import { buildPropertyViews } from "../../lib/architecture/componentConfigView";
import { commitPropertyDraft, resetComponentProperty } from "../../lib/architecture/propertyEditing";
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
          properties={buildPropertyViews(data.type, data.properties, {}, data.implementation)}
          onSetProperty={setProperty}
          onResetProperty={resetProperty}
          technology={
            <TechnologyChooser nodeId={id} type={data.type} implementation={data.implementation} />
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
