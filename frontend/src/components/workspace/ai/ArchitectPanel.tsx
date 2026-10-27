"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";

import type { Edge } from "@xyflow/react";
import { useOnSelectionChange, useReactFlow, useStore } from "@xyflow/react";
import { ArrowLeft, BoxSelect, MessageSquarePlus, Send, Square, X } from "lucide-react";

import type { MetricsSnapshot, SuggestionEvent } from "../../../lib/ai/architectChat";
import { applyChanges } from "../../../lib/ai/changes";
import {
  askArchitect,
  fetchUsage,
  loadConversation,
  saveConversation,
  usageLabel,
  type UsageInfo,
} from "../../../lib/ai/chatClient";
import { buildChatHistory, validateConversation, type SavedTurn } from "../../../lib/ai/conversation";
import type { CustomTechnology } from "../../../lib/projects/customTechnologies";
import { graphFromCanvas } from "../../../lib/projects/projectPayload";
import { DesignTrafficContext } from "../DesignTrafficContext";
import { ArchieEnabledContext } from "../ArchieContext";
import type { ArchitectureFlowNode } from "../nodes/ArchitectureNode";
import ArchiePanel, { ArchiePortrait } from "./ArchiePanel";
import { ArchieMessage, ArchieStarters } from "./ArchieConversation";

// The AI Architect: a chat docked to the right of the canvas. It sends the current design,
// traffic and conversation to POST /api/ai/chat, shows the answer as it streams in, and shows
// each suggested change with its before/after numbers and an Apply button. Applying uses the
// same function the server previewed with, as one undo step.
//
// Focus: whatever is selected on the canvas (drag a box on empty canvas) is
// sent as the focus, and the answer is about that part only: its components, how they connect,
// and what goes in and out of it.

type AssistantTurn = {
  id: number;
  role: "assistant";
  text: string;
  suggestions: SuggestionEvent[];
  notes: string[];
  error?: string;
  done: boolean;
  // Suggestion id -> "applied", or why it could not be applied.
  applied: Record<string, string>;
};
type Turn = { id: number; role: "user"; text: string; focusCount: number } | AssistantTurn;

const STARTERS = ["What breaks first as traffic grows?", "How can I make this more reliable?", "How can I make this cheaper?"];
const FOCUS_STARTERS = ["Explain this part of the system", "What goes in and out of this part?", "Is this part a bottleneck or a single point of failure?"];

const components = (count: number) => `${count} component${count === 1 ? "" : "s"}`;

// Saved form: finished turns only, without the panel's ids.
function toSaved(turns: readonly Turn[]): SavedTurn[] {
  return turns.flatMap((turn): SavedTurn[] => {
    if (turn.role === "user") return [{ role: "user", text: turn.text, focusCount: turn.focusCount }];
    if (!turn.done) return [];
    const { text, suggestions, notes, applied, error } = turn;
    return [{ role: "assistant", text, suggestions, notes, applied, ...(error ? { error } : {}) }];
  });
}

function fromSaved(saved: readonly SavedTurn[], nextId: () => number): Turn[] {
  return saved.map((turn) =>
    turn.role === "user"
      ? { id: nextId(), role: "user", text: turn.text, focusCount: turn.focusCount }
      : { id: nextId(), role: "assistant", text: turn.text, suggestions: turn.suggestions, notes: turn.notes, applied: turn.applied, done: true, ...(turn.error ? { error: turn.error } : {}) },
  );
}

const SAVE_DELAY_MS = 600;

export function ArchitectToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const archieEnabled = useContext(ArchieEnabledContext);
  if (open) return null;
  return (
    <button
      type="button"
      className="ax-ai-toggle"
      onClick={onToggle}
      aria-label="Open Archie"
      disabled={!archieEnabled}
      title={!archieEnabled ? "Available after Continue exploring." : undefined}
    >
      <ArchiePortrait />
      Ask Archie
    </button>
  );
}

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const rate = (value: number | null) => (value === null ? "unlimited" : `${Math.round(value).toLocaleString("en-US")} req/s`);

function PreviewRow({ label, before, after, format, higherIsBetter }: {
  label: string;
  before: number | null;
  after: number | null;
  format: (value: number | null) => string;
  higherIsBetter: boolean;
}) {
  const changed = before !== after;
  const better =
    before !== null && after !== null ? (higherIsBetter ? after > before : after < before) : after === null && higherIsBetter;
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {format(before)}
        {changed && (
          <>
            {" → "}
            <span className={better ? "ax-ai-better" : "ax-ai-worse"}>{format(after)}</span>
          </>
        )}
      </dd>
    </>
  );
}

function SuggestionCard({ suggestion, status, onApply, streaming }: {
  suggestion: SuggestionEvent;
  status: string | undefined;
  onApply: () => void;
  // Apply waits until the whole answer has arrived.
  streaming: boolean;
}) {
  const { before, after }: { before: MetricsSnapshot; after: MetricsSnapshot } = suggestion.preview;
  return (
    <div className="ax-ai-suggestion">
      <p className="ax-ai-suggestion-title">{suggestion.title}</p>
      {suggestion.reason && <p className="ax-ai-suggestion-reason">{suggestion.reason}</p>}
      <dl className="ax-ai-preview" aria-label="What this change does to the design">
        <PreviewRow label="Score" before={before.score} after={after.score} format={(v) => String(v)} higherIsBetter />
        <PreviewRow label="Capacity" before={before.capacityRps} after={after.capacityRps} format={rate} higherIsBetter />
        <PreviewRow label="p95" before={before.p95LatencyMs} after={after.p95LatencyMs} format={(v) => `${v} ms`} higherIsBetter={false} />
        <PreviewRow label="Cost" before={before.monthlyCost} after={after.monthlyCost} format={(v) => `${money(v ?? 0)}/mo`} higherIsBetter={false} />
        <PreviewRow label="Uptime" before={before.uptimePercent} after={after.uptimePercent} format={(v) => `${v}%`} higherIsBetter />
      </dl>
      <div className="ax-ai-apply-row">
        {status === "applied" ? (
          <span className="ax-ai-applied">Applied · undo with Ctrl/Cmd+Z</span>
        ) : (
          <button type="button" className="ax-ai-apply" onClick={onApply} disabled={streaming}>
            Apply
          </button>
        )}
        {status && status !== "applied" && <span className="ax-ai-error">{status}</span>}
      </div>
    </div>
  );
}

export default function ArchitectPanel({
  projectId,
  onClose,
  backLabel,
  embedded = false,
  onApply,
  customTechnologies,
}: {
  // The conversation is saved with this project and restored when the panel opens.
  projectId: string;
  onClose: () => void;
  backLabel?: string;
  embedded?: boolean;
  // Replaces the design in one undo step.
  onApply: (next: { nodes: ArchitectureFlowNode[]; edges: Edge[] }) => void;
  customTechnologies?: readonly CustomTechnology[];
}) {
  const { getNodes, getEdges, setNodes } = useReactFlow<ArchitectureFlowNode, Edge>();
  const [focus, setFocus] = useState<string[]>(() => getNodes().filter((node) => node.selected).map((node) => node.id));
  useOnSelectionChange({
    onChange: useCallback(({ nodes }: { nodes: { id: string }[] }) => setFocus(nodes.map((node) => node.id)), []),
  });
  const focusedName = useStore((state) => {
    if (focus.length !== 1) return null;
    const label = state.nodeLookup.get(focus[0])?.data.label;
    return typeof label === "string" && label.trim() ? label : "Component";
  });
  const clearFocus = () => setNodes((all) => all.map((node) => (node.selected ? { ...node, selected: false } : node)));
  const traffic = useContext(DesignTrafficContext);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (turns.length > 0) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns]);
  useEffect(() => () => abort.current?.abort(), []);

  // Restore the saved conversation once, then save after each finished answer or applied
  // suggestion (only when something changed).
  const [restored, setRestored] = useState(false);
  const lastSaved = useRef("[]");
  useEffect(() => {
    const controller = new AbortController();
    void loadConversation(projectId, controller.signal).then((raw) => {
      if (controller.signal.aborted) return;
      const parsed = raw ? validateConversation({ turns: raw }) : null;
      if (parsed?.ok) {
        lastSaved.current = JSON.stringify(parsed.value);
        setTurns((current) => (current.length === 0 ? fromSaved(parsed.value, () => nextId.current++) : current));
      }
      setRestored(true);
    });
    return () => controller.abort();
  }, [projectId]);
  useEffect(() => {
    if (!restored || busy) return;
    const saved = toSaved(turns);
    const text = JSON.stringify(saved);
    if (text === lastSaved.current) return;
    const timer = setTimeout(() => {
      void saveConversation(projectId, saved).then((ok) => {
        if (ok) lastSaved.current = text;
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [turns, busy, restored, projectId]);
  const newChat = () => {
    abort.current?.abort();
    setTurns([]);
  };
  // Questions left today: read when the panel opens, then from each answer's headers.
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchUsage(controller.signal).then((value) => {
      if (value && !controller.signal.aborted) setUsage(value);
    });
    return () => controller.abort();
  }, []);

  const updateAssistant = (id: number, change: (turn: AssistantTurn) => AssistantTurn) =>
    setTurns((all) => all.map((turn) => (turn.id === id && turn.role === "assistant" ? change(turn) : turn)));

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const messages = buildChatHistory(turns, text);
    const userId = nextId.current++;
    const answerId = nextId.current++;
    setTurns((all) => [
      ...all,
      { id: userId, role: "user", text, focusCount: focus.length },
      { id: answerId, role: "assistant", text: "", suggestions: [], notes: [], done: false, applied: {} },
    ]);
    setDraft("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await askArchitect({
        graph: graphFromCanvas(getNodes(), getEdges(), customTechnologies ? [...customTechnologies] : undefined),
        traffic,
        messages,
        focus,
        signal: controller.signal,
        onUsage: setUsage,
        onEvent: (event) => {
          if (event.type === "text") updateAssistant(answerId, (turn) => ({ ...turn, text: turn.text + event.text }));
          else if (event.type === "suggestion") updateAssistant(answerId, (turn) => ({ ...turn, suggestions: [...turn.suggestions, event] }));
          else if (event.type === "note") updateAssistant(answerId, (turn) => ({ ...turn, notes: [...turn.notes, event.text] }));
          else if (event.type === "error") updateAssistant(answerId, (turn) => ({ ...turn, error: event.error }));
          else if (event.type === "done") updateAssistant(answerId, (turn) => ({ ...turn, done: true }));
        },
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        updateAssistant(answerId, (turn) => ({ ...turn, error: "Could not reach Archie. Check your connection and try again." }));
      } else {
        updateAssistant(answerId, (turn) => ({ ...turn, notes: [...turn.notes, "Stopped."] }));
      }
      void error;
    } finally {
      updateAssistant(answerId, (turn) => ({ ...turn, done: true }));
      setBusy(false);
      abort.current = null;
    }
  };

  const apply = (turnId: number, suggestion: SuggestionEvent) => {
    const result = applyChanges({ nodes: getNodes(), edges: getEdges() }, suggestion.changes);
    if (!result.ok) {
      updateAssistant(turnId, (turn) => ({
        ...turn,
        applied: { ...turn.applied, [suggestion.id]: `It no longer fits your design: ${result.error}` },
      }));
      return;
    }
    onApply({ nodes: result.nodes, edges: result.edges });
    updateAssistant(turnId, (turn) => ({ ...turn, applied: { ...turn.applied, [suggestion.id]: "applied" } }));
  };

  return (
    <ArchiePanel
      embedded={embedded}
      empty={turns.length === 0}
      messageRef={list}
      headerAction={
        <span className="ax-ai-header-actions">
          {turns.length > 0 && (
            <button type="button" className="ax-icon-btn" aria-label="Start a new conversation" title="New chat" onClick={newChat} disabled={busy}>
              <MessageSquarePlus size={14} aria-hidden="true" />
            </button>
          )}
          {!embedded && (
            <button type="button" className="ax-icon-btn" aria-label={backLabel ?? "Close Archie"} title={backLabel} onClick={onClose}>
              {backLabel ? <ArrowLeft size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
            </button>
          )}
        </span>
      }
      focus={<>
        {focus.length === 0 && (
          <span className="ax-ai-focus-hint" title="Drag a box on empty canvas to ask about just that part">
            <BoxSelect size={13} aria-hidden="true" />
            Whole design · drag to focus
          </span>
        )}
        {focus.length > 0 && (
          <span className="ax-ai-focus-chip">
            <span className="ax-ai-focus-name">{focusedName ?? components(focus.length)}</span>
            <button type="button" aria-label="Clear the selection and ask about the whole design" onClick={clearFocus}>
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        )}
      </>}
      footer={
        <form
          className="ax-ai-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <textarea
            className="ax-ai-input"
            value={draft}
            disabled={busy}
            maxLength={4_000}
            placeholder={focus.length > 0 ? "Ask Archie about the selected part…" : "Ask Archie about your architecture…"}
            aria-label="Ask Archie"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
          />
          <div className="ax-ai-composer-row">
            <span className="ax-ai-hint">
              {usage ? (
                <span className={usage.remainingToday <= 5 ? "ax-ai-usage-low" : undefined} title={usageLabel(usage)}>
                  {usage.remainingToday} question{usage.remainingToday === 1 ? "" : "s"} left today
                </span>
              ) : (
                "Enter to send · Shift+Enter for a new line"
              )}
            </span>
            {busy ? (
              <button type="button" className="ax-ai-send" onClick={() => abort.current?.abort()}>
                <Square size={11} aria-hidden="true" /> Stop
              </button>
            ) : (
              <button type="submit" className="ax-ai-send" disabled={!draft.trim()}>
                <Send size={12} aria-hidden="true" /> Send
              </button>
            )}
          </div>
        </form>
      }
    >
      {turns.length === 0 && (
        <div className="ax-ai-empty">
          <ArchieMessage role="assistant">
            <p className="ax-ai-answer">
              {focus.length > 0
                ? focus.length === 1
                  ? "Ask how this component works, connects, or affects your system."
                  : "Ask how these components work, connect, or affect your system."
                : "Ask about traffic, reliability, or cost. Preview changes before applying them."}
            </p>
          </ArchieMessage>
          <ArchieStarters questions={focus.length > 0 ? FOCUS_STARTERS : STARTERS} onAsk={question => void ask(question)} />
        </div>
      )}
      {turns.map((turn) =>
        turn.role === "user" ? (
          <ArchieMessage key={turn.id} role="user" focusLabel={turn.focusCount > 0 ? `About ${components(turn.focusCount)}` : undefined}>
            {turn.text}
          </ArchieMessage>
        ) : (
          <ArchieMessage key={turn.id} role="assistant">
            {turn.text && <p className="ax-ai-answer">{turn.text}</p>}
            {!turn.text && !turn.done && !turn.error && <p className="ax-ai-thinking">Looking at your design…</p>}
            {turn.suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                status={turn.applied[suggestion.id]}
                streaming={!turn.done}
                onApply={() => apply(turn.id, suggestion)}
              />
            ))}
            {turn.notes.map((note, index) => (
              <p key={index} className="ax-ai-note">{note}</p>
            ))}
            {turn.error && <p role="alert" className="ax-ai-error">{turn.error}</p>}
          </ArchieMessage>
        ),
      )}
    </ArchiePanel>
  );
}
