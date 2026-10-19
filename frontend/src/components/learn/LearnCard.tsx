import Image from "next/image";
import { useEffect, useState } from "react";

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
  onContinue: () => void;
  error?: string | null;
  feedback?: ConnectionFeedback | null;
  // A hint worked out from the design, shown when the learner is stuck.
  hint?: string | null;
  onDismissFeedback?: () => void;
};

function DialogueText({ text }: { text: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    const finish = () => {
      clearInterval(timer);
      setCount(text.length);
    };
    const timer = window.setInterval(() => {
      const next = Math.min(text.length, Math.floor((performance.now() - start) / 18));
      setCount(next);
      if (next === text.length) clearInterval(timer);
    }, 18);
    const onVisibility = () => { if (document.hidden) finish(); };
    if (motion.matches || document.hidden) finish();
    motion.addEventListener("change", finish);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      motion.removeEventListener("change", finish);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [text]);

  return <>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true" className="ax-learn-typed">
      {count >= text.length ? text : <>
        {text.slice(0, count)}<span style={{ visibility: "hidden" }}>{text.slice(count)}</span>
      </>}
    </span>
  </>;
}

// Keep Archie's explanation distinct from the action the learner should take.
function ArchieDialogue({ children }: { children: string }) {
  return (
    <div className="ax-learn-dialogue">
      <div className="ax-learn-speech">
        <span className="sr-only">Archie: </span>
        <p className="ax-card-body">
          <DialogueText key={children} text={children} />
        </p>
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
  onContinue,
  error,
  feedback,
  hint,
  onDismissFeedback,
}: LearnCardProps) {
  const step = lesson.steps[stepIndex];
  // Add-component instructions follow the catalog when a component moves categories.
  const category = step.objective.kind === "node"
    ? COMPONENT_CATALOG[step.objective.componentType].family
    : null;
  const CategoryIcon = category ? CATEGORY_ICONS[category] : null;
  const heading = freePlay
    ? skipped ? "Free play" : FREE_PLAY_TITLE
    : feedback ? feedback.title : step.title;

  return (
    <div className="ax-card ax-learn" aria-live="polite" data-learn-phase={freePlay ? "free-play" : "guided"}>
      <div className="ax-learn-header" data-celebrating={status === "success"}>
        <p className="ax-card-title">{heading}</p>
        <span key={`${step.id}-${status}`} className="ax-learn-portrait" aria-hidden="true">
          <Image src="/archie.svg" alt="" width={518} height={400} />
        </span>
      </div>

      {freePlay ? (
        <>
          <ArchieDialogue>{skipped
            ? "Build, configure, and test your architecture."
            : FREE_PLAY_BODY}</ArchieDialogue>
          <button type="button" className="ax-learn-continue" onClick={onContinue}>
            Continue exploring
          </button>
        </>
      ) : status === "success" ? (
        <>
          <ArchieDialogue>{step.successExplanation}</ArchieDialogue>
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

      {error && <p className="ax-card-body mt-2" role="alert">{error}</p>}
    </div>
  );
}
