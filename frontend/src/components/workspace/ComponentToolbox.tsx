"use client";

import { useState, type CSSProperties } from "react";

import { Database, Globe, Layers, Monitor, MoreHorizontal, Server, X } from "lucide-react";

import CanvasPanel from "./CanvasPanel";
import ComponentGlyph from "./ComponentGlyph";
import {
  FAMILY_COLORS,
  type ComponentFamily,
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

// One draggable row, used by both category panels and the full library. Dragging onto the
// canvas is the only way to add a component: rows have no click or keyboard action.
function ComponentRow({
  component,
  isDragging,
  onDragStateChange,
}: ComponentRowProps) {
  return (
    <div
      draggable
      aria-label={component.label}
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
      <span className="ax-component-name min-w-0 truncate">{component.label}</span>
    </div>
  );
}

// Match the catalog's families; component definitions and ordering stay in the catalog.
const CATEGORY_ICONS = {
  frontend: Monitor,
  backend: Server,
  data: Database,
  infrastructure: Globe,
  general: Layers,
};
const CATEGORIES = componentGroups("");

export default function ComponentToolbox() {
  // null closes the flyout; a family opens only its components; "all" is the More library.
  const [category, setCategory] = useState<ComponentFamily | "all" | null>(null);
  const [query, setQuery] = useState("");
  const [flyoutOffset, setFlyoutOffset] = useState(6);
  const [dragging, setDragging] = useState<ArchitectureNodeType | null>(null);
  const groups = componentGroups(query).filter((group) => category === "all" || group.family === category);
  const title = CATEGORIES.find((group) => group.family === category)?.label ?? "Components";
  const alignFlyout = (button: HTMLButtonElement) => {
    const rail = button.closest(".ax-panel-rail");
    if (rail) setFlyoutOffset(button.getBoundingClientRect().top - rail.getBoundingClientRect().top);
  };
  // Clicking the active category closes it. Clear the old search when switching so
  // a query from More cannot accidentally hide the next category's components.
  const selectCategory = (next: ComponentFamily | "all" | null) => {
    setCategory(next === category ? null : next);
    setQuery("");
  };

  return (
    <CanvasPanel
      side="left"
      label="Components"
      icon={<Layers size={16} aria-hidden="true" />}
      expanded={category !== null}
      flyoutOffset={flyoutOffset}
      onExpandedChange={(open) => { if (!open) selectCategory(null); }}
      rail={
        <ul aria-label="Component categories">
          {[...CATEGORIES.map(({ family, label }) => ({ key: family, label, Icon: CATEGORY_ICONS[family] })),
            { key: "all" as const, label: "More", Icon: MoreHorizontal }].map(({ key, label, Icon }) => (
            <li key={key}>
              <button type="button" className="ax-panel-handle" aria-label={label}
                aria-expanded={category === key}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "mouse") return;
                  alignFlyout(event.currentTarget);
                  if (category !== key) { setCategory(key); setQuery(""); }
                }}
                onClick={(event) => {
                  alignFlyout(event.currentTarget);
                  // Mouse hover already opened the menu; clicks must not immediately hide it.
                  if (event.detail > 0 && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                    if (category !== key) { setCategory(key); setQuery(""); }
                  } else selectCategory(key);
                }}>
                <Icon size={16} color={key === "all" ? undefined : FAMILY_COLORS[key]} aria-hidden="true" />
                <span className="ax-rail-name" aria-hidden="true">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      }
    >
      <div className="ax-component-menu flex min-h-0 flex-col p-3">
        <div className="flex items-center justify-between pb-2">
          <h2 className="ax-panel-title">{title}</h2>
          <button type="button" className="ax-icon-btn" aria-label="Close components" onClick={() => selectCategory(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {/* Search belongs to More; individual categories show their complete contents. */}
        {category === "all" && <div className="ax-search">
          <ComponentGlyph type="search" className="ax-search-glyph" />
          <input type="search" value={query} placeholder="Search components" aria-label="Search components"
            autoComplete="off" onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") selectCategory(null); }} className="ax-search-input" />
        </div>}
        {groups.length === 0 && <p className="ax-card-body">No matching components</p>}
        {groups.map((group) => (
          <section key={group.family} aria-label={group.label}>
            {category === "all" && <h3 className="ax-section-label">{group.label}</h3>}
            <ul>
              {group.components.map((component) => (
                <li key={component.type}>
                  <ComponentRow component={component} isDragging={dragging === component.type} onDragStateChange={setDragging} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CanvasPanel>
  );
}
