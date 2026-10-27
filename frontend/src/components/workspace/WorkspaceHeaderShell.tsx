import Link from "next/link";
import type { ReactNode } from "react";

import { HOME_ROUTE } from "../../lib/routes";
import { Logo } from "../ui";

// Editable projects and read-only lessons share the frame, but supply their own actions.
export default function WorkspaceHeaderShell({ project, actions }: {
  project: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="ax-header">
      <div className="ax-header-project">
        <Link href={HOME_ROUTE} className="ax-brand focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="ARCHITECH dashboard">
          <Logo variant="by-level" />
        </Link>
        {project}
      </div>
      <div className="ax-header-actions">{actions}</div>
    </header>
  );
}
