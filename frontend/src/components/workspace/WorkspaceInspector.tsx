import { useId, useRef, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, Play, X } from "lucide-react";

import type { CustomTechnology } from "../../lib/projects/customTechnologies";
import ArchitectPanel from "./ai/ArchitectPanel";
import ComponentGlyph from "./ComponentGlyph";
import ComponentInspector from "./ComponentInspector";
import { COMPONENT_CATALOG, FAMILY_LABELS } from "./componentCatalog";
import RunPanel from "./RunPanel";
import HistoryPanel from "./history/HistoryPanel";
import type { WorkspaceInspectorController } from "./useWorkspaceInspector";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import type { useRunSession } from "./useRunSession";
import "./workspace-inspector.css";

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

export function SimulationControl({ expanded, onToggle, runs, componentName, onShowResults }: {
  expanded: boolean;
  onToggle: () => void;
  runs: WorkspaceInspectorProps["runs"];
  componentName: (id: string) => string;
  onShowResults: (action: () => void) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  return <div className="ax-simulation-anchor" ref={anchor} onKeyDown={(event) => {
    if (event.key === "Escape" && expanded) {
      event.stopPropagation();
      onToggle();
      anchor.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }}>
    <button type="button" className="ax-run-button" aria-label="Run simulation"
      aria-controls="ax-run-panel" aria-expanded={expanded} aria-busy={runs.view.isRunning}
      disabled={runs.view.isRunning} onClick={() => onShowResults(runs.run)}>
      {runs.view.isRunning ? <LoaderCircle size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      Run
    </button>
    <section id="ax-run-panel" className="ax-inspector ax-simulation-panel" aria-label="Simulation" hidden={!expanded}>
      <div className="ax-inspector-frame">
        <div className="ax-panel-heading">
          <h2>Simulation</h2>
          <button type="button" className="ax-icon-btn" aria-label="Close simulation" onClick={() => {
            onToggle();
            anchor.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }}><X size={14} aria-hidden="true" /></button>
        </div>
        <RunPanel view={runs.view} completedRun={runs.state.current} traffic={runs.traffic}
          onRateChange={runs.setRequestRate} onRun={() => onShowResults(runs.run)}
          onRunAtRate={(rate) => onShowResults(() => runs.runAtRate(rate))}
          componentName={componentName} />
      </div>
    </section>
  </div>;
}

export default function WorkspaceInspector({
  projectId,
  nodes, controller, onClearSelection, onApply, customTechnologies,
  guidance,
}: WorkspaceInspectorProps) {
  const { archieOpen, historyOpen, configuring, inspectComponent, closeConfiguration, askArchie, closeArchie, closeHistory } = controller;
  const archieContentId = useId();
  const selected = nodes.filter((node) => node.selected);
  const component = selected.length === 1 ? selected[0] : null;
  const selectionKey = selected.map((node) => node.id).join("\0");
  const title = component?.data.label ?? (selected.length ? `${selected.length} components` : "System");

  const panelExpanded = archieOpen || historyOpen || configuring || selected.length > 1 || Boolean(guidance);
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
      {!configuring && <ChevronDown size={13} aria-hidden="true" />}
    </summary>
  );

  // The canvas tools live on the bottom bar; this left panel appears only when it has
  // something to show (a selection, Archie, history or challenge guidance).
  if (!component && selected.length < 2 && !guidance && !archieOpen && !historyOpen) return null;

  return (
    <aside
      className="ax-canvas-panel ax-inspector"
      data-side="right"
      data-expanded={panelExpanded}
      data-selection={selected.length > 0}
      data-archie={archieOpen || undefined}
      data-detail={configuring || historyOpen || undefined}
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
        <section
          id={archieContentId}
          className="ax-inspector-section"
          aria-label="Ask Archie"
          hidden={!archieOpen}
        >
          {archieOpen && (
            <div className="ax-inspector-archie" data-architect>
              <ArchitectPanel
                key={projectId}
                projectId={projectId}
                onClose={closeArchie}
                onApply={onApply}
                customTechnologies={customTechnologies}
              />
            </div>
          )}
        </section>
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
