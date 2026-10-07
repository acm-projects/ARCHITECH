import { FREE_PLAY_BODY, FREE_PLAY_TITLE, type ConnectionFeedback, type Lesson } from "./lessons";
import type { LessonStatus } from "./useLessonEngine";

type LearnCardProps = {
  lesson: Lesson;
  stepIndex: number;
  status: LessonStatus;
  // The tutorial is finished and the design is free to change: replaces the step.
  freePlay?: boolean;
  feedback?: ConnectionFeedback | null;
  // A hint worked out from the design, shown when the learner is stuck.
  hint?: string | null;
  onDismissFeedback?: () => void;
};

// Small floating card over the canvas; the canvas stays fully interactive around it.
export default function LearnCard({
  lesson,
  stepIndex,
  status,
  freePlay = false,
  feedback,
  hint,
  onDismissFeedback,
}: LearnCardProps) {
  const count = lesson.steps.length;
  const step = lesson.steps[stepIndex];
  const isComplete = freePlay || status === "complete";

  return (
    <div className="ax-card ax-learn" aria-live="polite" data-learn-phase={freePlay ? "free-play" : "guided"}>
      <div className="flex items-baseline justify-between">
        <span className="ax-panel-title">Learn</span>
        <span className="ax-card-label">
          {isComplete ? count : stepIndex + 1} / {count}
        </span>
      </div>

      {freePlay ? (
        <>
          <p className="ax-card-title mt-4">{FREE_PLAY_TITLE}</p>
          <p className="ax-card-body">{FREE_PLAY_BODY}</p>
        </>
      ) : status === "success" ? (
        <>
          <p className="ax-card-title mt-4 text-(--ax-accent)">
            ✓ {step.successMessage}
          </p>
          <p className="ax-card-body">{step.title}</p>
          <p className="ax-card-label mt-2">{step.successExplanation}</p>
        </>
      ) : feedback ? (
        <div className="ax-feedback mt-4">
          <p className="ax-card-title">{feedback.title}</p>
          <p className="ax-card-body">{feedback.explanation}</p>
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
          <p className="ax-card-body">{step.description}</p>
          <p className="mt-3 text-[10px]">{step.instruction}</p>
          {hint && <p className="ax-card-label mt-2">Hint: {hint}</p>}
        </>
      )}

      <ol className="mt-4 flex gap-1.5" aria-label="Lesson progress">
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
      </ol>
    </div>
  );
}
