import Image from "next/image";
import type { ReactNode, Ref } from "react";

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
  focus: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  messageRef?: Ref<HTMLDivElement>;
  messageKey?: string;
}) {
  return (
    <aside className={`ax-ai-panel ${className}`.trim()} aria-label={label} data-empty={empty}>
      <div className="ax-ai-header">
        <p className="ax-ai-title"><ArchiePortrait />Archie</p>
        {headerAction}
      </div>
      <div className="ax-ai-focus-bar">{focus}</div>
      <div className="ax-ai-messages" ref={messageRef} key={messageKey} aria-live="polite">
        {children}
      </div>
      {footer}
    </aside>
  );
}
