import { useId, useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";

import type { CustomTechnology } from "../../lib/projects/customTechnologies";
import ArchitectPanel, { ArchitectToggle } from "./ai/ArchitectPanel";
import ComponentGlyph from "./ComponentGlyph";
import ComponentInspector from "./ComponentInspector";
import { COMPONENT_CATALOG, FAMILY_LABELS } from "./componentCatalog";
import MetricsPanel from "./MetricsPanel";
import { ExportButton } from "./ExportButton";
import HistoryPanel, { HistoryToggle } from "./history/HistoryPanel";
import type { InspectorSectionId } from "./inspectorState";
import type { WorkspaceInspectorController } from "./useWorkspaceInspector";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import type { useRunSession } from "./useRunSession";
import "./workspace-inspector.css";

const REVIEW_STATUS_LABELS = {
  idle: "Not run",
  analyzing: "Running…",
  ready: "Ready",
  stale: "Out of date",
  error: "Failed",
};

type WorkspaceInspectorProps = {
  projectId: string;
  projectTitle: string;
  nodes: ArchitectureFlowNode[];
  controller: WorkspaceInspectorController;
  runSettingsHeight: number;
  onConfigureRun: () => void;
  onClearSelection: () => void;
  onApply: ComponentProps<typeof ArchitectPanel>["onApply"];
  customTechnologies?: readonly CustomTechnology[];
  guidance: ReactNode;
  testingEnabled: boolean;
  runs: Pick<ReturnType<typeof useRunSession>, "traffic" | "view" | "run" | "state">;
};

function InspectorSection({ title, meta, expanded, onToggle, children }: {
  title: string;
  meta?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <section className="ax-inspector-section" aria-label={title}>
      <div className="ax-inspector-section-header">
        <h2>
          <button type="button" className="ax-inspector-section-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle}>
            <span>{title}</span>
            {meta && <small>{meta}</small>}
            <ChevronDown size={13} aria-hidden="true" />
          </button>
        </h2>
      </div>
      <div id={contentId} hidden={!expanded}>{children}</div>
    </section>
  );
}

function useInspectorLayout(runSettingsHeight: number) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ canvasHeight: 0, contentHeight: 0 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = frame?.closest<HTMLElement>(".ax-workspace-canvas");
    if (!frame || !canvas) return;
    const measure = () => setBounds((current) => {
      const canvasHeight = canvas.clientHeight;
      // Remember the expanded layout so folding content cannot trigger an unfold loop.
      const contentHeight = runSettingsHeight === 0 ? frame.scrollHeight : current.contentHeight;
      return current.canvasHeight === canvasHeight && current.contentHeight === contentHeight
        ? current : { canvasHeight, contentHeight };
    });
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(canvas);
    measure();
    return () => observer.disconnect();
  }, [runSettingsHeight]);

  // Keep section entry points visible when settings and expanded content cannot both fit.
  const compact = runSettingsHeight > 0 && bounds.contentHeight > bounds.canvasHeight - runSettingsHeight - 32;
  return { frameRef, compact };
}

export default function WorkspaceInspector({
  projectId, projectTitle,
  nodes, controller, runSettingsHeight, onConfigureRun, onClearSelection, onApply, customTechnologies,
  guidance, testingEnabled, runs,
}: WorkspaceInspectorProps) {
  const { archieOpen, historyOpen, configuring, section: activeSection, inspectComponent, closeConfiguration, askArchie, closeArchie, openHistory, closeHistory, toggleSection, showResults } = controller;
  const { frameRef, compact } = useInspectorLayout(runSettingsHeight);
  const selected = nodes.filter((node) => node.selected);
  const component = selected.length === 1 ? selected[0] : null;
  const selectionKey = selected.map((node) => node.id).join("\0");
  const title = component?.data.label ?? (selected.length ? `${selected.length} components` : "System");
  const componentName = (id: string) => nodes.find((node) => node.id === id)?.data.label ?? id;

  const expanded = (section: InspectorSectionId) => !compact && !archieOpen && !historyOpen && selected.length === 0 && activeSection === section;
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
      data-run-settings-open={runSettingsHeight > 0}
      style={{ "--ax-run-settings-height": `${runSettingsHeight}px` } as CSSProperties}
      aria-label="Architecture inspector"
    >
      <div className="ax-panel-content ax-inspector-frame" ref={frameRef}>
        <div className="ax-inspector-body">
          {component ? (
            <details key={selectionKey} className="ax-inspector-section ax-inspector-component" aria-label="Component" data-archie-open={archieOpen} open={configuring && !compact}>
              {selectionHeader}
              <ComponentInspector key={component.id} node={component} onAskArchie={askArchie} hidden={!configuring || archieOpen || historyOpen || compact} />
            </details>
          ) : selected.length > 1 && (
            <details key={selectionKey} className="ax-inspector-section" aria-label="Selected components" open>
              {selectionHeader}
              <ul className="ax-inspector-selection" hidden={compact}>
                {selected.map((node) => (
                  <li key={node.id}>
                    <ComponentGlyph type={node.data.type} />
                    <span>{node.data.label}<small>{COMPONENT_CATALOG[node.data.type].label}</small></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {guidance && <section className="ax-inspector-section" aria-label="Challenge">{guidance}</section>}
          {testingEnabled && (
            <>
              <InspectorSection
                title="Metrics"
                meta={reviewStatus}
                expanded={expanded("metrics")}
                onToggle={() => toggleSection("metrics")}
              >
                <MetricsPanel
                  view={runs.view}
                  completedRun={runs.state.current}
                  onRun={() => showResults(runs.run)}
                  onConfigureRun={onConfigureRun}
                  liveTraffic={runs.traffic}
                  componentName={componentName}
                />
              </InspectorSection>
            </>
          )}
        </div>

        <ArchitectToggle open={archieOpen && !compact} onToggle={askArchie} />
        <div className="ax-inspector-project-actions">
          <HistoryToggle open={historyOpen} onToggle={openHistory} />
          <ExportButton title={projectTitle} />
        </div>
        {historyOpen && (
          <div className="ax-panel-content ax-inspector-archie" hidden={compact}>
            <HistoryPanel projectId={projectId} onClose={closeHistory} onRestore={onApply} />
          </div>
        )}
        {archieOpen && (
          <div className="ax-panel-content ax-inspector-archie" data-architect hidden={compact}>
            <ArchitectPanel
              key={projectId}
              projectId={projectId}
              onClose={closeArchie}
              backLabel="Back to inspector"
              onApply={onApply}
              customTechnologies={customTechnologies}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
