import { ArchieMark, Button, Dialog, Icon, IconButton, SegmentedControl, SegmentedControlItem } from "../../components/ui";
import type { ExperienceLevel } from "../../types";
import type { DiagramExportFormat } from "../../utils/exportDiagram";
import {
  TOOLBOX_ITEMS,
  WORKSPACE_TOUR,
} from "./workspaceData";

function ResourceFlow({ kind }: { kind: string }) {
  return (
    <span className={`resource-flow resource-flow-${kind}`} aria-hidden="true">
      <i className="rf-node rf-a" />
      <i className="rf-line rf-line-a" />
      <i className="rf-node rf-b" />
      <i className="rf-line rf-line-b" />
      <i className="rf-node rf-c" />
      <i className="rf-dot rf-dot-a" />
      <i className="rf-dot rf-dot-b" />
      <i className="rf-dot rf-dot-c" />
    </span>
  );
}

function TourVisual({ step }: { step: number }) {
  return (
    <div className={`tour-visual tour-visual-${step}`} aria-hidden="true">
      <span className="tv-node tv-a" />
      <i className="tv-path tv-path-a" />
      <span className="tv-node tv-b" />
      <i className="tv-path tv-path-b" />
      <span className="tv-node tv-c" />
      <span className="tv-pointer">↖</span>
      <span className="tv-metric">p95</span>
    </div>
  );
}

// Components are added by dragging a row onto the canvas, never by clicking it.
export function Toolbox({
  layer,
  onLayer,
}: {
  layer: "frontend" | "backend" | "fullstack";
  onLayer: (layer: "frontend" | "backend" | "fullstack") => void;
}) {
  const groups = ["Traffic", "Compute", "Data", "Integration"] as const;

  return (
    <div className="add-rail architecture-toolbox">
      <div className="stack-filter">
        <span>SCOPE</span>
        <SegmentedControl label="Resource scope">
          {(["fullstack", "backend", "frontend"] as const).map((item) => (
            <SegmentedControlItem
              selected={layer === item}
              onClick={() => onLayer(item)}
              key={item}
            >
              {item}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      <span>RESOURCES</span>

      {groups.map((group) => {
        const items = TOOLBOX_ITEMS.filter((item) => item.group === group);

        return (
          <div className="toolbox-group" key={group}>
            <span className="toolbox-group-label">{group}</span>
            {items.map(({ short, name, kind, icon }) => (
              <button
                draggable
                title={name}
                aria-label={name}
                onDragStart={(event) => event.dataTransfer.setData("component", name)}
                key={name}
              >
                <b className={`toolbox-icon toolbox-icon-${kind}`}>
                  <Icon name={icon} size={17} />
                </b>
                <small>{short}</small>
                <ResourceFlow kind={kind} />
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function TourCard({
  step,
  level,
  next,
  skip,
}: {
  step: number;
  level: ExperienceLevel;
  next: () => void;
  skip: () => void;
}) {
  const [title] = WORKSPACE_TOUR[step];
  const cues = [
    "Drag a block onto the canvas.",
    "Move it. Snap it. Shape the path.",
    "Port → port. The line is the data path.",
    "Run traffic. Watch the hot path appear.",
    "Read the numbers where they change.",
    "Click the warning. Jump to the exact node.",
  ] as const;

  return (
    <div className={`tour-card tour-${step} visual-tour-card`}>
      <div className="tour-top"><span className="archie-guide-label"><ArchieMark variant={level === "Beginner" ? "beginner" : level === "Intermediate" ? "intermediate" : "advanced"} size={27} /><b>Archie</b><em>{step + 1} / {WORKSPACE_TOUR.length}</em></span><IconButton icon="close" label="Close tour" tooltip="Close" size="sm" onClick={skip} /></div>
      <TourVisual step={step} />
      <div className="tour-copy">
        <h3>{title}</h3>
        <span>{cues[step]}</span>
      </div>
      <div><Button variant="ghost" size="sm" onClick={skip}>Skip</Button><Button variant="soft" onClick={next}>{step === WORKSPACE_TOUR.length - 1 ? "Done" : "Show me"} <Icon name="arrow" size={14} /></Button></div>
    </div>
  );
}


export function HistoryPanel({
  close,
  undoCount,
  redoCount,
  lastSavedAt,
  onUndo,
  onRedo,
}: {
  close: () => void;
  undoCount: number;
  redoCount: number;
  lastSavedAt: string;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const savedAt = new Date(lastSavedAt);
  const savedLabel = Number.isNaN(savedAt.getTime())
    ? "Not saved yet"
    : savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <aside className="history-panel utility-panel" role="complementary" aria-label="Session history">
      <div className="panel-title">
        <div><span>UTILITY</span><h2>History</h2></div>
        <IconButton icon="close" label="Close history" tooltip="Close" size="sm" onClick={close} />
      </div>
      <div className="history-state-row">
        <span><small>LAST SAVE</small><b>{savedLabel}</b></span>
        <span><small>UNDO</small><b>{undoCount}</b></span>
        <span><small>REDO</small><b>{redoCount}</b></span>
      </div>
      <div className="history-actions utility-actions">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={undoCount === 0}><Icon name="undo" size={13} /> Undo</Button>
        <Button variant="outline" size="sm" onClick={onRedo} disabled={redoCount === 0}><span className="redo-icon"><Icon name="undo" size={13} /></span> Redo</Button>
      </div>
      <small className="utility-note">Undo history is session-only. Saved canvas state persists after refresh.</small>
    </aside>
  );
}

export function ExportModal({ close, exported }: { close: () => void; exported: (format: DiagramExportFormat) => void }) {
  const options: Array<[DiagramExportFormat, string, string]> = [
    ["SVG", "Vector", "Docs + slides"],
    ["PNG", "Image", "Sharing + embeds"],
    ["JSON", "Project data", "Backup + portability"],
  ];

  return (
    <Dialog label="Export project" onDismiss={close} scrimClassName="modal-scrim" className="export-modal utility-modal">
        <div className="panel-title">
          <div><span>UTILITY</span><h2>Export</h2></div>
          <IconButton icon="close" label="Close export" tooltip="Close" size="sm" onClick={close} />
        </div>
        <div className="export-options">
          {options.map(([format, title, sub]) => (
            <button key={format} onClick={() => exported(format)}>
              <b>{format}</b>
              <span><strong>{title}</strong><small>{sub}</small></span>
              <Icon name="arrow" size={13} />
            </button>
          ))}
        </div>
        <div className="export-foot utility-foot">
          <span>Current layout + metrics snapshot</span>
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
        </div>
    </Dialog>
  );
}

export function GuidedBuild({ step, next, close }: { step: number; next: () => void; close: () => void }) {
  const nodes = ["Client", "Load Balancer", "API", "Cache", "Database"];
  return <div className="guided-build guided-build-visual" role="dialog" aria-label="Guided build"><div><span className="archie-guided-build-label"><ArchieMark variant="intermediate" size={27} /><b>Archie</b><em>BUILD · {step}/5</em></span><IconButton icon="close" label="Close guided build" tooltip="Close" size="sm" onClick={close} /></div><div className="guided-map" aria-hidden="true">{nodes.map((node, index) => <span className={index + 1 < step ? "done" : index + 1 === step ? "current" : ""} key={node}><i />{index < nodes.length - 1 && <b>→</b>}<small>{node}</small></span>)}</div><h3>{step === 1 ? "Start here" : `Add ${nodes[step - 1]}`}</h3><p>{step === 1 ? "Client → first request" : `${nodes[step - 2]} → ${nodes[step - 1]}`}</p><Button variant="soft" onClick={next}>{step === 5 ? "Finish" : "Next block"} <Icon name="arrow" /></Button></div>;
}

export function Metric({ label, value, delta, bad }: { label: string; value: string; delta: string; bad?: boolean }) {
  return <div className={`metric ${bad ? "bad" : ""}`}><span>{label}</span><b>{value}</b><small>{delta}</small></div>;
}
