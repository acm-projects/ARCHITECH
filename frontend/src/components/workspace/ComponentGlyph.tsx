import type { CSSProperties, ReactNode } from "react";

import type { ArchitectureNodeType } from "./nodes/ArchitectureNode";

// Minimal 16px line glyphs, drawn inline so no icon dependency is needed.
const GLYPH_PATHS: Record<ArchitectureNodeType, ReactNode> = {
  client: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M8 11v2.5M5.5 13.5h5" />
    </>
  ),
  "web-app": (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M1.5 5.75h13M3.75 4.1h.01M5.75 4.1h.01" />
    </>
  ),
  "mobile-app": (
    <>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
      <path d="M7 12.25h2" />
    </>
  ),
  cdn: (
    <>
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6" />
      <path d="M2 8h12" />
    </>
  ),
  dns: (
    <>
      <circle cx="8" cy="3.5" r="1.5" />
      <circle cx="3.5" cy="12" r="1.5" />
      <circle cx="12.5" cy="12" r="1.5" />
      <path d="M8 5v2.5M8 7.5l-3.8 3.2M8 7.5l3.8 3.2" />
    </>
  ),
  server: (
    <>
      <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
      <rect x="2" y="9" width="12" height="4.5" rx="1" />
      <path d="M4.5 4.75h1M4.5 11.25h1" />
    </>
  ),
  "api-gateway": (
    <>
      <path d="M7 2v12M1.5 8h4M10 8h4.5M12.5 5.5L15 8l-2.5 2.5" />
    </>
  ),
  "load-balancer": (
    <>
      <path d="M2 8h4l5-4M6 8l5 4" />
      <circle cx="12.5" cy="4" r="1.5" />
      <circle cx="12.5" cy="12" r="1.5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </>
  ),
  cache: (
    <>
      <path d="M8 2l6 3-6 3-6-3z" />
      <path d="M2 8l6 3 6-3M2 11l6 3 6-3" />
    </>
  ),
  queue: (
    <>
      <rect x="1.5" y="5" width="3.5" height="6" rx="0.75" />
      <rect x="6.25" y="5" width="3.5" height="6" rx="0.75" />
      <rect x="11" y="5" width="3.5" height="6" rx="0.75" />
    </>
  ),
  worker: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <circle cx="8" cy="8" r="4.6" />
      <path d="M8 1.5v1.9M8 12.6v1.9M1.5 8h1.9M12.6 8h1.9M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </>
  ),
  "object-storage": (
    <>
      <path d="M2 5l6-3 6 3v6l-6 3-6-3z" />
      <path d="M2 5l6 3 6-3M8 8v6" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4L14 14" />
    </>
  ),
  auth: (
    <>
      <circle cx="5" cy="8" r="2.8" />
      <path d="M7.8 8H14M11.5 8v2.5M14 8v1.5" />
    </>
  ),
};

export default function ComponentGlyph({
  type,
  className,
  style,
}: {
  type: ArchitectureNodeType;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {GLYPH_PATHS[type]}
    </svg>
  );
}
