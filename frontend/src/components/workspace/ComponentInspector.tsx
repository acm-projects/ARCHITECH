import { useContext, useState } from "react";
import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import { STALE_NOTICE, explainNodeInView } from "../../lib/architecture/archie/view";
import { buildPropertyViews } from "../../lib/architecture/componentConfigView";
import { ACTS_AS_LABELS, ACTS_AS_TYPES, actsAsOf } from "../../lib/architecture/customComponents";
import { commitPropertyDraft, resetComponentProperty, setCustomRole } from "../../lib/architecture/propertyEditing";
import { ArchieContext } from "./ArchieContext";
import { COMPONENT_CATALOG } from "./componentCatalog";
import { ConfigureCard } from "./NodeContextUi";
import { PanelDetail, PanelField, PanelGroup, PanelLink, PanelText } from "./panel/Panel";
import { TechnologyDetail, TechnologyRow } from "./TechnologyPicker";
import type { ArchitectureFlowNode, ArchitectureNodeType } from "./nodes/ArchitectureNode";

type ComponentInspectorProps = {
  node: ArchitectureFlowNode;
  onAskArchie?: () => void;
  showReview?: boolean;
};

// A component's settings. The technology and the review are details of their own.
export default function ComponentInspector({ node, onAskArchie, showReview = true }: ComponentInspectorProps) {
  const { getNodes, setNodes, updateNodeData } = useReactFlow<ArchitectureFlowNode, Edge>();
  const { id, data } = node;
  const [detail, setDetail] = useState<"technology" | "review" | null>(null);

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
      {/* Stays mounted, so a half-typed value survives a look at a detail. */}
      <div hidden={detail !== null}>
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
              <TechnologyRow nodeId={id} type={data.type} implementation={data.implementation} onOpen={() => setDetail("technology")} />
            )
          }
        />
        {showReview && (
          <PanelGroup>
            <PanelLink label="Component review" onClick={() => setDetail("review")} />
          </PanelGroup>
        )}
      </div>
      {detail === "technology" && (
        <TechnologyDetail nodeId={id} type={data.type} implementation={data.implementation} onBack={() => setDetail(null)} />
      )}
      {detail === "review" && (
        <PanelDetail title="Component review" onBack={() => setDetail(null)}>
          <ComponentReview type={data.type} nodeId={id} onAskArchie={onAskArchie} />
        </PanelDetail>
      )}
    </>
  );
}

// What the component is and, in the free workspace, Archie's explanation of it from the latest
// run. Archie is deterministic here: he explains the evaluation's own findings, and no AI
// request is made.
function ComponentReview({ type, nodeId, onAskArchie }: {
  type: ArchitectureNodeType;
  nodeId: string;
  onAskArchie?: () => void;
}) {
  const archie = useContext(ArchieContext);
  const answer = archie ? explainNodeInView(archie(), nodeId) : null;
  const reviewed = answer && (answer.status === "findings" || answer.status === "no-findings") ? answer : null;
  return (
    <>
      <PanelText>{COMPONENT_CATALOG[type].description}</PanelText>
      {answer && !reviewed && "message" in answer && <PanelText>{answer.message}</PanelText>}
      {reviewed?.stale && <PanelText role="status">{STALE_NOTICE}</PanelText>}
      {reviewed && <PanelText>{reviewed.summary}</PanelText>}
      {reviewed?.explanations.slice(0, 2).map((explanation) => (
        <PanelGroup key={explanation.id} title={<span title={[explanation.why, explanation.impact, explanation.tradeoff].filter(Boolean).join("\n")}>{explanation.title}</span>}>
          <PanelText>{explanation.what}</PanelText>
          <PanelText>{explanation.suggestion}</PanelText>
        </PanelGroup>
      ))}
      {onAskArchie && (
        <PanelGroup>
          <PanelLink label="Ask Archie" onClick={onAskArchie} />
        </PanelGroup>
      )}
    </>
  );
}

// What a custom component behaves like. Once chosen it is measured in live metrics and Run
// Design with that role's numbers, which its settings below can then change.
function CustomRoleChooser({ value, onChange }: { value: string | null; onChange: (actsAs: string | null) => void }) {
  return (
    <>
      <PanelField
        label="Acts like"
        htmlFor="ax-custom-role"
        title={value ? "Measured like this kind of component." : undefined}
        control={
          <select
            id="ax-custom-role"
            className="axp-input axp-input-end"
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
          >
            <option value="">Not measured</option>
            {ACTS_AS_TYPES.map((type) => (
              <option key={type} value={type}>{ACTS_AS_LABELS[type]}</option>
            ))}
          </select>
        }
      />
      {!value && <PanelText>Choose what it behaves like to include it in live metrics and Run.</PanelText>}
    </>
  );
}
