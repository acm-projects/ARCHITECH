import { useContext, useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, CircleAlert, Clock3, LoaderCircle, MessageSquare, Play, X } from "lucide-react";

import type { CustomTechnology } from "../../lib/projects/customTechnologies";
import ArchitectPanel from "./ai/ArchitectPanel";
import { ArchieEnabledContext } from "./ArchieContext";
import ComponentGlyph from "./ComponentGlyph";
import ComponentInspector from "./ComponentInspector";
import { COMPONENT_CATALOG, FAMILY_LABELS } from "./componentCatalog";
import RunPanel from "./RunPanel";
import HistoryPanel from "./history/HistoryPanel";
import type { InspectorSectionId } from "./inspectorState";
import type { WorkspaceInspectorController } from "./useWorkspaceInspector";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import type { useRunSession } from "./useRunSession";
import "./workspace-inspector.css";

const REVIEW_STATUS_LABELS = {
  idle: "Not run",
  analyzing: "Running…",
  ready: "Tested",
  stale: "Out of date",
  error: "Failed",
};

type WorkspaceInspectorProps = {
  projectId: string;
  nodes: ArchitectureFlowNode[];
  controller: WorkspaceInspectorController;
  onClearSelection: () => void;
  onApply: ComponentProps<typeof ArchitectPanel>["onApply"];
  customTechnologies?: readonly CustomTechnology[];
  guidance: ReactNode;
  testingEnabled: boolean;
  runs: Pick<ReturnType<typeof useRunSession>, "traffic" | "view" | "run" | "state" | "runAtRate" | "setRequestRate">;
};

function InspectorSection({ id, title, meta, state, icon, expanded, disabled, onToggle, children }: {
  id?: string;
  title: string;
  meta?: string;
  state?: keyof typeof REVIEW_STATUS_LABELS;
  icon?: ReactNode;
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = useId();
  const statusId = useId();
  const StatusIcon = state === "analyzing" ? LoaderCircle : state === "stale" ? Clock3 : state === "error" ? CircleAlert : null;
  return (
    <section id={id} className="ax-inspector-section" aria-label={title} data-expanded={expanded} data-run-state={state}>
      <div className="ax-inspector-section-header">
        <h2>
          <button type="button" className="ax-inspector-section-toggle" aria-label={title} aria-describedby={meta ? statusId : undefined} aria-expanded={expanded} aria-controls={contentId} onClick={onToggle} disabled={disabled} onKeyDown={(event) => {
            if (event.key === "Escape" && expanded) {
              event.stopPropagation();
              onToggle();
            }
          }}>
            <span className="ax-inspector-tool-icon">
              {icon}
              {/* Only states needing attention mark the collapsed tool; completion is not a health verdict. */}
              {StatusIcon && <StatusIcon className="ax-inspector-state-icon" size={12} aria-hidden="true" />}
            </span>
            <span className="ax-inspector-section-label">{title}</span>
            <span className="ax-inspector-status">
              {meta && <small id={statusId}>{meta}</small>}
              <ChevronDown size={13} aria-hidden="true" />
            </span>
          </button>
        </h2>
      </div>
      <div id={contentId} className="ax-inspector-section-content" hidden={!expanded}>{children}</div>
    </section>
  );
}

export default function WorkspaceInspector({
  projectId,
  nodes, controller, onClearSelection, onApply, customTechnologies,
  guidance, testingEnabled, runs,
}: WorkspaceInspectorProps) {
  const { archieOpen, historyOpen, configuring, section: activeSection, inspectComponent, closeConfiguration, askArchie, closeArchie, closeHistory, toggleSection, showResults } = controller;
  const archieEnabled = useContext(ArchieEnabledContext);
  const selected = nodes.filter((node) => node.selected);
  const component = selected.length === 1 ? selected[0] : null;
  const selectionKey = selected.map((node) => node.id).join("\0");
  const title = component?.data.label ?? (selected.length ? `${selected.length} components` : "System");
  const componentName = (id: string) => nodes.find((node) => node.id === id)?.data.label ?? id;

  const expanded = (section: InspectorSectionId) => !archieOpen && !historyOpen && selected.length === 0 && activeSection === section;
  const panelExpanded = archieOpen || historyOpen || configuring || selected.length > 1 || Boolean(guidance)
    || (testingEnabled && selected.length === 0 && activeSection !== null);
  const reviewStatus = REVIEW_STATUS_LABELS[runs.view.runButtonState];
  const selectionHeader = (
    <summary className="ax-inspector-header" onClick={(event) => {
      if (component) {
        event.preventDefault();
        if (configuring) closeConfiguration();
        else inspectComponent();
      } else if (archieOpen) {
        event.preventDefault();
        closeArchie();
      }
    }}>
      <div className="ax-inspector-heading">
        {component && <ComponentGlyph type={component.data.type} />}
        <div>
          <h2 className="ax-inspector-title">{title}</h2>
          <p className="ax-inspector-meta">
            {component ? FAMILY_LABELS[COMPONENT_CATALOG[component.data.type].family] : "Selection"}
          </p>
        </div>
      </div>
      {/* Clearing selection must not also toggle the section summary. */}
      <button type="button" className="ax-icon-btn" aria-label="Clear component selection" onClick={(event) => {
        event.stopPropagation();
        onClearSelection();
      }}>
        <X size={14} aria-hidden="true" />
      </button>
      <ChevronDown size={13} aria-hidden="true" />
    </summary>
  );

  return (
    <aside
      className="ax-canvas-panel ax-inspector"
      data-side="right"
      data-expanded={panelExpanded}
      data-selection={selected.length > 0}
      aria-label="Architecture inspector"
    >
      <div className="ax-inspector-frame">
        {component ? (
          <details key={selectionKey} className="ax-inspector-section ax-inspector-component" aria-label="Component" data-archie-open={archieOpen} open={configuring}>
            {selectionHeader}
            <ComponentInspector key={component.id} node={component} onAskArchie={askArchie} hidden={!configuring || archieOpen || historyOpen} />
          </details>
        ) : selected.length > 1 && (
          <details key={selectionKey} className="ax-inspector-section" aria-label="Selected components" open>
            {selectionHeader}
            <ul className="ax-inspector-selection">
              {selected.map((node) => (
                <li key={node.id}>
                  <ComponentGlyph type={node.data.type} />
                  <span>{node.data.label}<small>{COMPONENT_CATALOG[node.data.type].label}</small></span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {guidance && <section className="ax-inspector-section ax-inspector-guidance" aria-label="Challenge">{guidance}</section>}
        {/* Tool buttons stay reachable while their content is collapsed. */}
        {testingEnabled && (
          <InspectorSection id="ax-run-panel" title="Run" icon={<Play size={15} aria-hidden="true" />} meta={reviewStatus} state={runs.view.runButtonState} expanded={expanded("run")}
            onToggle={() => toggleSection("run")}>
            <RunPanel view={runs.view} completedRun={runs.state.current} traffic={runs.traffic}
              onRateChange={runs.setRequestRate}
              onRun={() => showResults(runs.run)}
              onRunAtRate={(rate) => showResults(() => runs.runAtRate(rate))}
              componentName={componentName} />
          </InspectorSection>
        )}
        <InspectorSection title="Ask Archie" icon={<MessageSquare size={15} aria-hidden="true" />} expanded={archieOpen} disabled={!archieEnabled}
          onToggle={archieOpen ? closeArchie : askArchie}>
          {archieOpen && (
            <div className="ax-inspector-archie" data-architect>
              <ArchitectPanel
                key={projectId}
                projectId={projectId}
                embedded
                onClose={closeArchie}
                onApply={onApply}
                customTechnologies={customTechnologies}
              />
            </div>
          )}
        </InspectorSection>
        {historyOpen && (
          <section className="ax-inspector-section" aria-label="History">
            <div className="ax-inspector-archie">
              <HistoryPanel projectId={projectId} onClose={closeHistory} onRestore={onApply} />
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
