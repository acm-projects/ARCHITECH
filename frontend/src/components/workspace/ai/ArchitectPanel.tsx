"use client";

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { Edge } from "@xyflow/react";
import { useOnSelectionChange, useReactFlow, useStore } from "@xyflow/react";
import { ArrowDown, Check, ChevronDown, MessageSquarePlus, Send, Square, X } from "lucide-react";

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
import Panel, { PanelAction, PanelActions, PanelChange, PanelDelta, PanelGroup, PanelLink, PanelRow, PanelStats, PanelText } from "../panel/Panel";
import { ArchiePortrait } from "./ArchiePanel";
import { noticeHeadline, noticeOutcome, noticeTitle } from "../../../lib/architecture/archie/notices";
import { SEVERITY_WORD } from "../../../lib/architecture/designCheck";
import type { PostedNotice } from "../useArchieNotices";

// The AI Architect: a chat docked to the right of the canvas. It sends the current design,
// traffic and conversation to POST /api/ai/chat, shows the answer as it streams in, and shows
// each suggested change with its before/after numbers and an Apply button. Applying uses the
// same function the server previewed with, as one undo step.
//
// Focus: whatever is selected on the canvas (Shift+drag a box, or Ctrl/Cmd-click components) is
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
  at: number;
};
type Turn = ({ id: number; role: "user"; text: string; focusCount: number } | AssistantTurn) & {
  // When the turn was asked, to place it among the design notices. Restored turns come first.
  at: number;
};

const STARTERS = ["What breaks first as traffic grows?", "How can I make this more reliable?", "How can I make this cheaper?"];
// Short enough to read whole in the panel's width.
const FOCUS_STARTERS = ["Explain this part of the system", "What goes in and out of this part?", "Bottleneck or single point of failure?"];

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
      ? { id: nextId(), role: "user", text: turn.text, focusCount: turn.focusCount, at: 0 }
      : { id: nextId(), role: "assistant", text: turn.text, suggestions: turn.suggestions, notes: turn.notes, applied: turn.applied, done: true, at: 0, ...(turn.error ? { error: turn.error } : {}) },
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

// Only what the change moves: an unchanged number says nothing about a suggestion.
function PreviewRow({ label, before, after, format, higherIsBetter }: {
  label: string;
  before: number | null;
  after: number | null;
  format: (value: number | null) => string;
  higherIsBetter: boolean;
}) {
  if (before === after) return null;
  const better =
    before !== null && after !== null ? (higherIsBetter ? after > before : after < before) : after === null && higherIsBetter;
  return <PanelRow label={label} value={<>{format(before)} → <PanelDelta better={better}>{format(after)}</PanelDelta></>} />;
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
    <PanelGroup>
      <p className="axp-message"><strong>{suggestion.title}</strong></p>
      {suggestion.reason && <PanelText>{suggestion.reason}</PanelText>}
      <div aria-label="What this change does to the design">
        <PreviewRow label="Score" before={before.score} after={after.score} format={(v) => String(v)} higherIsBetter />
        <PreviewRow label="Capacity" before={before.capacityRps} after={after.capacityRps} format={rate} higherIsBetter />
        <PreviewRow label="p95 latency" before={before.p95LatencyMs} after={after.p95LatencyMs} format={(v) => `${v} ms`} higherIsBetter={false} />
        <PreviewRow label="Monthly cost" before={before.monthlyCost} after={after.monthlyCost} format={(v) => `${money(v ?? 0)}/mo`} higherIsBetter={false} />
        <PreviewRow label="Availability" before={before.uptimePercent} after={after.uptimePercent} format={(v) => `${v}%`} higherIsBetter />
      </div>
      {status === "applied" ? (
        <PanelText role="status">Applied · undo with Ctrl/Cmd+Z</PanelText>
      ) : (
        <PanelActions>
          <PanelAction onClick={onApply} disabled={streaming}>Apply</PanelAction>
        </PanelActions>
      )}
      {status && status !== "applied" && <PanelText role="alert" tone="danger">{status}</PanelText>}
    </PanelGroup>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// A notice from Archie about an edit. Folded, it is one line: what happened and when. Open, it
// adds the other edits, the numbers that moved (on one line), the problems it found (each opens
// in place with its fix) and the ones it resolved. Only the newest notice starts open, so a
// session of edits reads as a list of lines rather than pages of rows.
function NoticeMessage({ notice, open, onToggle, onOpenFinding }: {
  notice: PostedNotice;
  open: boolean;
  onToggle: () => void;
  onOpenFinding?: (findingId: string) => void;
}) {
  const tone = notice.kind === "check" ? undefined :
    notice.added.some((finding) => finding.severity !== "low") ? "worse"
      : notice.resolved.length > 0 && notice.added.length === 0 ? "better"
        : undefined;
  const outcome = noticeOutcome(notice);
  // Shown in full on hover: the sentence, every edit, and when.
  const detail = [noticeHeadline(notice), ...notice.edits.slice(1), clock(notice.at)].join("\n");
  const resolved = notice.resolved.map((finding) => finding.title);
  return (
    <div className="axp-notice" data-tone={tone} role="status" aria-label={noticeHeadline(notice)}>
      <button type="button" className="axp-notice-head" aria-expanded={open} title={detail} onClick={onToggle}>
        <span className="axp-notice-title">{noticeTitle(notice)}</span>
        {outcome && <span className="axp-small">{outcome}</span>}
        <ChevronDown size={14} aria-hidden="true" className="axp-go" />
      </button>
      {open && (
        <>
          {/* The numbers that moved, as they are now; the arrow says which way, and hovering
              shows what each was before. */}
          {notice.metrics.length > 0 && (
            <PanelStats
              label="What moved"
              stats={notice.metrics.slice(0, MAX_NOTICE_STATS).map((metric) => ({
                label: STAT_LABEL[metric.label] ?? metric.label,
                // "Cost /mo" already says per month.
                value: <>{metric.after.replace(/\/mo$/, "")}<PanelChange direction={metric.better ? "improved" : "regressed"} /></>,
                title: `${metric.label}: ${metric.before} → ${metric.after}`,
              }))}
            />
          )}
          {notice.added.map((finding) => (
            <PanelLink
              key={`added-${finding.id}`}
              item
              label={finding.title}
              value={SEVERITY_WORD[finding.severity]}
              title={notice.kind === "check" ? finding.title : `New: ${finding.title}`}
              disabled={!onOpenFinding}
              onClick={() => onOpenFinding?.(finding.id)}
            />
          ))}
          {resolved.length > 0 && (
            <PanelRow
              item
              lead={<PanelDelta better><Check size={14} aria-hidden="true" /></PanelDelta>}
              label={resolved.join(", ")}
              value={`${resolved.length} resolved`}
              title={`Resolved:\n${resolved.join("\n")}`}
            />
          )}
        </>
      )}
    </div>
  );
}

// The same short names as the numbers at the top of the panel, so a notice reads against them.
const STAT_LABEL: Record<string, string> = { "p95 latency": "p95", Availability: "Uptime", "Monthly cost": "Cost /mo" };
// Four fit the panel's width side by side.
const MAX_NOTICE_STATS = 4;

// The conversation in order: questions and answers one by one, and notices that came in one
// after another (with no question between them) kept together, so they can fold as one.
type FeedEntry = { key: string; turn: Turn } | { key: string; notices: PostedNotice[] };
function buildFeed(turns: readonly Turn[], notices: readonly PostedNotice[]): FeedEntry[] {
  const ordered = [
    ...turns.map((turn) => ({ at: turn.at, turn, notice: null })),
    ...notices.map((notice) => ({ at: notice.at, turn: null, notice })),
  ].sort((a, b) => a.at - b.at);
  const feed: FeedEntry[] = [];
  for (const item of ordered) {
    const last = feed.at(-1);
    if (item.notice && last && "notices" in last) last.notices.push(item.notice);
    else if (item.notice) feed.push({ key: `notices-${item.notice.id}`, notices: [item.notice] });
    else if (item.turn) feed.push({ key: `turn-${item.turn.id}`, turn: item.turn });
  }
  return feed;
}

// Within this distance of the end, the conversation counts as read to the end and follows new
// messages; further up, it stays put and offers a way back down.
const FOLLOW_SLACK_PX = 32;

export default function ArchitectPanel({
  projectId,
  onClose,
  revealKey,
  onApply,
  customTechnologies,
  review,
  reviewDetail = false,
  asked = null,
  notices = [],
  onOpenFinding,
  onClearNotices,
}: {
  // A new chat starts without the earlier notices.
  onClearNotices?: () => void;
  // What each edit did to the design, posted among the answers (see useArchieNotices).
  notices?: readonly PostedNotice[];
  // Opens a problem from a notice: what it is, its fix, and a question for Archie about it.
  onOpenFinding?: (findingId: string) => void;
  // The design's numbers and an applied fix, above the conversation. While a problem is open
  // it takes the whole panel (`reviewDetail`), and the conversation waits underneath.
  review?: ReactNode;
  reviewDetail?: boolean;
  // A question handed over from elsewhere (a design check finding), asked once per new key.
  asked?: { key: number; text: string } | null;
  // The conversation is saved with this project and restored when the panel opens.
  // Null outside a saved project (a system breakdown): the conversation lasts as long as the page.
  projectId: string | null;
  onClose: () => void;
  // A new truthy value unfolds the panel: someone just asked Archie about something.
  revealKey?: unknown;
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

  // The conversation follows new messages only while it is read to the end. Scrolled up to read
  // something earlier, it stays put, and "Jump to latest" takes it back down.
  const following = useRef(true);
  const [scrolledUp, setScrolledUp] = useState(false);
  const toEnd = () => {
    following.current = true;
    setScrolledUp(false);
    list.current?.scrollTo({ top: list.current.scrollHeight });
  };
  const noticeCount = notices.length;
  useEffect(() => {
    if (following.current) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, noticeCount]);
  useEffect(() => () => abort.current?.abort(), []);

  // Restore the saved conversation once, then save after each finished answer or applied
  // suggestion (only when something changed).
  const [restored, setRestored] = useState(projectId === null);
  const lastSaved = useRef("[]");
  useEffect(() => {
    if (projectId === null) return;
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
    if (projectId === null || !restored || busy) return;
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
    onClearNotices?.();
  };
  const shownNotices = notices;
  // Answers and notices in the order they happened.
  const feed = buildFeed(turns, shownNotices);
  // Which notices are open: the newest starts open and every other starts folded; a click flips
  // one from where it started. Runs of notices show their older ones behind one row.
  const newestNotice = shownNotices.at(-1)?.id;
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => new Set());
  const flip = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  const noticeOpen = (notice: PostedNotice) => (notice.id === newestNotice) !== flipped.has(String(notice.id));
  const notice = (item: PostedNotice) => (
    <NoticeMessage
      key={`notice-${item.id}`}
      notice={item}
      open={noticeOpen(item)}
      onToggle={() => setFlipped((set) => flip(set, String(item.id)))}
      onOpenFinding={onOpenFinding}
    />
  );
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
    const at = Date.now();
    setTurns((all) => [
      ...all,
      { id: userId, role: "user", text, focusCount: focus.length, at },
      { id: answerId, role: "assistant", text: "", suggestions: [], notes: [], done: false, applied: {}, at },
    ]);
    setDraft("");
    // Asking something brings the conversation back to its end, where the answer arrives.
    toEnd();
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

  // A question handed over from the design check is asked once, when Archie is free.
  const lastAsked = useRef(0);
  useEffect(() => {
    if (!asked || asked.key === lastAsked.current || busy || !restored) return;
    lastAsked.current = asked.key;
    void ask(asked.text);
  });

  const scope = focusedName ?? components(focus.length);
  const scoped = focus.length > 0;
  // The scope is named once: on the title of the suggested questions, or, once the conversation
  // has started, on a line above the field. Either carries the way back to the whole design.
  const clearScope = (
    <button type="button" className="axp-icon-btn" aria-label="Clear the selection and ask about the whole design" title="Ask about the whole design" onClick={clearFocus}>
      <X size={13} aria-hidden="true" />
    </button>
  );
  return (
    <Panel
      fill
      toolKey="archie"
      label="Ask Archie"
      icon={<ArchiePortrait />}
      title="Archie"
      revealKey={revealKey}
      actions={(turns.length > 0 || notices.length > 0) && (
        <button type="button" className="axp-icon-btn" aria-label="Start a new conversation" title="New chat" onClick={newChat} disabled={busy}>
          <MessageSquarePlus size={15} aria-hidden="true" />
        </button>
      )}
      closeLabel="Close Archie"
      onClose={onClose}
    >
      {review && <div className="axp-review">{review}</div>}
      <div
        className="axp-messages"
        ref={list}
        aria-live="polite"
        hidden={reviewDetail}
        onScroll={(event) => {
          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
          const atEnd = scrollHeight - scrollTop - clientHeight <= FOLLOW_SLACK_PX;
          following.current = atEnd;
          setScrolledUp(!atEnd);
        }}
      >
        {turns.length === 0 && shownNotices.length === 0 && (
          <PanelGroup title={scoped ? `Ask about ${scope}` : "Ask about the whole design"} meta={scoped ? clearScope : undefined}>
            {(scoped ? FOCUS_STARTERS : STARTERS).map((question) => (
              <PanelLink key={question} item label={question} title={question} onClick={() => void ask(question)} />
            ))}
          </PanelGroup>
        )}
        {feed.map((entry) => {
          if ("notices" in entry) {
            const older = entry.notices.slice(0, -1);
            const runOpen = openRuns.has(entry.key);
            return (
              <div key={entry.key} className="axp-notice-run">
                {older.length > 0 && (
                  <button type="button" className="axp-notice-more" aria-expanded={runOpen} onClick={() => setOpenRuns((set) => flip(set, entry.key))}>
                    <span>{older.length} earlier change{older.length === 1 ? "" : "s"}</span>
                    <ChevronDown size={14} aria-hidden="true" className="axp-go" />
                  </button>
                )}
                {runOpen && older.map(notice)}
                {notice(entry.notices.at(-1)!)}
              </div>
            );
          }
          const { turn } = entry;
          return turn.role === "user" ? (
            <div key={turn.id} className="axp-turn" data-role="user">
              <span className="axp-turn-label">You{turn.focusCount > 0 && ` · ${components(turn.focusCount)}`}</span>
              <p className="axp-message" data-role="user">{turn.text}</p>
            </div>
          ) : (
            <div key={turn.id} className="axp-turn" data-role="assistant">
              <span className="axp-turn-label">Archie</span>
              {turn.text && <p className="axp-message">{turn.text}</p>}
              {!turn.text && !turn.done && !turn.error && <p className="axp-message" data-tone="soft">Looking at your design…</p>}
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
                <p key={index} className="axp-message" data-tone="soft">{note}</p>
              ))}
              {turn.error && <p role="alert" className="axp-message" data-tone="danger">{turn.error}</p>}
            </div>
          );
        })}
        {scrolledUp && (
          <button type="button" className="axp-jump" onClick={toEnd}>
            <ArrowDown size={13} aria-hidden="true" /> Jump to latest
          </button>
        )}
      </div>
      {scoped && turns.length > 0 && !reviewDetail && (
        <div className="axp-compose-scope"><PanelGroup title={`About ${scope}`} meta={clearScope} /></div>
      )}
      <form
        className="axp-compose"
        hidden={reviewDetail}
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <textarea
          className="axp-textarea"
          rows={1}
          value={draft}
          disabled={busy}
          maxLength={4_000}
          placeholder={scoped ? `Ask about ${scope}…` : "Ask about the design…"}
          aria-label="Ask Archie"
          title="Enter to send · Shift+Enter for a new line · Shift+drag on the canvas to ask about part of the design"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
        />
        {busy ? (
          <PanelAction onClick={() => abort.current?.abort()}>
            <Square size={12} aria-hidden="true" /> Stop
          </PanelAction>
        ) : (
          <PanelAction type="submit" variant="primary" disabled={!draft.trim()} title={usage ? usageLabel(usage) : undefined}>
            <Send size={13} aria-hidden="true" /> Send
          </PanelAction>
        )}
      </form>
    </Panel>
  );
}
