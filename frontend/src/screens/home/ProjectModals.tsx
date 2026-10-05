import { useState } from "react";

import {
  Button,
  Choice,
  Dialog,
  Field,
  Icon,
  IconButton,
  TextInput,
  Toggle,
} from "../../components/ui";
import type { CreateProjectInput } from "../../lib/projects";
import {
  readBooleanStorage,
  STORAGE_KEYS,
  writeBooleanStorage,
} from "../../lib/storage";
import type { Mode } from "../../types";

export function NewProjectModal({
  close,
  open,
}: {
  close: () => void;
  open: (input: CreateProjectInput) => void;
}) {
  const [projectName, setProjectName] = useState("Untitled project");
  const [chosenMode, setChosenMode] = useState<Mode>("learn");
  const [reviewEnabled, setReviewEnabled] = useState(() =>
    readBooleanStorage(STORAGE_KEYS.aiEnabled, true),
  );

  const finish = () => {
    writeBooleanStorage(STORAGE_KEYS.aiEnabled, reviewEnabled);
    close();
    open({
      name: projectName.trim() || "Untitled project",
      mode: chosenMode,
      source: chosenMode === "challenge" ? "challenge" : "blank",
    });
  };

  return (
    <Dialog
      label="Create new architecture"
      onDismiss={close}
      scrimClassName="modal-scrim"
      className="new-project-modal task-project-setup"
    >
      <div className="project-setup-head">
        <div>
          <span>NEW ARCHITECTURE</span>
          <h2>Choose a working mode</h2>
        </div>
        <IconButton icon="close" label="Close dialog" tooltip="Close" size="sm" onClick={close} />
      </div>

      <Field className="project-name-field project-setup-name" label="Name">
        <TextInput
          autoFocus
          value={projectName}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setProjectName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && projectName.trim()) finish();
          }}
        />
      </Field>

      <div className="work-mode-grid" role="group" aria-label="Working mode">
        <Choice selected={chosenMode === "learn"} onClick={() => setChosenMode("learn")}>
          <span className="work-mode-icon"><Icon name="connect" /></span>
          <span>
            <strong>Learn</strong>
            <small>Guided construction</small>
          </span>
          <Icon name="chevron" size={14} />
        </Choice>
        <Choice selected={chosenMode === "challenge"} onClick={() => setChosenMode("challenge")}>
          <span className="work-mode-icon"><Icon name="bolt" /></span>
          <span>
            <strong>Challenge</strong>
            <small>Constraints + stress test</small>
          </span>
          <Icon name="chevron" size={14} />
        </Choice>
      </div>

      <div className="project-review-row">
        <div>
          <span>SYSTEM REVIEW</span>
          <small>Run topology checks while you build.</small>
        </div>
        <Toggle checked={reviewEnabled} onClick={() => setReviewEnabled((value) => !value)}>
          {reviewEnabled ? "On" : "Off"}
        </Toggle>
      </div>

      <div className="project-setup-footer">
        <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
        <Button onClick={finish}>
          Open architecture <Icon name="arrow" />
        </Button>
      </div>
    </Dialog>
  );
}
