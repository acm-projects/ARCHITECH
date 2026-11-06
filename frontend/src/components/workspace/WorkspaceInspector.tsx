import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BoxSelect, LoaderCircle, Play } from "lucide-react";

import type { CustomTechnology } from "../../lib/projects/customTechnologies";
import ArchitectPanel from "./ai/ArchitectPanel";
import ComponentGlyph from "./ComponentGlyph";
import ComponentInspector from "./ComponentInspector";
import { COMPONENT_CATALOG, FAMILY_COLORS } from "./componentCatalog";
import { usePanelCollapse } from "./PanelCollapse";
import Panel, { PanelGroup, PanelHealth, PanelRow } from "./panel/Panel";
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
  runs: Pick<ReturnType<typeof useRunSession>, "traffic" | "view" | "run" | "state" | "runAtRate" | "setRequestRate">;
};

export function SimulationControl({ panelHost, expanded, onToggle, runs, componentName, onShowResults }: {
  // The Run button stays in the header; its panel joins the right panels.
  panelHost: HTMLElement | null;
  expanded: boolean;
  onToggle: () => void;
  runs: WorkspaceInspectorProps["runs"];
  componentName: (id: string) => string;
  onShowResults: (action: () => void) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const running = runs.view.isRunning;
  // Simulation heads the column, which may be scrolled down to a panel further along it.
  useEffect(() => {
    if (expanded) panelHost?.closest(".ax-widget-stack")?.scrollTo({ top: 0 });
  }, [expanded, running, panelHost]);
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
    {panelHost && createPortal(
      <Panel
        id="ax-run-panel"
        icon={<Play size={17} aria-hidden="true" />}
        title="Simulation"
        status={running ? "Running…" : runs.view.result ? <PanelHealth status={runs.view.result.health.status} /> : undefined}
        revealKey={running}
        hidden={!expanded}
        onClose={() => {
          onToggle();
          anchor.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }}
      >
        <RunPanel view={runs.view} completedRun={runs.state.current} traffic={runs.traffic}
          onRateChange={runs.setRequestRate} onRun={() => onShowResults(runs.run)}
          onRunAtRate={(rate) => onShowResults(() => runs.runAtRate(rate))}
          componentName={componentName} />
      </Panel>,
      panelHost,
    )}
  </div>;
}

export default function WorkspaceInspector({
  projectId,
  nodes, controller, onClearSelection, onApply, customTechnologies,
  guidance,
}: Omit<WorkspaceInspectorProps, "runs">) {
  const { archieOpen, archieRequest, historyOpen, configuring, inspectComponent, closeConfiguration, askArchie, closeArchie, closeHistory } = controller;
  const selectionCollapse = usePanelCollapse();
  const selected = nodes.filter((node) => node.selected);
  const component = selected.length === 1 ? selected[0] : null;
  // A component's panel opens and closes with its configuration.
  const componentCollapse = {
    collapsed: !configuring,
    toggle: () => (configuring ? closeConfiguration() : inspectComponent()),
  };

  return (
    <>
      {component && (
        <Panel
          key={component.id}
          label="Component"
          icon={<ComponentGlyph type={component.data.type} />}
          title={component.data.label}
          status={component.data.label !== COMPONENT_CATALOG[component.data.type].label ? COMPONENT_CATALOG[component.data.type].label : undefined}
          collapse={componentCollapse}
          transient={!configuring}
          closeLabel="Clear component selection"
          onClose={onClearSelection}
        >
          <ComponentInspector node={component} onAskArchie={askArchie} />
        </Panel>
      )}
      {selected.length > 1 && (
        <Panel
          label="Selected components"
          icon={<BoxSelect size={17} aria-hidden="true" />}
          title={`${selected.length} components`}
          collapse={selectionCollapse}
          closeLabel="Clear component selection"
          onClose={onClearSelection}
        >
          <PanelGroup>
            {selected.map((node) => {
              const { family, label: typeLabel } = COMPONENT_CATALOG[node.data.type];
              return (
                <PanelRow
                  key={node.id}
                  item
                  lead={<ComponentGlyph type={node.data.type} style={{ color: FAMILY_COLORS[family] }} />}
                  label={node.data.label}
                  value={node.data.label !== typeLabel ? typeLabel : undefined}
                />
              );
            })}
          </PanelGroup>
        </Panel>
      )}
      {guidance}
      {historyOpen && <HistoryPanel projectId={projectId} onClose={closeHistory} onRestore={onApply} />}
      {archieOpen && (
        <ArchitectPanel
          key={projectId}
          projectId={projectId}
          revealKey={archieRequest}
          onClose={closeArchie}
          onApply={onApply}
          customTechnologies={customTechnologies}
        />
      )}
    </>
  );
}
