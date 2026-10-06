import type { ConnectionFeedback, Lesson } from "./lessons";
import type { LessonStatus } from "./useLessonEngine";

type LearnCardProps = {
  lesson: Lesson;
  stepIndex: number;
  status: LessonStatus;
  feedback?: ConnectionFeedback | null;
  onDismissFeedback?: () => void;
  // Not connected yet: without a handler the action is shown disabled.
  onFinish?: () => void;
};

// Small floating card over the canvas; the canvas stays fully interactive around it.
export default function LearnCard({
  lesson,
  stepIndex,
  status,
  feedback,
  onDismissFeedback,
  onFinish,
}: LearnCardProps) {
  const count = lesson.steps.length;
  const step = lesson.steps[stepIndex];
  const isComplete = status === "complete";

  return (
    <div className="ax-card ax-learn" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="ax-panel-title">Learn</span>
        <span className="ax-card-label">
          {isComplete ? count : stepIndex + 1} / {count}
        </span>
      </div>

      {isComplete ? (
        <>
          <p className="ax-card-title mt-4">✓ Lesson complete</p>
          <p className="ax-card-body">{lesson.title}</p>
          <p className="ax-card-label mt-4">You created:</p>
          <p className="mt-1 text-[10px]">{lesson.summary}</p>
          <button
            type="button"
            disabled={!onFinish}
            onClick={onFinish}
            title={onFinish ? undefined : "Not connected yet"}
            className="ax-card-link"
          >
            Finish lesson →
          </button>
        </>
      ) : status === "success" ? (
        <>
          <p className="ax-card-title mt-4 text-(--ax-accent)">
            ✓ {step.successMessage}
          </p>
          <p className="ax-card-body">{step.title}</p>
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
