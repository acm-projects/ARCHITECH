"use client";

import { Eye, EyeOff } from "lucide-react";

import { useLivePreviewSetting } from "./useLivePreviewSetting";

// Sits beside the theme toggle and matches it; the icon shows the current state.
export default function LivePreviewToggle() {
  const { enabled, toggle } = useLivePreviewSetting();
  const label = enabled ? "Hide live preview" : "Show live preview";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggle}
      className="ax-theme-toggle ax-live-preview-toggle flex h-9 w-9 items-center justify-center"
    >
      {enabled ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
    </button>
  );
}
