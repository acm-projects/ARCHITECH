"use client";

import { useState, type CSSProperties } from "react";

import ComponentGlyph from "./ComponentGlyph";
import {
  FAMILY_COLORS,
  QUICK_COMPONENTS,
  componentGroups,
  writeComponentDragData,
  type ComponentDefinition,
} from "./componentCatalog";
import { setComponentDragImage } from "./dragPreview";
import type { ArchitectureNodeType } from "./nodes/ArchitectureNode";

type ComponentRowProps = {
  component: ComponentDefinition;
  isDragging: boolean;
  onDragStateChange: (type: ArchitectureNodeType | null) => void;
};

// One draggable row, used by both the quick list and the full library. Dragging onto the
// canvas is the only way to add a component: rows have no click or keyboard action.
function ComponentRow({
  component,
  isDragging,
  onDragStateChange,
}: ComponentRowProps) {
  return (
    <div
      draggable
      title={component.description}
      onDragStart={(event) => {
        writeComponentDragData(event.dataTransfer, component);
        setComponentDragImage(
          event.dataTransfer,
          component.label,
          event.currentTarget.querySelector("svg"),
          FAMILY_COLORS[component.family],
        );
        onDragStateChange(component.type);
      }}
      onDragEnd={() => onDragStateChange(null)}
      style={{ "--ax-family": FAMILY_COLORS[component.family] } as CSSProperties}
      className={`ax-item ${isDragging ? "is-dragging" : ""}`}
    >
      <ComponentGlyph type={component.type} className="ax-item-glyph" />
      <span className="min-w-0 truncate">{component.label}</span>
    </div>
  );
}

export default function ComponentToolbox() {
  const [collapsed, setCollapsed] = useState(false);
  // Compact: five quick components. Library: every component, grouped by family.
  const [isLibrary, setIsLibrary] = useState(false);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<ArchitectureNodeType | null>(null);

  const groups = componentGroups(query);

  const openLibrary = () => setIsLibrary(true);
  const closeLibrary = () => {
    setIsLibrary(false);
    setQuery("");
  };

  const width = collapsed
    ? "md:w-[42px]"
    : isLibrary
      ? "md:w-[310px]"
      : "md:w-[216px]";

  return (
    // The wrapper is not clipped, so the collapse control can sit on the divider.
    <div
      data-collapsed={collapsed}
      className={`ax-rail relative z-10 flex shrink-0 md:transition-[width] md:duration-200 md:ease-out ${width}`}
    >
      <aside className="ax-toolbox flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <div
          inert={collapsed}
          className={`flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 md:min-w-[216px] md:pt-4 ${
            collapsed ? "md:hidden" : ""
          } ${isLibrary ? "max-md:max-h-72" : ""}`}
        >
          <div className="flex shrink-0 items-center justify-between pb-3">
            <h2 className="ax-panel-title">Components</h2>
            {isLibrary && (
              <button
                type="button"
                onClick={closeLibrary}
                aria-label="Close library"
                className="ax-icon-btn"
              >
                ×
              </button>
            )}
          </div>

          {/* Compact quick list; hidden while the library is open. */}
          {!isLibrary && (
            <ul
              aria-label="Quick components"
              className="flex shrink-0 gap-1 overflow-x-auto md:block"
            >
              {QUICK_COMPONENTS.map((component) => (
                <li key={component.type} className="shrink-0">
                  <ComponentRow
                    component={component}
                    isDragging={dragging === component.type}
                    onDragStateChange={setDragging}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* One search input for both modes, so focus survives the expansion. */}
          <div
            className={`ax-search shrink-0 ${
              isLibrary ? "order-1 mt-1" : "order-2 mt-5"
            }`}
          >
            <ComponentGlyph type="search" className="ax-search-glyph" />
            <input
              type="search"
              value={query}
              placeholder="Search components"
              aria-label="Search components"
              autoComplete="off"
              onFocus={openLibrary}
              onChange={(event) => {
                setQuery(event.target.value);
                openLibrary();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeLibrary();
              }}
              className="ax-search-input"
            />
          </div>

          {!isLibrary && (
            <div className="order-3 mt-4 shrink-0">
              <button type="button" onClick={openLibrary} className="ax-more">
                More components <span className="ax-arrow">→</span>
              </button>
            </div>
          )}

          {/* Only the library list scrolls. */}
          {isLibrary && (
            <div className="ax-scroll order-2 min-h-0 flex-1 overflow-y-auto">
              {groups.length === 0 && (
                <p className="pt-4 text-[10px] text-(--ax-muted)">
                  No matching components
                </p>
              )}
              {groups.map((group) => (
                <section key={group.family} aria-label={group.label}>
                  <h3 className="ax-section-label">{group.label}</h3>
                  <ul>
                    {group.components.map((component) => (
                      <li key={component.type}>
                        <ComponentRow
                          component={component}
                          isDragging={dragging === component.type}
                          onDragStateChange={setDragging}
                              />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand components" : "Collapse components"}
        className="ax-collapse hidden md:flex"
      >
        <svg
          viewBox="0 0 8 12"
          width="7"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={collapsed ? "" : "rotate-180"}
        >
          <path d="M2 1.5 6.5 6 2 10.5" />
        </svg>
      </button>
    </div>
  );
}
