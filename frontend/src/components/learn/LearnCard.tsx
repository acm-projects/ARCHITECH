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
  error?: string | null;
  feedback?: ConnectionFeedback | null;
  // A hint worked out from the design, shown when the learner is stuck.
  hint?: string | null;
  onDismissFeedback?: () => void;
};

// Keep Archie's explanation distinct from the action the learner should take.
function ArchieDialogue({ children }: { children: ReactNode }) {
  return (
    <div className="ax-learn-dialogue">
      <span className="ax-learn-portrait" aria-hidden="true">
        <Image src="/archie.svg" alt="" width={518} height={400} />
      </span>
      <div className="ax-learn-speech">
        <span className="ax-learn-speaker">Archie</span>
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
  error,
  feedback,
  hint,
  onDismissFeedback,
}: LearnCardProps) {
  const count = lesson.steps.length;
  const step = lesson.steps[stepIndex];
  const isComplete = freePlay || status === "complete";
  // Add-component instructions follow the catalog when a component moves categories.
  const category = step.objective.kind === "node"
    ? COMPONENT_CATALOG[step.objective.componentType].family
    : null;
  const CategoryIcon = category ? CATEGORY_ICONS[category] : null;

  return (
    <div className="ax-card ax-learn" aria-live="polite" data-learn-phase={freePlay ? "free-play" : "guided"}>
      {!freePlay && <div className="flex items-baseline justify-between">
        <span className="ax-panel-title">Learn</span>
        <span className="ax-card-label">
          {skipped ? "Free play" : `${isComplete ? count : stepIndex + 1} / ${count}`}
        </span>
      </div>}

      {freePlay ? (
        <>
          <p className="ax-card-title">{skipped ? "Free play" : FREE_PLAY_TITLE}</p>
          <ArchieDialogue>{skipped
            ? "Build, configure, and test your architecture."
            : FREE_PLAY_BODY}</ArchieDialogue>
        </>
      ) : status === "success" ? (
        <>
          <p className="ax-card-title mt-4 text-(--ax-accent)">
            ✓ {step.successMessage}
          </p>
          <p className="ax-card-body">{step.title}</p>
          <ArchieDialogue>{step.successExplanation}</ArchieDialogue>
        </>
      ) : feedback ? (
        <div className="ax-feedback mt-4">
          <p className="ax-card-title">{feedback.title}</p>
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
          <p className="ax-card-title mt-4">{step.title}</p>
          <ArchieDialogue>{step.description}</ArchieDialogue>
          <p className="mt-3 text-(length:--ax-t-sm)">
            {CategoryIcon && category && <>
              Open{" "}
              <span className="inline-block align-text-bottom" role="img"
                aria-label={`${FAMILY_LABELS[category]} category`}
                title={FAMILY_LABELS[category]}>
                <CategoryIcon size={16} color={FAMILY_COLORS[category]} aria-hidden="true" />
              </span>{" "}
              in the left toolbar.{" "}
            </>}
            {step.instruction}
          </p>
          {hint && <p className="ax-card-label mt-2">Hint: {hint}</p>}
        </>
      )}

      {!skipped && <ol className="mt-4 flex gap-1.5" aria-label="Lesson progress">
        {lesson.steps.map((lessonStep, index) => {
          const done =
            isComplete ||
            index < stepIndex ||
            (index === stepIndex && status === "success");
          const state = done
            ? "is-done"
            : index === stepIndex
              ? "is-current"
              : "";
          return (
            <li
              key={lessonStep.id}
              className={`ax-dot ${state}`}
              aria-current={index === stepIndex && !done ? "step" : undefined}
            >
              <span className="sr-only">
                Step {index + 1}
                {done ? ", done" : ""}
              </span>
            </li>
          );
        })}
      </ol>}
      {!freePlay && <button type="button" className="ax-card-link" onClick={onSkip}>
        Skip tutorial
      </button>}
      {error && <p className="ax-card-body mt-2" role="alert">{error}</p>}
    </div>
  );
}
