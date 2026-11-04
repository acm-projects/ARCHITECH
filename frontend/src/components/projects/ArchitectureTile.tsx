import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

// Shared presentation for a saved project or a guided example. Actions stay with the caller.
export default function ArchitectureTile({ href, label, preview, actions, style, children }: {
  href?: string;
  label?: string;
  preview: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const drawing = <div className="ax-dashboard-project-preview h-full w-full p-4 text-neutral-400">{preview}</div>;
  return (
    <li style={style} className={`ax-dashboard-project-card group/card relative min-w-0${href ? "" : " is-unavailable"}`}>
      {href ? <Link href={href} aria-label={label} className="ax-dashboard-project-preview-link focus-visible:outline-none">{drawing}</Link>
        : <div className="ax-dashboard-project-preview-link">{drawing}</div>}
      {actions}
      <div className="ax-dashboard-project-metadata">{children}</div>
    </li>
  );
}
