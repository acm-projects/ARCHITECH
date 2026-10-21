"use client";

import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import ArchiePanel from "../workspace/ai/ArchiePanel";
import { ArchieMessage, ArchieStarters } from "../workspace/ai/ArchieConversation";
import {
  NETFLIX_COMPONENTS,
  NETFLIX_SOURCES,
  NETFLIX_STEPS,
  netflixStepIndex,
  type NetflixComponentId,
  type NetflixConnection,
  type NetflixNavigation,
  type NetflixProgress,
} from "./netflix";

type NetflixGuideProps = {
  progress: NetflixProgress;
  connections: readonly NetflixConnection[];
  onNavigate: (action: NetflixNavigation) => void;
};

const FOLLOWUPS = [
  { id: "connections", question: "How does it connect?" },
  { id: "tradeoff", question: "What's the tradeoff?" },
] as const;
type FollowupId = typeof FOLLOWUPS[number]["id"];
type StepId = typeof NETFLIX_STEPS[number];
const NO_FOLLOWUPS: readonly FollowupId[] = [];
const LABELS = new Map(NETFLIX_COMPONENTS.map(component => [component.id, component.label]));
const REVIEW = "That's the full system. Application services handle browsing and playback setup. Open Connect sends the video. Encoding and file distribution prepare it ahead of time. Select a component to go over its connections again.";

function showExchange(container: HTMLDivElement | null, exchange: HTMLDivElement | undefined) {
  if (!container || !exchange) return;
  const padding = parseFloat(getComputedStyle(container).paddingTop);
  const top = container.scrollTop + exchange.getBoundingClientRect().top - container.getBoundingClientRect().top - padding;
  container.scrollTo({ top: Math.max(0, top) });
}

function Endpoint({ id, current, onNavigate }: {
  id: NetflixComponentId;
  current: NetflixComponentId;
  onNavigate: NetflixGuideProps["onNavigate"];
}) {
  return id === current ? <span>{LABELS.get(id)}</span> : (
    <button type="button" onClick={() => onNavigate(netflixStepIndex(id))}>{LABELS.get(id)}</button>
  );
}

export default function NetflixGuide({ progress, connections, onNavigate }: NetflixGuideProps) {
  const { stepIndex, revealedCount } = progress;
  const step = NETFLIX_STEPS[stepIndex];
  const component: typeof NETFLIX_COMPONENTS[number] | undefined = NETFLIX_COMPONENTS[stepIndex];
  const complete = stepIndex === NETFLIX_COMPONENTS.length;
  const connected = component ? connections.filter(edge => edge.source === component.id || edge.target === component.id) : [];
  const sources = component ? component.sources.map(id => NETFLIX_SOURCES[id]) : Object.values(NETFLIX_SOURCES);
  const nextComponent = NETFLIX_COMPONENTS[revealedCount];
  const focusLabel = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const exchanges = useRef(new Map<FollowupId, HTMLDivElement>());
  const pendingReply = useRef<FollowupId | null>(null);
  // Preset replies are local to each component. Revisiting a node keeps its
  // conversation; nothing is sent to the live chat API or persisted.
  const [askedByStep, setAskedByStep] = useState<Partial<Record<StepId, readonly FollowupId[]>>>({});
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
  const inspectConnection = (action: NetflixNavigation) => {
    // The reply is replaced when focus changes; keep keyboard focus on the
    // persistent component label instead of a removed connection button.
    focusLabel.current?.focus();
    onNavigate(action);
  };

  return (
    <ArchiePanel
      label="Archie walkthrough"
      className="ax-breakdown-guide"
      messageKey={step}
      messageRef={list}
      focus={<>
        <span className="ax-ai-focus-chip" ref={focusLabel} tabIndex={-1}>
          <span className="ax-ai-focus-name">{component?.label ?? "Full system"}</span>
        </span>
        {component && <span className="ax-ai-hint">{component.chapter}</span>}
      </>}
      footer={
        <div className="ax-ai-composer ax-breakdown-composer">
          <nav className="ax-breakdown-navigation" aria-label="Walkthrough steps">
            <button type="button" className="ax-breakdown-back" aria-label="Previous component" title="View the previous component" onClick={() => onNavigate("previous")} disabled={stepIndex === 0}>
              <ArrowLeft size={12} aria-hidden="true" /><span>Previous</span>
            </button>
            <span className="ax-ai-hint" role="status" aria-label={`${revealedCount} of ${NETFLIX_COMPONENTS.length} components built`}>{revealedCount}/{NETFLIX_COMPONENTS.length} built</span>
            <button type="button" className="ax-ai-send ax-breakdown-next" title={nextComponent ? `Continue building: add ${nextComponent.label}` : undefined} onClick={() => onNavigate("next")}>
              {complete ? "Start over" : nextComponent ? `Add ${nextComponent.label}` : "Review system"} <ArrowRight size={13} aria-hidden="true" />
            </button>
          </nav>
        </div>
      }
    >
      <ArchieMessage role="assistant">
        <p className="ax-ai-answer">{component?.explanation ?? REVIEW}</p>
        {component && <p className="ax-ai-answer">{component.why}</p>}
        <details className="ax-breakdown-sources">
          <summary>Sources &amp; simplifications <ChevronDown size={11} aria-hidden="true" /></summary>
          <p>This is an on-demand streaming example, not Netflix&apos;s live production map. Application services and data stores are grouped. DRM, monitoring and regional failover are not drawn in full.</p>
          <ul>{sources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.title} {"\u2197"}</a></li>)}</ul>
          <p>The API and storage articles describe earlier Netflix designs. Cache placement and the shared API edge are teaching choices.</p>
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
                      <Endpoint id={edge.source} current={component.id} onNavigate={inspectConnection} />
                      <span aria-hidden="true">{" \u2192 "}</span>
                      <Endpoint id={edge.target} current={component.id} onNavigate={inspectConnection} />
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
