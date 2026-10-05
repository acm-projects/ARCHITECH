import { Button, Dialog, Icon, IconButton } from "../../components/ui";
import type { ChallengeEvaluation } from "./challengeModel";

export function ChallengeWelcome({ close }: { close: () => void }) {
  return (
    <Dialog label="Challenge brief" scrimClassName="modal-scrim" className="challenge-welcome challenge-brief-modal">
        <div className="challenge-brief-head">
          <span>CHALLENGE 01</span>
          <IconButton icon="close" label="Close challenge brief" size="sm" onClick={close} />
        </div>
        <h2>Design a URL Shortener</h2>
        <p>Build the request path, test it under load, and meet every measured constraint.</p>
        <div className="challenge-brief-flow" aria-hidden="true">
          <span>Client</span><i>→</i><span>API</span><i>→</i><span>Cache</span><i>→</i><span>Data</span>
        </div>
        <Button onClick={close}>Open canvas <Icon name="arrow" /></Button>
    </Dialog>
  );
}

const requirementIcon = {
  throughput: "bolt",
  latency: "history",
  availability: "connect",
  cost: "sliders",
} as const;

export function ChallengeScore({ evaluation }: { evaluation: ChallengeEvaluation }) {
  return (
    <div className="challenge-requirements">
      <div className="challenge-title">
        <span>PROBLEM</span>
        <h2>URL shortener</h2>
        <p>Design the redirect + write path to satisfy the target envelope.</p>
      </div>
      <div className="challenge-progress" role="status" aria-live="polite">
        <span>PROGRESS</span>
        <b>{evaluation.metCount}/{evaluation.requirements.length}</b>
        <small>constraints met</small>
        <i><em style={{ width: (evaluation.metCount / evaluation.requirements.length) * 100 + "%" }} /></i>
      </div>
      <div className="requirement-list" aria-label="Challenge constraints">
        {evaluation.requirements.map((requirement) => (
          <div className={requirement.met ? "met" : ""} key={requirement.id}>
            <i><Icon name={requirement.met ? "check" : requirementIcon[requirement.id]} size={13} /></i>
            <span><b>{requirement.label}</b><small>{requirement.target}</small></span>
            <strong>{requirement.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChallengeResult({
  evaluation,
  close,
}: {
  evaluation: ChallengeEvaluation;
  close: () => void;
}) {
  return (
    <Dialog label="Challenge result" scrimClassName="modal-scrim" className="challenge-result challenge-result-utility">
        <div className="challenge-brief-head">
          <span>TEST RESULT</span>
          <IconButton icon="close" label="Close challenge result" size="sm" onClick={close} />
        </div>
        <h2>{evaluation.metCount}/{evaluation.requirements.length} constraints met</h2>
        <div className="result-breakdown">
          {evaluation.requirements.map((requirement) => (
            <span key={requirement.id} className={requirement.met ? "met" : ""}>
              <small>{requirement.label}</small>
              <b>{requirement.value}</b>
            </span>
          ))}
        </div>
        <Button onClick={close}>Return to canvas</Button>
    </Dialog>
  );
}
