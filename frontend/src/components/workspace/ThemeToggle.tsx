"use client";

import { Moon, Sun } from "lucide-react";

import { useAppTheme } from "../AppThemeBoundary";

// Light/dark switch for workspace-style headers (projects and breakdowns).
export default function ThemeToggle() {
  const { theme, toggleTheme } = useAppTheme();
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="ax-theme-toggle flex h-9 w-9 items-center justify-center"
    >
      {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
