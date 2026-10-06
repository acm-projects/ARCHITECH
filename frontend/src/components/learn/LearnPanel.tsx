import type { LessonStep } from "./lessons";

type LearnPanelProps = {
  step: LessonStep;
  stepCount: number;
  onPrevious: () => void;
  onContinue: () => void;
};

const labelClass =
  "text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500";

export default function LearnPanel({
  step,
  stepCount,
  onPrevious,
  onContinue,
}: LearnPanelProps) {
  const isFirst = step.id === 1;
  const isLast = step.id === stepCount;

  return (
    <aside className="flex max-h-64 shrink-0 flex-col overflow-y-auto border-t border-neutral-200 md:max-h-none md:w-72 md:border-l md:border-t-0">
      <h2 className={`border-b border-neutral-200 px-4 py-3 ${labelClass}`}>
        Learn
      </h2>

      <div className="flex-1 space-y-4 px-4 py-3 text-sm">
        <p className={labelClass}>
          Step {step.id} of {stepCount}
        </p>
        <h3 className="text-base font-semibold">{step.title}</h3>
        <p>{step.description}</p>

        <div>
          <p className={labelClass}>Task</p>
          <p className="mt-1">{step.instruction}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-sm">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isFirst}
          className="text-neutral-500 transition-colors hover:text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-neutral-500 motion-reduce:transition-none"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="bg-[#0A0A0A] px-3 py-1.5 text-white transition-opacity hover:opacity-80 motion-reduce:transition-none"
        >
          {isLast ? "Finish" : "Continue →"}
        </button>
      </div>
    </aside>
  );
}
