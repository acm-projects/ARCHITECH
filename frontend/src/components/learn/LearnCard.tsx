import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import { Check, GraduationCap, MousePointer2 } from "lucide-react";

import { FREE_PLAY_BODY, FREE_PLAY_TITLE, type ConnectionFeedback, type Lesson } from "./lessons";
import type { LessonStatus } from "./useLessonEngine";
import { ArchiePortrait } from "../workspace/ai/ArchiePanel";
import ComponentGlyph from "../workspace/ComponentGlyph";
import Panel, { PanelAction, PanelActions, PanelReveal, PanelText } from "../workspace/panel/Panel";
import { CATEGORY_ICONS } from "../workspace/toolbox/categoryIcons";
import { COMPONENT_CATALOG, FAMILY_COLORS, FAMILY_LABELS } from "../workspace/componentCatalog";
import "./learn-card.css";

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
    <span aria-hidden="true">
      {count >= text.length ? text : <>
        {text.slice(0, count)}<span style={{ visibility: "hidden" }}>{text.slice(count)}</span>
      </>}
    </span>
  </>;
}

// The components a lesson adds, in the order it adds them.
function lessonComponents(lesson: Lesson) {
  return lesson.steps.flatMap(({ objective }) => objective.kind === "node" ? [COMPONENT_CATALOG[objective.componentType]] : []);
}

// Archie's first words, with the system the lesson builds.
function LessonIntro({ lesson, onStart }: { lesson: Lesson; onStart: () => void }) {
  return (
    <div className="axl-intro">
      <div className="axl-hello">
        <Image src="/archie.svg" alt="Archie" width={518} height={400} className="axl-mascot" />
        <div>
          <p className="axl-hello-title">Hi, I&apos;m Archie!</p>
          <p className="axl-hello-text"><DialogueText text="I'll help you build your first web system, one piece at a time." /></p>
        </div>
      </div>
      <ul className="axl-parts" aria-label="Components in this lesson">
        {lessonComponents(lesson).map((component) => (
          <li key={component.type} style={{ "--axl-family": FAMILY_COLORS[component.family] } as CSSProperties}>
            <span className="axl-tile"><ComponentGlyph type={component.type} /></span>
            {component.label}
          </li>
        ))}
      </ul>
      <PanelActions>
        <PanelAction variant="primary" onClick={onStart}>Start lesson</PanelAction>
      </PanelActions>
    </div>
  );
}

function LessonProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="axl-progress" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} data-state={index < done ? "done" : index === done ? "current" : undefined} />
      ))}
    </div>
  );
}

// The lesson speaks through the Archie panel. The canvas stays interactive throughout.
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
  // Local on purpose: an empty canvas is a fair moment for him to say hello again.
  const [started, setStarted] = useState(false);
  const step = lesson.steps[stepIndex];
  const total = lesson.steps.length;
  const succeeded = !freePlay && status === "success";
  const retrying = !freePlay && !succeeded && Boolean(feedback);
  const guided = !freePlay && !succeeded && !retrying;
  // Building in the first step counts as starting.
  const intro = guided && !started && stepIndex === 0;
  // Add-component instructions follow the catalog when a component moves categories.
  const category = step.objective.kind === "node"
    ? COMPONENT_CATALOG[step.objective.componentType].family
    : null;
  const CategoryIcon = category ? CATEGORY_ICONS[category] : null;
  const heading = freePlay
    ? skipped ? "Free play" : FREE_PLAY_TITLE
    : succeeded ? step.successMessage
    : feedback ? feedback.title : step.title;
  const message = freePlay
    ? skipped ? "Build, configure, and test your architecture." : FREE_PLAY_BODY
    : succeeded ? step.successExplanation
    : feedback ? feedback.explanation : step.description;

  return (
    <Panel
      label="Lesson guidance"
      icon={<GraduationCap size={17} aria-hidden="true" />}
      title={lesson.title}
      status={freePlay || intro ? undefined : `${stepIndex + 1} of ${total}`}
    >
      <div aria-live="polite">
        {intro ? <LessonIntro lesson={lesson} onStart={() => setStarted(true)} /> : (
          <>
            <LessonProgress done={freePlay ? total : succeeded ? stepIndex + 1 : stepIndex} total={total} />
            <div className="axl-say">
              <span key={`${step.id}-${status}`} className="axl-face" data-nod={succeeded || freePlay || undefined}>
                <ArchiePortrait />
              </span>
              <div>
                <p className="axl-say-title">
                  {succeeded && <span className="axl-done"><Check size={12} strokeWidth={3} aria-hidden="true" /></span>}
                  {heading}
                </p>
                <p className="axl-say-text">
                  <span className="sr-only">Archie: </span>
                  <DialogueText key={message} text={message} />
                </p>
              </div>
            </div>

            {guided && (
              <div className="axl-task">
                <p className="axl-task-label">Your turn</p>
                <ul>
                  {CategoryIcon && category && (
                    <li>
                      <CategoryIcon size={16} color={FAMILY_COLORS[category]} aria-hidden="true" />
                      <span>Open <strong>{FAMILY_LABELS[category]}</strong> in the bottom toolbar</span>
                    </li>
                  )}
                  <li>
                    <MousePointer2 size={16} aria-hidden="true" />
                    <span>{step.instruction}</span>
                  </li>
                </ul>
              </div>
            )}
            {guided && hint && <PanelReveal label="Hint">{hint}</PanelReveal>}

            {(freePlay || succeeded) && (
              <PanelActions>
                <PanelAction variant="primary" onClick={onContinue}>{freePlay ? "Continue exploring" : "Continue"}</PanelAction>
              </PanelActions>
            )}
            {retrying && (
              <PanelActions>
                <PanelAction variant="primary" onClick={onDismissFeedback}>Try again</PanelAction>
              </PanelActions>
            )}
          </>
        )}

        {error && <PanelText tone="danger" role="alert">{error}</PanelText>}
      </div>
    </Panel>
  );
}
