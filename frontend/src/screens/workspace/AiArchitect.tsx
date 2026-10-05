import { useEffect, useState, type PointerEvent } from "react";

import { ArchieMark, Button, Icon, IconButton } from "../../components/ui";
import type { ExperienceLevel, Mode } from "../../types";
import {
  RUN_STAGE_EXPLANATIONS,
  RUN_STAGE_MESSAGES,
} from "./workspaceModel";

interface Position {
  x: number;
  y: number;
}

interface DragStart extends Position {
  px: number;
  py: number;
}

function getDefaultPosition(): Position {
  return {
    x: Math.max(8, window.innerWidth - 340),
    y: Math.max(80, window.innerHeight - 460),
  };
}

interface AiArchitectProps {
  enabled: boolean;
  open: boolean;
  mode: Mode;
  running: boolean;
  testing: boolean;
  selected: string;
  runStage: number;
  nodeNames: readonly string[];
  level: ExperienceLevel;
  onOpen: () => void;
  onClose: () => void;
  onStartLiveTest: () => void;
  onRunTest: () => void;
  onStartBuild: () => void;
}

export function AiArchitect({
  enabled,
  open,
  mode,
  running,
  testing,
  selected,
  runStage,
  nodeNames,
  level,
  onOpen,
  onClose,
  onStartLiveTest,
  onRunTest,
  onStartBuild,
}: AiArchitectProps) {
  const [position, setPosition] = useState<Position>(getDefaultPosition);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);

  useEffect(() => {
    setPosition(getDefaultPosition());
  }, [mode]);

  if (!enabled) return null;

  if (!open || (mode === "learn" && running)) {
    return (
      <button className="ai-fab" aria-label="Open Archie" title="Open Archie" data-tooltip="Ask Archie" onClick={onOpen}>
        <ArchieMark
          variant={
            level === "Beginner"
              ? "beginner"
              : level === "Intermediate"
                ? "intermediate"
                : "advanced"
          }
          size={27}
        />
      </button>
    );
  }

  const movePanel = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;

    setPosition({
      x: Math.max(
        8,
        Math.min(
          window.innerWidth - 320,
          dragStart.px + event.clientX - dragStart.x,
        ),
      ),
      y: Math.max(
        70,
        Math.min(
          window.innerHeight - 260,
          dragStart.py + event.clientY - dragStart.y,
        ),
      ),
    });
  };

  return (
    <div
      className="ai-panel movable"
      role="dialog"
      aria-label="Archie system review"
      aria-busy={testing}
      style={{
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
      }}
      onPointerMove={movePanel}
      onPointerUp={() => setDragStart(null)}
      onPointerCancel={() => setDragStart(null)}
    >
      <div
        className="ai-panel-head"
        onPointerDown={(event) => {
          setDragStart({
            x: event.clientX,
            y: event.clientY,
            px: position.x,
            py: position.y,
          });
          event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
        }}
      >
        <span className="archie-panel-title">
          <ArchieMark
            variant={
              level === "Beginner"
                ? "beginner"
                : level === "Intermediate"
                  ? "intermediate"
                  : "advanced"
            }
            size={28}
          />
          <b>Archie</b>
          <small>System review · Drag</small>
        </span>
        <IconButton
          icon="minus"
          label="Minimize Archie"
          tooltip="Minimize"
          size="sm"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
        />
      </div>

      {testing ? (
        <>
          <div className="ai-testing-line">
            <span>Scenario 1/3</span><b>Verification run</b>
          </div>
          <p>
            2× traffic through <strong>{selected}</strong>. Comparing baseline
            behavior against the stressed path.
          </p>
          <div className="cause-flow">
            <span>Baseline</span>
            <Icon name="arrow" />
            <span>Inject load</span>
            <Icon name="arrow" />
            <span>Compare</span>
          </div>
          <Button variant="soft" onClick={onStartLiveTest}>
            Open live test <Icon name="arrow" />
          </Button>
        </>
      ) : running ? (
        <>
          <div className="ai-alert">
            <span>STAGE {runStage + 1} OF 5</span>
            <b>{RUN_STAGE_MESSAGES[runStage]}</b>
          </div>
          <p>
            <strong>{nodeNames[runStage]}</strong>{" "}
            {RUN_STAGE_EXPLANATIONS[runStage]}
          </p>
          <div className="cause-flow">
            <span>Stage {runStage + 1}</span>
            <Icon name="arrow" />
            <span>{nodeNames[runStage]}</span>
            <Icon name="arrow" />
            <span>{runStage === 4 ? "Complete" : "Next"}</span>
          </div>
          <Button variant="soft" disabled title="The current stage explanation is shown above">
            Stage details <Icon name="arrow" />
          </Button>
        </>
      ) : (
        <>
          <p>
            <strong>Ready to test.</strong>{" "}
            {level === "Beginner"
              ? "Simulated requests will move through each connection. "
              : ""}
            Bottlenecks are reported against the affected path.
          </p>
          <Button variant="outline" className="ai-prompt" onClick={onRunTest}>
            <Icon name="play" />
            {level === "Advanced"
              ? "Test a zonal dependency failure"
              : "Run 2× traffic test"}
            <Icon name="arrow" />
          </Button>
          <Button variant="outline" className="ai-prompt" onClick={onStartBuild}>
            <Icon name="plus" />
            Guided build
            <Icon name="arrow" />
          </Button>
        </>
      )}
    </div>
  );
}
