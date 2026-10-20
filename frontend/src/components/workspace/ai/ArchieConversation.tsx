import { ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";

export function ArchieMessage({ role, children, focusLabel }: {
  role: "user" | "assistant";
  children: ReactNode;
  focusLabel?: string;
}) {
  return role === "user" ? (
    <div className="ax-ai-user">
      {focusLabel && <span className="ax-ai-user-focus">{focusLabel}</span>}
      {children}
    </div>
  ) : (
    <div className="ax-ai-assistant">
      <span className="ax-ai-speaker">Archie</span>
      {children}
    </div>
  );
}

export function ArchieStarters({ questions, onAsk, dismissedQuestions = [] }: {
  questions: readonly string[];
  onAsk: (question: string) => void;
  dismissedQuestions?: readonly string[];
}) {
  const [hiddenQuestions, setHiddenQuestions] = useState(() => new Set(dismissedQuestions));
  const visibleQuestions = questions.filter(question => !hiddenQuestions.has(question));
  if (visibleQuestions.length === 0) return null;

  return (
    <div className="ax-ai-starters">
      {visibleQuestions.map(question => {
        const dismissing = dismissedQuestions.includes(question);
        return (
          <button
            key={question}
            type="button"
            className="ax-ai-starter"
            data-dismissed={dismissing || undefined}
            aria-disabled={dismissing || undefined}
            tabIndex={dismissing ? -1 : undefined}
            onClick={() => { if (!dismissing) onAsk(question); }}
            onAnimationEnd={event => {
              if (event.animationName !== "ax-ai-prompt-dismiss") return;
              // Keep keyboard focus on an available action when its prompt leaves.
              if (document.activeElement === event.currentTarget) {
                const next = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button:not([data-dismissed])")
                  ?? event.currentTarget.closest(".ax-ai-panel")?.querySelector<HTMLButtonElement>(".ax-ai-send");
                next?.focus({ preventScroll: true });
              }
              setHiddenQuestions(previous => new Set([...previous, question]));
            }}
          >
            <span>{question}</span>
            <ArrowUpRight size={12} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

