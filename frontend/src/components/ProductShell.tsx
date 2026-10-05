import type { ReactNode } from "react";

import { Logo } from "./ui";

export function ProductHeader({
  onLogoClick,
  trail,
  center,
  actions,
  className = "",
}: {
  onLogoClick?: () => void;
  trail?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={["product-header", className].filter(Boolean).join(" ")}>
      <div className="product-header-start">
        <Logo onClick={onLogoClick} />
        {trail && <nav className="product-header-trail" aria-label="Current location">{trail}</nav>}
      </div>
      <div className="product-header-center">{center}</div>
      <div className="product-header-actions">{actions}</div>
    </header>
  );
}
