"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

import type { Direction } from "../../../lib/architecture/evaluation/comparison";
import { PanelCollapseToggle, toggleFromHeader, usePanelCollapse, type PanelCollapse } from "../PanelCollapse";
import "./panel.css";

// Every right panel is built from this file, and no panel has styles of its own.
//   Panel        the widget: a header with one status, and a body that folds away
//   PanelGroup   rows that belong together, with an optional title
//   PanelRow     one line: a label and a value
//   PanelLink    the same line, opening a detail
//   PanelDetail  takes over the panel's body, one level deep, with a way back
//   PanelField, PanelAction, PanelText for what is left
// A panel shows its rows at rest, and anything longer than one line belongs in a detail.

// Gives focus back to the tool's bottom-bar button, which stays mounted when its panel closes.
function focusToolButton(toolKey: string) {
  document.querySelector<HTMLButtonElement>(`.ax-panel-rail [data-tool="${toolKey}"]`)?.focus();
}

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
  // Comes and goes with a click on the canvas, so the canvas does not make room for it.
  transient?: boolean;
  hidden?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) {
  const own = usePanelCollapse(revealKey);
  const { collapsed, toggle } = collapse ?? own;
  const close = () => {
    if (toolKey) focusToolButton(toolKey);
    onClose?.();
  };
  return (
    <section
      id={id}
      className="axp ax-widget"
      aria-label={label ?? title}
      hidden={hidden}
      data-fill={fill || undefined}
      data-folded={collapsed || undefined}
      data-transient={transient || undefined}
      onKeyDown={toolKey ? (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close();
      } : undefined}
    >
      <header className="axp-head" onClick={(event) => toggleFromHeader(event, toggle)}>
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
      </header>
      <div className="axp-body" hidden={collapsed}>{children}</div>
    </section>
  );
}

export function PanelGroup({ title, meta, children }: { title?: ReactNode; meta?: ReactNode; children: ReactNode }) {
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
