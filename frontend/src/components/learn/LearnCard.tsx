import Image from "next/image";
import type { ReactNode } from "react";

import { FREE_PLAY_BODY, FREE_PLAY_TITLE, type ConnectionFeedback, type Lesson } from "./lessons";
import type { LessonStatus } from "./useLessonEngine";
import { CATEGORY_ICONS } from "../workspace/toolbox/categoryIcons";
import { COMPONENT_CATALOG, FAMILY_COLORS, FAMILY_LABELS } from "../workspace/componentCatalog";

type LearnCardProps = {
  lesson: Lesson;
  stepIndex: number;
  status: LessonStatus;
  // The tutorial is finished and the design is free to change: replaces the step.
  freePlay?: boolean;
  skipped?: boolean;
  onSkip: () => void;
  onContinue: () => void;
  error?: string | null;
  feedback?: ConnectionFeedback | null;
  // A hint worked out from the design, shown when the learner is stuck.
  hint?: string | null;
  onDismissFeedback?: () => void;
};

// Keep Archie's explanation distinct from the action the learner should take.
function ArchieDialogue({ children, celebrating = false }: { children: ReactNode; celebrating?: boolean }) {
  return (
    <div className="ax-learn-dialogue" data-celebrating={celebrating}>
      <span className="ax-learn-portrait" aria-hidden="true">
        <Image src="/archie.svg" alt="" width={518} height={400} />
      </span>
      <div className="ax-learn-speech">
        <span className="sr-only">Archie: </span>
        <p className="ax-card-body">{children}</p>
      </div>
    </div>
  );
}

// The canvas stays interactive while the current instruction remains visible.
export default function LearnCard({
  lesson,
  stepIndex,
  status,
  freePlay = false,
  skipped = false,
  onSkip,
  onContinue,
  error,
  feedback,
  hint,
  onDismissFeedback,
}: LearnCardProps) {
  const count = lesson.steps.length;
  const step = lesson.steps[stepIndex];
  const isComplete = freePlay || status === "complete";
  const progress = isComplete ? count : Math.min(stepIndex + 1, count);
  // Add-component instructions follow the catalog when a component moves categories.
  const category = step.objective.kind === "node"
    ? COMPONENT_CATALOG[step.objective.componentType].family
    : null;
  const CategoryIcon = category ? CATEGORY_ICONS[category] : null;
  const heading = freePlay
    ? skipped ? "Free play" : FREE_PLAY_TITLE
    : status === "success" ? step.successMessage : feedback ? feedback.title : step.title;

  return (
    <div className="ax-card ax-learn" aria-live="polite" data-learn-phase={freePlay ? "free-play" : "guided"}>
      <div className="ax-learn-header">
        <p className="ax-card-title">{heading}</p>
      </div>

      {freePlay ? (
        <>
          <ArchieDialogue>{skipped
            ? "Build, configure, and test your architecture."
            : FREE_PLAY_BODY}</ArchieDialogue>
        </>
      ) : status === "success" ? (
        <>
          <ArchieDialogue key={`success-${step.id}`} celebrating>{step.successExplanation}</ArchieDialogue>
          <button type="button" className="ax-learn-continue" onClick={onContinue}>
            Continue
          </button>
        </>
      ) : feedback ? (
        <div>
          <ArchieDialogue>{feedback.explanation}</ArchieDialogue>
          <button
            type="button"
            onClick={onDismissFeedback}
            className="ax-card-link"
          >
            Try again →
          </button>
        </div>
      ) : (
        <>
          <ArchieDialogue>{step.description}</ArchieDialogue>
          <div className="ax-learn-instruction">
            {CategoryIcon && category && <p>
              Open{" "}<span className="ax-learn-category">
                <CategoryIcon size={16} color={FAMILY_COLORS[category]} aria-hidden="true" />
                <span>{FAMILY_LABELS[category]}</span>
              </span>{" "}in the left toolbar.
            </p>}
            <p>{step.instruction}</p>
          </div>
          {hint && <details className="ax-learn-hint">
            <summary>Hint</summary>
            <p className="ax-card-body">{hint}</p>
          </details>}
        </>
      )}

      {!freePlay && <button type="button" className="ax-card-link ax-learn-skip" onClick={onSkip}>
        Skip tutorial
      </button>}
      {error && <p className="ax-card-body mt-2" role="alert">{error}</p>}
      {!freePlay && <div
        className="ax-learn-progress"
        role="progressbar"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={progress}
        aria-valuetext={`Step ${progress} of ${count}`}
      >
        <span style={{ width: `${count ? progress / count * 100 : 0}%` }} />
      </div>}
    </div>
  );
}
