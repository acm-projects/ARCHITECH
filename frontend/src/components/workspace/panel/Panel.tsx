"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type Ref } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

import type { Direction } from "../../../lib/architecture/evaluation/comparison";
import { PanelCollapseToggle, toggleFromHeader, usePanelCollapse, type PanelCollapse } from "../PanelCollapse";
import { columnScrollDelta } from "./columnScroll";
import { ACTIVE_ATTRIBUTE, AUTO_FOLDED_ATTRIBUTE, FOLD_EVENT, REOPEN_EVENT, REOPEN_HEIGHT_ATTRIBUTE } from "./stackFit";
import "./panel.css";

// Order in which panels were last opened or used; the column folds the oldest first.
let lastActivity = 0;
function markActive(panel: HTMLElement | null) {
  panel?.setAttribute(ACTIVE_ATTRIBUTE, String(++lastActivity));
}

// Every right panel is built from this file, and no panel has styles of its own.
//   Panel        the widget: a header with one status, and a body that folds away
//   PanelGroup   rows that belong together, with an optional title
//   PanelRow     one line: a label and a value
//   PanelLink    the same line, opening a detail
//   PanelDetail  takes over the panel's body, one level deep, with a way back
//   PanelMeter   a bar under a row, for demand against a limit (or a run's progress)
//   PanelStats   a few numbers side by side
//   PanelField, PanelAction, PanelText, PanelReveal for what is left
// A panel shows its rows at rest, and anything longer than one line belongs in a detail.

// One panel at a time: a panel that opens (or is asked for again) tells the column, and every
// other open panel gets out of the way. One with its own close closes; one whose folding means
// something (a component's configuration) or that has no close (the challenge) folds to its
// header. Panels that come and go with canvas clicks, and the headerless lesson card, stay.
export const EXCLUSIVE_EVENT = "axp:exclusive";

// Gives focus back to the tool's bottom-bar button, which stays mounted when its panel closes.
function focusToolButton(toolKey: string) {
  document.querySelector<HTMLButtonElement>(`.ax-panel-rail [data-tool="${toolKey}"]`)?.focus();
}

// Clear of the column's edges when it scrolls to a panel, matching --ax-panel-margin.
const COLUMN_MARGIN = 12;

export default function Panel({
  id,
  label,
  icon,
  title,
  status,
  statusTitle,
  actions,
  toolKey,
  closeLabel,
  closeIcon,
  onClose,
  revealKey,
  collapse,
  fill = false,
  bare = false,
  transient = false,
  hidden = false,
  headingRef,
  children,
}: {
  id?: string;
  // Names the panel for screen readers when the title alone does not.
  label?: string;
  icon: ReactNode;
  title: string;
  // The one thing worth reading while the panel is folded.
  status?: ReactNode;
  statusTitle?: string;
  actions?: ReactNode;
  // Matches the bar button's data-tool: Escape closes the panel and focus returns to it.
  toolKey?: string;
  closeLabel?: string;
  closeIcon?: ReactNode;
  onClose?: () => void;
  // A new truthy value unfolds the panel (see usePanelCollapse).
  revealKey?: unknown;
  // For a panel whose folding means something else, like a component's configuration.
  collapse?: PanelCollapse;
  // Takes the height left in the column, for content that scrolls inside the panel.
  fill?: boolean;
  // No header: the body names itself and the panel never folds, like the lesson card.
  bare?: boolean;
  // Comes and goes with a click on the canvas, so the canvas does not make room for it.
  transient?: boolean;
  hidden?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) {
  const own = usePanelCollapse(revealKey);
  const { collapsed, toggle } = collapse ?? own;
  const root = useRef<HTMLElement>(null);
  // Whatever opens a panel, or asks for it again, gets to see it. A panel that comes and goes
  // with canvas clicks leaves the column where it is.
  useEffect(() => {
    const panel = root.current;
    const column = panel?.closest<HTMLElement>(".ax-widget-stack");
    if (!panel || !column || collapsed || hidden || transient) return;
    column.scrollTop += columnScrollDelta(panel.getBoundingClientRect(), column.getBoundingClientRect(), COLUMN_MARGIN);
  }, [collapsed, hidden, transient, revealKey]);
  // Opening, unfolding or being asked for again makes this the panel that stays open, unless
  // the column itself reopened it to give back room it had borrowed.
  const reopenedByColumn = useRef(false);
  useEffect(() => {
    const panel = root.current;
    if (collapsed || hidden || !panel) return;
    panel.removeAttribute(AUTO_FOLDED_ATTRIBUTE);
    panel.removeAttribute(REOPEN_HEIGHT_ATTRIBUTE);
    if (reopenedByColumn.current) {
      reopenedByColumn.current = false;
      return;
    }
    markActive(panel);
    if (!transient) panel.closest(".ax-widget-stack")?.dispatchEvent(new CustomEvent(EXCLUSIVE_EVENT, { detail: panel }));
  }, [collapsed, hidden, revealKey, transient]);
  // Another panel opened: make way for it (see EXCLUSIVE_EVENT).
  const latest = useRef({ collapsed, toggle, onClose, ownsFold: Boolean(collapse), transient, hidden, bare });
  useEffect(() => {
    latest.current = { collapsed, toggle, onClose, ownsFold: Boolean(collapse), transient, hidden, bare };
  });
  useEffect(() => {
    const column = root.current?.closest(".ax-widget-stack");
    if (!column) return;
    const makeWay = (event: Event) => {
      const opened = (event as CustomEvent<HTMLElement>).detail;
      const self = latest.current;
      if (opened === root.current || self.hidden || self.transient || self.bare) return;
      // Handled until the next render reports the panel's new state, so a second request in
      // the same moment cannot toggle it back.
      if (self.onClose && !self.ownsFold) {
        latest.current = { ...self, hidden: true };
        self.onClose();
      } else if (!self.collapsed) {
        latest.current = { ...self, collapsed: true };
        self.toggle();
      }
    };
    column.addEventListener(EXCLUSIVE_EVENT, makeWay);
    return () => column.removeEventListener(EXCLUSIVE_EVENT, makeWay);
  }, []);
  // The column folds this panel when the open panels no longer fit, and opens it again when
  // they do (see stackFit.ts).
  useEffect(() => {
    const panel = root.current;
    if (!panel) return;
    const fold = () => { if (!collapsed) toggle(); };
    const reopen = () => {
      if (!collapsed) return;
      reopenedByColumn.current = true;
      toggle();
    };
    panel.addEventListener(FOLD_EVENT, fold);
    panel.addEventListener(REOPEN_EVENT, reopen);
    return () => {
      panel.removeEventListener(FOLD_EVENT, fold);
      panel.removeEventListener(REOPEN_EVENT, reopen);
    };
  }, [collapsed, toggle]);
  const close = () => {
    if (toolKey) focusToolButton(toolKey);
    onClose?.();
  };
  return (
    <section
      ref={root}
      id={id}
      className="axp ax-widget"
      aria-label={label ?? title}
      hidden={hidden}
      data-fill={fill || undefined}
      data-folded={collapsed || undefined}
      data-transient={transient || undefined}
      // Working in a panel keeps it open when the column has to fold others.
      onPointerDown={() => markActive(root.current)}
      onFocus={() => markActive(root.current)}
      onKeyDown={toolKey ? (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close();
      } : undefined}
    >
      {!bare && <header className="axp-head" onClick={(event) => toggleFromHeader(event, toggle)}>
        <span className="axp-icon">{icon}</span>
        <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
        {status !== undefined && status !== null && <span className="axp-status" title={statusTitle}>{status}</span>}
        {actions}
        <PanelCollapseToggle title={title} collapsed={collapsed} onToggle={toggle} />
        {onClose && (
          <button type="button" className="axp-icon-btn" aria-label={closeLabel ?? `Close ${title.toLowerCase()}`} onClick={close}>
            {closeIcon ?? <X size={15} aria-hidden="true" />}
          </button>
        )}
      </header>}
      <div className="axp-body" hidden={collapsed && !bare}>{children}</div>
    </section>
  );
}

// `meta` sits at the end of the title's line: a count, or the one control that acts on the
// whole group.
export function PanelGroup({ title, meta, children }: { title?: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="axp-group">
      {title !== undefined && (
        <h3 className="axp-group-head">
          <span>{title}</span>
          {meta ? <span>{meta}</span> : null}
        </h3>
      )}
      {children}
    </div>
  );
}

type RowContent = {
  label: ReactNode;
  value?: ReactNode;
  // Before the label: a component's glyph, say.
  lead?: ReactNode;
  // An item in a list, whose name is what matters, rather than a measurement.
  item?: boolean;
  title?: string;
};

function RowParts({ label, value, lead }: Pick<RowContent, "label" | "value" | "lead">) {
  return (
    <>
      {lead && <span className="axp-lead">{lead}</span>}
      <span className="axp-label">{label}</span>
      {value !== undefined && value !== null && <span className="axp-value">{value}</span>}
    </>
  );
}

export function PanelRow({ label, value, lead, item, title }: RowContent) {
  return (
    <div className="axp-row" data-item={item || undefined} title={title}>
      <RowParts label={label} value={value} lead={lead} />
    </div>
  );
}

// Demand against a limit, as a bar under the row that states both numbers. Up to the limit the
// bar is the limit and the fill is the demand. Past it the bar is the demand: the fill is what
// the limit covers and the rest, in the danger color, is what it does not.
// A few numbers side by side, read at a glance: "Score 91 · p95 73 ms · …".
export function PanelStats({ label, stats }: { label: string; stats: readonly { label: string; value: ReactNode }[] }) {
  return (
    <div className="axp-stats" role="group" aria-label={label} style={{ "--axp-stats-count": stats.length } as CSSProperties}>
      {stats.map((stat) => (
        <div key={stat.label}>
          <span className="axp-small">{stat.label}</span>
          <span className="axp-value">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PanelMeter({ label, fraction, caption }: {
  // Names the measurement for screen readers: "Load against capacity".
  label: string;
  // Demand as a fraction of the limit: 1 is exactly at the limit.
  fraction: number;
  // One line under the bar, which also reads the bar out.
  caption: string;
}) {
  const over = fraction > 1;
  const filled = Math.max(0, Math.min(1, over ? 1 / fraction : fraction));
  return (
    <div className="axp-meter" data-over={over || undefined}>
      <div
        className="axp-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, fraction) * 100)}
        aria-valuetext={caption}
      >
        <span style={{ width: `${filled * 100}%` }} />
      </div>
      <p className="axp-small">{caption}</p>
    </div>
  );
}

// Widget tiles: a measurement read at a glance, its name small above a large figure. Two to a
// row; a `wide` tile spans the row. Used where a panel is a dashboard of a few numbers.
export function PanelTiles({ label, children }: { label?: string; children: ReactNode }) {
  return <div className="axp-tiles" role="group" aria-label={label}>{children}</div>;
}

// A tile's color. Status hues follow the measurement's state (good, tight, over); the metric
// hues tell latency, uptime and cost apart at a glance and always go with the label and icon.
export type PanelTileHue = "good" | "warn" | "over" | "latency" | "uptime" | "cost";

export function PanelTile({ label, value, unit, caption, change, gauge, wide = false, tone, title, icon, hue, detail }: {
  // Small glyph before the label, in the tile's hue.
  icon?: ReactNode;
  hue?: PanelTileHue;
  // Where the number comes from. Shown under the tile on hover or keyboard focus.
  detail?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  // Small after the figure: "ms", "/mo".
  unit?: ReactNode;
  caption?: ReactNode;
  // The ▲/▼ for the last change (PanelChange).
  change?: ReactNode;
  // A ring beside the figure, for demand against a limit.
  gauge?: { label: string; fraction: number; caption: string };
  wide?: boolean;
  // Danger is the only tone: the measurement is past its limit. Said in the caption too.
  tone?: "danger";
  title?: string;
}) {
  return (
    <div
      className="axp-tile"
      data-wide={wide || undefined}
      data-tone={tone}
      data-hue={hue}
      title={title}
      // A tile with detail opens it on focus as well as hover, so the keyboard reaches it.
      tabIndex={detail ? 0 : undefined}
    >
      <div className="axp-tile-text">
        <span className="axp-tile-label">{icon && <span className="axp-tile-icon" aria-hidden="true">{icon}</span>}{label}</span>
        <span className="axp-tile-figure">
          {value}
          {unit && <span className="axp-tile-unit">{unit}</span>}
          {change}
        </span>
        {caption && <span className="axp-tile-caption">{caption}</span>}
        {detail && (
          <span className="axp-tile-detail">
            <span>{detail}</span>
          </span>
        )}
      </div>
      {gauge && <PanelRing {...gauge} />}
    </div>
  );
}

const RING_RADIUS = 22;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

// Demand against a limit as a ring: the arc is the share used. Past the limit the whole ring
// is the danger color, and the caption says by how much.
function PanelRing({ label, fraction, caption }: { label: string; fraction: number; caption: string }) {
  const over = fraction > 1;
  const filled = Math.max(0, Math.min(1, fraction));
  return (
    <svg
      className="axp-ring"
      data-over={over || undefined}
      viewBox="0 0 56 56"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(filled * 100)}
      aria-valuetext={caption}
    >
      <circle className="axp-ring-track" cx="28" cy="28" r={RING_RADIUS} />
      <circle
        className="axp-ring-fill"
        cx="28"
        cy="28"
        r={RING_RADIUS}
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - (over ? 1 : filled))}
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}

export function PanelLink({ label, value, lead, item, title, ...button }: RowContent & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "title">) {
  return (
    <button type="button" className="axp-row axp-link" data-item={item || undefined} title={title} {...button}>
      <RowParts label={label} value={value} lead={lead} />
      <ChevronRight size={15} aria-hidden="true" className="axp-go" />
    </button>
  );
}

// A row with two lines, for choosing between options that need a word of explanation.
export function PanelOption({ label, detail, checked, onChoose, title, children }: {
  label: ReactNode;
  detail?: ReactNode;
  checked: boolean;
  onChoose: () => void;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="axp-option" title={title} onClick={onChoose}>
      <span className="axp-option-text">
        <span className="axp-option-label">{label}</span>
        {detail && <span className="axp-small">{detail}</span>}
        {children}
      </span>
      {checked && <Check size={15} aria-hidden="true" />}
    </button>
  );
}

// A detail replaces the panel's rows until Back or Escape. Focus moves to Back and returns to
// whatever opened the detail, so the keyboard never lands on a hidden row.
export function PanelDetail({ title, onBack, children }: { title: ReactNode; onBack: () => void; children: ReactNode }) {
  const back = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current ??= document.activeElement;
    back.current?.focus();
    return () => {
      const element = opener.current;
      // Only when focus went with the detail: it may have moved on to the canvas by now.
      if (document.activeElement === document.body && element instanceof HTMLElement && element.isConnected) element.focus();
    };
  }, []);
  return (
    <div className="axp-detail" onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onBack();
    }}>
      <button ref={back} type="button" className="axp-back" onClick={onBack}>
        <ChevronLeft size={15} aria-hidden="true" />
        <span>{title}</span>
      </button>
      {children}
    </div>
  );
}

export function PanelField({ label, htmlFor, control, title }: {
  label: ReactNode;
  // The id of the input or select in `control`, which the label names and nothing else.
  htmlFor: string;
  // The input or select, sitting where a row's value sits, and whatever goes beside it.
  control: ReactNode;
  title?: string;
}) {
  return (
    <div className="axp-row axp-field" title={title}>
      <label className="axp-label" htmlFor={htmlFor}>{label}</label>
      {control}
    </div>
  );
}

export function PanelText({ tone, role, children }: { tone?: "danger"; role?: "alert" | "status"; children: ReactNode }) {
  return <p className="axp-text" data-tone={tone} role={role}>{children}</p>;
}

// A row that unfolds text under it, for help someone may want to try without.
export function PanelReveal({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <details className="axp-reveal">
      <summary className="axp-row axp-link">
        <span className="axp-label">{label}</span>
        <ChevronRight size={15} aria-hidden="true" className="axp-go" />
      </summary>
      <PanelText>{children}</PanelText>
    </details>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="axp-actions">{children}</div>;
}

export function PanelAction({ variant = "secondary", className, ...button }: { variant?: "primary" | "secondary" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`axp-action ${className ?? ""}`.trim()} data-variant={variant} {...button} />;
}

// Which way a number moved: the arrow says it without the color.
export function PanelChange({ direction }: { direction: Direction | undefined }) {
  if (!direction || direction === "unchanged") return null;
  return (
    <span className="axp-change" data-direction={direction} aria-label={direction === "improved" ? "better" : "worse"}>
      {direction === "improved" ? "▲" : "▼"}
    </span>
  );
}

// A number that differs from another, marked better or worse.
export function PanelDelta({ better, title, children }: { better: boolean; title?: string; children: ReactNode }) {
  return <span className="axp-delta" data-direction={better ? "improved" : "regressed"} title={title}>{children}</span>;
}

export type PanelHealthStatus = "incomplete" | "healthy" | "warning" | "critical";
const HEALTH_LABEL: Record<PanelHealthStatus, string> = { incomplete: "Incomplete", healthy: "Healthy", warning: "Warning", critical: "Critical" };

// A colored dot that also names the state, for hover and screen readers.
export function PanelHealth({ status, children }: { status: PanelHealthStatus | undefined; children?: ReactNode }) {
  const name = HEALTH_LABEL[status ?? "incomplete"];
  return (
    <>
      <span className="axp-dot" data-health={status} role="img" aria-label={`Health: ${name}`} title={`Health: ${name}`} />
      {children ?? name}
    </>
  );
}
