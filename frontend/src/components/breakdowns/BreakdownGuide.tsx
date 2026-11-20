"use client";

import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import ComponentGlyph from "../workspace/ComponentGlyph";
import ArchiePanel from "../workspace/ai/ArchiePanel";
import { ArchieMessage, ArchieStarters } from "../workspace/ai/ArchieConversation";
import type {
  BreakdownComponent,
  BreakdownConnection,
  BreakdownNavigation,
  BreakdownProgress,
  BreakdownSource,
  Walkthrough,
} from "./walkthrough";

// What Archie says about a breakdown: its components, sources and what the drawing leaves out.
export type BreakdownGuideContent = {
  components: readonly BreakdownComponent[];
  walkthrough: Walkthrough;
  sources: Readonly<Record<string, BreakdownSource>>;
  review: string;
  notes: { scope: string; caveat?: string };
};

type BreakdownGuideProps = {
  guide: BreakdownGuideContent;
  progress: BreakdownProgress;
  connections: readonly BreakdownConnection[];
  onNavigate: (action: BreakdownNavigation) => void;
};

const FOLLOWUPS = [
  { id: "connections", question: "How does it connect?" },
  { id: "tradeoff", question: "What's the tradeoff?" },
] as const;
type FollowupId = typeof FOLLOWUPS[number]["id"];
const NO_FOLLOWUPS: readonly FollowupId[] = [];

function showExchange(container: HTMLDivElement | null, exchange: HTMLDivElement | undefined) {
  if (!container || !exchange) return;
  const padding = parseFloat(getComputedStyle(container).paddingTop);
  const top = container.scrollTop + exchange.getBoundingClientRect().top - container.getBoundingClientRect().top - padding;
  container.scrollTo({ top: Math.max(0, top) });
}

function Endpoint({ id, current, guide, onNavigate }: {
  id: string;
  current: string;
  guide: BreakdownGuideContent;
  onNavigate: BreakdownGuideProps["onNavigate"];
}) {
  const label = guide.components.find(component => component.id === id)?.label ?? id;
  return id === current ? <span>{label}</span> : (
    <button type="button" onClick={() => onNavigate(guide.walkthrough.stepIndex(id))}>{label}</button>
  );
}

export default function BreakdownGuide({ guide, progress, connections, onNavigate }: BreakdownGuideProps) {
  const { components } = guide;
  const { stepIndex, revealedCount } = progress;
  const step = guide.walkthrough.steps[stepIndex]!;
  const component: BreakdownComponent | undefined = components[stepIndex];
  const complete = stepIndex === components.length;
  const connected = component ? connections.filter(edge => edge.source === component.id || edge.target === component.id) : [];
  const sources = (component ? component.sources : Object.keys(guide.sources))
    .map(id => guide.sources[id])
    .filter((source): source is BreakdownSource => Boolean(source));
  const nextComponent: BreakdownComponent | undefined = components[revealedCount];
  const focusLabel = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const exchanges = useRef(new Map<FollowupId, HTMLDivElement>());
  const pendingReply = useRef<FollowupId | null>(null);
  // Preset replies are local to each component. Revisiting a node keeps its
  // conversation; nothing is sent to the live chat API or persisted.
  const [askedByStep, setAskedByStep] = useState<Partial<Record<string, readonly FollowupId[]>>>({});
  const asked = askedByStep[step] ?? NO_FOLLOWUPS;
  const ask = (question: string) => {
    const followup = FOLLOWUPS.find(item => item.question === question);
    if (!followup) return;
    if (asked.includes(followup.id)) {
      showExchange(list.current, exchanges.current.get(followup.id));
      return;
    }
    pendingReply.current = followup.id;
    setAskedByStep(previous => {
      const existing = previous[step] ?? NO_FOLLOWUPS;
      if (existing.includes(followup.id)) return previous;
      return { ...previous, [step]: [...existing, followup.id] };
    });
  };
  useLayoutEffect(() => {
    // Only an explicit question moves the reading position. Anchor its question
    // bubble rather than jumping past it to the bottom of a long answer.
    if (pendingReply.current) {
      showExchange(list.current, exchanges.current.get(pendingReply.current));
      pendingReply.current = null;
    }
  }, [step, asked]);
  const inspectConnection = (action: BreakdownNavigation) => {
    // The reply is replaced when focus changes; keep keyboard focus on the
    // persistent component label instead of a removed connection button.
    focusLabel.current?.focus();
    onNavigate(action);
  };

  return (
    <ArchiePanel
      label="Archie walkthrough"
      className="ax-breakdown-guide"
      headerAction={<span className="ax-breakdown-progress" role="status" aria-label={`${revealedCount} of ${components.length} components built`}>{revealedCount}/{components.length} built</span>}
      messageKey={step}
      messageRef={list}
      focus={<>
        <span className="ax-ai-focus-chip" ref={focusLabel} tabIndex={-1}>
          {component && <ComponentGlyph type={component.type} />}
          <span className="ax-ai-focus-name">{component?.label ?? "Full system"}</span>
        </span>
        {component && component.chapter !== component.label && <span className="ax-ai-hint">{component.chapter}</span>}
      </>}
      footer={
        <div className="ax-ai-composer ax-breakdown-composer">
          <nav className="ax-breakdown-navigation" aria-label="Walkthrough steps">
            <button type="button" className="ax-breakdown-back" aria-label="Previous component" title="View the previous component" onClick={() => onNavigate("previous")} disabled={stepIndex === 0}>
              <ArrowLeft size={12} aria-hidden="true" /><span>Previous</span>
            </button>
            <button type="button" className="ax-ai-send ax-breakdown-next" title={nextComponent ? `Continue building: add ${nextComponent.label}` : undefined} onClick={() => onNavigate("next")}>
              {complete ? "Start over" : nextComponent ? `Add ${nextComponent.label}` : "Review system"} <ArrowRight size={13} aria-hidden="true" />
            </button>
          </nav>
        </div>
      }
    >
      {/* The panel header already identifies the opening explanation. Replies retain their speaker. */}
      <ArchieMessage role="assistant" showSpeaker={false}>
        <p className="ax-ai-answer">{component?.explanation ?? guide.review}</p>
        {component && <p className="ax-ai-answer">{component.why}</p>}
        <details className="ax-breakdown-sources">
          <summary>Sources &amp; simplifications <ChevronDown size={11} aria-hidden="true" /></summary>
          <p>{guide.notes.scope}</p>
          <ul>{sources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.title} {"\u2197"}</a></li>)}</ul>
          {guide.notes.caveat && <p>{guide.notes.caveat}</p>}
        </details>
      </ArchieMessage>
      {asked.map(id => (
        <div key={id} className="ax-breakdown-exchange" ref={element => {
          if (element) exchanges.current.set(id, element);
          else exchanges.current.delete(id);
        }}>
          <ArchieMessage role="user">{FOLLOWUPS.find(item => item.id === id)!.question}</ArchieMessage>
          <ArchieMessage role="assistant">
            {id === "connections" && component && <>
              <p className="ax-ai-answer">{component.flow}</p>
              {connected.length > 0 && <ul className="ax-breakdown-connections">
                {connected.map(edge => (
                  <li key={edge.id}>
                    <div>
                      <Endpoint id={edge.source} current={component.id} guide={guide} onNavigate={inspectConnection} />
                      <span aria-hidden="true">{" \u2192 "}</span>
                      <Endpoint id={edge.target} current={component.id} guide={guide} onNavigate={inspectConnection} />
                    </div>
                    <p>{edge.purpose}</p>
                  </li>
                ))}
              </ul>}
            </>}
            {id === "tradeoff" && component && <p className="ax-ai-answer">{component.tradeoff}</p>}
          </ArchieMessage>
        </div>
      ))}
      {component && <ArchieStarters key={step} questions={FOLLOWUPS.map(item => item.question)} dismissedQuestions={asked.map(id => FOLLOWUPS.find(item => item.id === id)!.question)} onAsk={ask} />}
    </ArchiePanel>
  );
}
