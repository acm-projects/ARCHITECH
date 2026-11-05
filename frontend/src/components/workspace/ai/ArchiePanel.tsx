"use client";

import Image from "next/image";
import { useCallback, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Minus } from "lucide-react";

import "./ai-panel.css";

export function ArchiePortrait() {
  return (
    <span className="ax-learn-portrait ax-ai-portrait" aria-hidden="true">
      <Image src="/archie.svg" alt="" width={518} height={400} />
    </span>
  );
}

// Shared presentation for live chat and coded walkthroughs. Each caller keeps
// its own messages, controls and data flow.
export default function ArchiePanel({
  label = "Archie",
  className = "",
  empty,
  headerAction,
  embedded = false,
  focus,
  children,
  footer,
  messageRef,
  messageKey,
}: {
  label?: string;
  className?: string;
  empty?: boolean;
  headerAction?: ReactNode;
  embedded?: boolean;
  focus: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  messageRef?: Ref<HTMLDivElement>;
  messageKey?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [launcherHost, setLauncherHost] = useState<HTMLElement | null>(null);
  const panelId = useId();
  const collapseButton = useRef<HTMLButtonElement>(null);
  const focusLauncher = useCallback((element: HTMLButtonElement | null) => {
    element?.focus({ preventScroll: true });
  }, []);
  const collapseControl = <button
    ref={collapseButton}
    type="button"
    className="ax-archie-collapse"
    aria-label="Collapse Archie"
    title="Collapse Archie"
    aria-expanded={!collapsed}
    aria-controls={panelId}
    onClick={event => {
      setLauncherHost(event.currentTarget.closest<HTMLElement>(".ax-workspace"));
      setCollapsed(true);
    }}
  ><Minus size={18} aria-hidden="true" /></button>;
  return <>
    <aside id={panelId} className={`ax-ai-panel ${className}`.trim()} aria-label={label} data-empty={empty} data-collapsed={collapsed} hidden={collapsed}>
      {/* An inspector pill supplies the title; conversation actions stay beside focus. */}
      {!embedded && (
        <div className="ax-ai-header">
          <p className="ax-ai-title"><ArchiePortrait />Archie</p>
          <div className="ax-archie-panel-actions">{headerAction}{collapseControl}</div>
        </div>
      )}
      <div className="ax-ai-focus-bar">{focus}{embedded && <div className="ax-archie-panel-actions">{headerAction}{collapseControl}</div>}</div>
      <div className="ax-ai-messages" ref={messageRef} key={messageKey} aria-live="polite">
        {children}
      </div>
      {footer}
    </aside>
    {collapsed && launcherHost && createPortal(<button
      type="button"
      className="ax-archie-launcher"
      aria-label="Expand Archie"
      title="Expand Archie"
      aria-expanded={false}
      aria-controls={panelId}
      ref={focusLauncher}
      onClick={() => {
        setCollapsed(false);
        requestAnimationFrame(() => collapseButton.current?.focus({ preventScroll: true }));
      }}
    ><ArchiePortrait /></button>, launcherHost)}
  </>;
}
