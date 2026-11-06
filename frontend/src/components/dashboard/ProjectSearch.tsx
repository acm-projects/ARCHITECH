"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";

export default function ProjectSearch({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div role="search" className="ax-dashboard-project-search">
      <Search aria-hidden="true" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onChange("");
        }}
        placeholder="Search projects or components"
        aria-label="Search projects or components"
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
