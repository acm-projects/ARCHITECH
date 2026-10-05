import { useState } from "react";

import { ProductHeader } from "../../components/ProductShell";
import { Button, Icon, IconButton, SegmentedControl, SegmentedControlItem, TextInput } from "../../components/ui";
import type { Mode } from "../../types";

interface WorkspaceHeaderProps {
  mode: Mode;
  projectName: string;
  saveStatus: "saved" | "saving";
  lastSavedAt: string;
  dark: boolean;
  onToggleTheme: () => void;
  onModeChange: (mode: Mode) => void;
  onRename: (name: string) => void;
  onHome: () => void;
  onLanding: () => void;
  onSave: () => void;
  onShare: () => void;
  running: boolean;
  onRun: () => void;
  onAnalysis: () => void;
  onReview: () => void;
  onSettings: () => void;
}

function saveLabel(status: "saved" | "saving", lastSavedAt: string) {
  if (status === "saving") return "Saving…";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastSavedAt).getTime()) / 1000),
  );
  if (seconds < 10) return "Saved just now";
  if (seconds < 60) return `Saved ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Saved ${minutes}m ago`;
  return "Saved";
}

export function WorkspaceHeader({
  mode,
  projectName,
  saveStatus,
  lastSavedAt,
  dark,
  onToggleTheme,
  onModeChange,
  onRename,
  onHome,
  onLanding,
  onSave,
  onShare,
  running,
  onRun,
  onAnalysis,
  onReview,
  onSettings,
}: WorkspaceHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);

  const commitName = () => {
    const nextName = draftName.trim();
    if (nextName && nextName !== projectName) onRename(nextName);
    else setDraftName(projectName);
    setEditingName(false);
  };

  const projectControl = editingName ? (
    <TextInput
      className="product-project-input"
      autoFocus
      value={draftName}
      onChange={(event) => setDraftName(event.target.value)}
      onBlur={commitName}
      onKeyDown={(event) => {
        if (event.key === "Enter") commitName();
        if (event.key === "Escape") {
          setDraftName(projectName);
          setEditingName(false);
        }
      }}
      aria-label="Project name"
    />
  ) : (
    <button
      className="product-project-button"
      onClick={() => {
        setDraftName(projectName);
        setEditingName(true);
      }}
      title="Rename project"
    >
      {projectName}
    </button>
  );

  return (
    <ProductHeader
      className="workspace-header"
      onLogoClick={onLanding}
      trail={(
        <>
          <button className="product-trail-link" onClick={onHome}>Projects</button>
          <span className="product-header-separator">/</span>
          <div className="product-project-name">{projectControl}</div>
        </>
      )}
      center={(
        <nav className="workspace-view-tabs" aria-label="Workspace views">
          <button className="active"><span>C</span>Canvas</button>
          <button onClick={onAnalysis}><span>A</span>Analysis</button>
          <button onClick={onReview}><span>R</span>Review</button>
          <button onClick={onSettings}><span>S</span>Settings</button>
        </nav>
      )}
      actions={(
        <>
          <span className={saveStatus === "saving" ? "header-save-state saving" : "header-save-state"} role="status" aria-live="polite">
            {saveLabel(saveStatus, lastSavedAt)}
          </span>
          <SegmentedControl className="workspace-mode-mini" label="Workspace mode">
            <SegmentedControlItem
              selected={mode === "learn"}
              onClick={() => onModeChange("learn")}
            >
              Learn
            </SegmentedControlItem>
            <SegmentedControlItem
              selected={mode === "challenge"}
              onClick={() => onModeChange("challenge")}
            >
              Challenge
            </SegmentedControlItem>
          </SegmentedControl>
          <Button className="header-stress-button" variant={running ? "danger" : "run"} onClick={onRun} icon={running ? "stop" : "play"}>
            {running ? "Stop Test" : "Run Stress Test"}
          </Button>
          <IconButton
            icon={dark ? "sun" : "moon"}
            label={dark ? "Switch to light theme" : "Switch to dark theme"}
            tooltip={dark ? "Light theme" : "Dark theme"}
            onClick={onToggleTheme}
          />
          <IconButton icon="check" label="Save project" tooltip="Save" onClick={onSave} />
          <IconButton icon="upload" label="Share project" tooltip="Share" onClick={onShare} />
        </>
      )}
    />
  );
}

interface DiagramTabsProps {
  tabs: string[];
  activeTab: number;
  mode: Mode;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onAdd: () => void;
}

export function DiagramTabs({
  tabs,
  activeTab,
  mode,
  onSelect,
  onClose,
  onAdd,
}: DiagramTabsProps) {
  return (
    <div className="diagram-tabs" role="tablist" aria-label="Open diagrams">
      {tabs.map((tab, index) => (
        <button
          key={tab}
          className={activeTab === index ? "active" : ""}
          onClick={() => onSelect(index)}
          role="tab"
          aria-selected={activeTab === index}
        >
          {tab}
          <i
            role="button"
            tabIndex={0}
            aria-label={`Close ${tab}`}
            title={`Close ${tab}`}
            data-tooltip="Close tab"
            onClick={(event) => {
              event.stopPropagation();
              onClose(index);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onClose(index);
              }
            }}
          >
            ×
          </i>
        </button>
      ))}

      <button aria-label="Add diagram tab" title="Add diagram" data-tooltip="Add diagram" onClick={onAdd}>
        <Icon name="plus" size={13} />
      </button>

      {mode === "challenge" && (
        <div className="challenge-tab-label">
          <span>URL SHORTENER</span>
          <b>Design a URL Shortener</b>
        </div>
      )}
    </div>
  );
}

interface CanvasToolbarProps {
  zoom: number;
  canConnect: boolean;
  selectedLabel: string;
  onConnect: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onResetZoom: () => void;
  onHistory: () => void;
  onExport: () => void;
}

export function CanvasToolbar({
  zoom,
  canConnect,
  selectedLabel,
  onConnect,
  onUndo,
  onRedo,
  onClear,
  onResetZoom,
  onHistory,
  onExport,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas actions">
      <IconButton
        icon="connect"
        label={canConnect ? `Connect from ${selectedLabel}` : "Connect components"}
        tooltip={canConnect ? "Connect component" : "Select a component first"}
        onClick={onConnect}
        disabled={!canConnect}
        size="sm"
      />
      <IconButton icon="undo" label="Undo" onClick={onUndo} size="sm" />
      <IconButton icon="undo" label="Redo" onClick={onRedo} className="redo-icon" size="sm" />
      <IconButton icon="trash" label="Clear canvas" onClick={onClear} size="sm" />
      <span className="toolbar-sep" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onResetZoom}
        title="Reset zoom"
        aria-label={`Reset zoom, currently ${Math.round(zoom * 100)} percent`}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <IconButton icon="history" label="Open project history" tooltip="History" onClick={onHistory} size="sm" />
      <IconButton icon="upload" label="Export project" tooltip="Export" onClick={onExport} size="sm" />
    </div>
  );
}

interface StressTestCardProps {
  running: boolean;
  complete: boolean;
  effectiveTraffic: number;
  progress: number;
  stage: string;
  p95Latency: number;
  bottleneckLabel: string;
  bottleneckUtilization: number;
  bottleneckDemand: number;
  bottleneckCapacity: number;
  feedback: string;
  healthScore: number;
  availability: number;
  onInspect: () => void;
  onRunAgain: () => void;
}

export function StressTestCard({
  running,
  complete,
  effectiveTraffic,
  progress,
  stage,
  p95Latency,
  bottleneckLabel,
  bottleneckUtilization,
  bottleneckDemand,
  bottleneckCapacity,
  feedback,
  healthScore,
  availability,
  onInspect,
  onRunAgain,
}: StressTestCardProps) {
  if (!running && !complete) return null;

  return (
    <div className={`stress-test-card ${complete ? "complete" : ""}`} role="status" aria-live="polite" aria-busy={running}>
      <div className="stress-test-card-head">
        <span>{complete ? "STRESS TEST COMPLETE" : "STRESS TEST"}</span>
        <b>{complete ? `${effectiveTraffic.toLocaleString()} req/s peak` : `${progress}%`}</b>
      </div>

      {!complete ? (
        <>
          <div className="stress-path-visual" aria-hidden="true">
            {["IN", "ROUTE", "API", "QUEUE", "DATA"].map((label, index) => {
              const activeIndex = Math.min(4, Math.floor(progress / 20));
              return (
                <span className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""} key={label}>
                  <i />
                  <small>{label}</small>
                </span>
              );
            })}
          </div>
          <strong>{stage}</strong>
          <div className="stress-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>
            {effectiveTraffic.toLocaleString()} req/s → {p95Latency} ms p95
          </small>
        </>
      ) : (
        <>
          <strong>{bottleneckLabel} is your bottleneck</strong>
          <div className="stress-bottleneck-load">
            <b>{Math.round(bottleneckUtilization)}% utilization</b>
            <span>
              {bottleneckDemand.toLocaleString()} req/s demand ·{" "}
              {bottleneckCapacity.toLocaleString()} req/s capacity
            </span>
          </div>
          <p>{feedback}</p>
          <div className="stress-result-metrics">
            <span><b>{healthScore}%</b> health</span>
            <span><b>{p95Latency}ms</b> p95</span>
            <span><b>{availability.toFixed(2)}%</b> availability</span>
          </div>
          <div className="stress-result-actions">
            <Button variant="outline" size="sm" onClick={onInspect}>Inspect bottleneck</Button>
            <Button variant="outline" size="sm" onClick={onRunAgain}>Run again</Button>
          </div>
        </>
      )}
    </div>
  );
}

interface SimulationControlsProps {
  traffic: number;
  networkLatency: number;
  onTrafficChange: (value: number) => void;
  onLatencyChange: (value: number) => void;
  onClose: () => void;
}

export function SimulationControls({
  traffic,
  networkLatency,
  onTrafficChange,
  onLatencyChange,
  onClose,
}: SimulationControlsProps) {
  return (
    <div className="sim-controls">
      <div>
        <span>Traffic</span>
        <b>{traffic.toLocaleString()} req/s</b>
        <input
          type="range"
          min="100"
          max="30000"
          value={traffic}
          aria-label="Traffic"
          onChange={(event) => onTrafficChange(Number(event.target.value))}
        />
      </div>
      <div>
        <span>Network latency</span>
        <b>{networkLatency} ms</b>
        <input
          type="range"
          min="10"
          max="500"
          value={networkLatency}
          aria-label="Network latency"
          onChange={(event) => onLatencyChange(Number(event.target.value))}
        />
      </div>
      <IconButton icon="close" label="Close simulation controls" tooltip="Close" size="sm" onClick={onClose} />
    </div>
  );
}

interface LearnSimulationControlsProps {
  traffic: number;
  dataset: number;
  readRatio: number;
  networkLatency: number;
  onTrafficChange: (value: number) => void;
  onDatasetChange: (value: number) => void;
  onReadRatioChange: (value: number) => void;
  onLatencyChange: (value: number) => void;
  onReset: () => void;
}

export function LearnSimulationControls({
  traffic,
  dataset,
  readRatio,
  networkLatency,
  onTrafficChange,
  onDatasetChange,
  onReadRatioChange,
  onLatencyChange,
  onReset,
}: LearnSimulationControlsProps) {
  return (
    <div className="learn-sim-controls">
      <div className="learn-sim-head">
        <span>Simulation</span>
        <Button variant="ghost" size="sm" onClick={onReset}>Reset</Button>
      </div>

      <label>
        <span>Concurrent users<small>More users increase load</small></span>
        <input
          type="range"
          min="100"
          max="100000"
          value={traffic}
          aria-label="Concurrent users"
          onChange={(event) => onTrafficChange(Number(event.target.value))}
        />
        <b>{traffic.toLocaleString()}</b>
      </label>

      <label>
        <span>Dataset size<small>Larger data raises cost</small></span>
        <input
          type="range"
          min="1"
          max="1000"
          value={dataset}
          aria-label="Dataset size"
          onChange={(event) => onDatasetChange(Number(event.target.value))}
        />
        <b>{dataset} GB</b>
      </label>

      <label>
        <span>Read / write ratio<small>Changes cache pressure</small></span>
        <input
          type="range"
          min="0"
          max="100"
          value={readRatio}
          aria-label="Read write ratio"
          onChange={(event) => onReadRatioChange(Number(event.target.value))}
        />
        <b>{readRatio}% read</b>
      </label>

      <label>
        <span>Network latency<small>Raises response time</small></span>
        <input
          type="range"
          min="10"
          max="500"
          value={networkLatency}
          onChange={(event) => onLatencyChange(Number(event.target.value))}
        />
        <b>{networkLatency} ms</b>
      </label>
    </div>
  );
}
