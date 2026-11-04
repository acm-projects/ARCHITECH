"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { ChevronDown, Layers, MoreHorizontal, Puzzle, X } from "lucide-react";

import CanvasPanel from "./CanvasPanel";
import ComponentGlyph from "../ComponentGlyph";
import { CATEGORY_ICONS } from "./categoryIcons";
import {
  FAMILY_COLORS,
  type ComponentFamily,
  componentGroups,
  writeComponentDragData,
  type ComponentDefinition,
} from "../componentCatalog";
import { setComponentDragImage } from "./dragPreview";
import { TechnologyDragList } from "../TechnologyPicker";
import type { CustomTechnology } from "../../../lib/projects/customTechnologies";

// One draggable row, used by both category panels and the full library. Dragging onto the
// canvas is the only way to add a component: rows have no click or keyboard action. The
// chevron opens the component's technologies (with numbers sized for the design's traffic);
// dragging one of those adds the component already set to that technology.
function ComponentRow({
  component,
  open,
  onToggle,
}: {
  component: ComponentDefinition;
  open: boolean;
  onToggle: () => void;
}) {
  const listId = `technologies-${component.type}`;
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
      }}
      style={{ "--ax-family": FAMILY_COLORS[component.family] } as CSSProperties}
      className="ax-item"
    >
      <ComponentGlyph type={component.type} className="ax-item-glyph" />
      <span className="ax-component-name min-w-0 flex-1 truncate">{component.label}</span>
      <button
        type="button"
        className="ax-icon-btn ax-tech-toggle shrink-0"
        aria-label={`${open ? "Hide" : "Show"} ${component.label} technologies`}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={onToggle}
      >
        <ChevronDown size={12} aria-hidden="true" data-open={open || undefined} />
      </button>
    </div>
  );
}

// One technology from the project's imported repository that the app does not model. Dragging
// it places a Custom component named after it, measured as what it acts like (if known).
function CustomTechnologyRow({ technology }: { technology: CustomTechnology }) {
  return (
    <div
      draggable
      aria-label={technology.name}
      title={technology.evidence.join("\n")}
      onDragStart={(event) => {
        writeComponentDragData(event.dataTransfer, {
          type: "custom",
          label: technology.name,
          properties: { technology: technology.name, ...(technology.actsAs ? { actsAs: technology.actsAs } : {}) },
        });
        setComponentDragImage(
          event.dataTransfer,
          technology.name,
          event.currentTarget.querySelector("svg"),
          FAMILY_COLORS.general,
        );
      }}
      style={{ "--ax-family": FAMILY_COLORS.general } as CSSProperties}
      className="ax-item"
    >
      <ComponentGlyph type="custom" className="ax-item-glyph" />
      <span className="ax-component-name min-w-0 flex-1 truncate">{technology.name}</span>
    </div>
  );
}

// Match the catalog's families; component definitions and ordering stay in the catalog.
const CATEGORIES = componentGroups("");

// A canvas tool that shares the bar with the library (Ask Archie, Live estimates, Design check).
// It either opens its content in the bar's flyout (`toolContent`) or opens a panel elsewhere.
export type ToolboxTool = {
  key: string;
  label: string;
  icon: ReactNode;
  // Short real state on the button, such as an issue count.
  badge?: string;
  open: boolean;
  disabled?: boolean;
  title?: string;
  onToggle: () => void;
};

export default function ComponentToolbox({
  customTechnologies = [],
  active = true,
  onActivate,
  tools = [],
  toolContent = null,
}: {
  // Technologies from the project's imported repository; shown under "From your repo".
  customTechnologies?: readonly CustomTechnology[];
  active?: boolean;
  onActivate?: () => void;
  tools?: readonly ToolboxTool[];
  // What the open tool shows in the flyout; null when the open tool uses its own panel.
  toolContent?: ReactNode;
}) {
  // null closes the flyout; a family opens only its components; "all" is the More library;
  // "repo" is the imported repository's own technologies.
  const [category, setCategory] = useState<ComponentFamily | "all" | "repo" | null>(null);
  const [query, setQuery] = useState("");
  // The one component whose technologies are showing, if any.
  const [technologiesOf, setTechnologiesOf] = useState<ComponentDefinition["type"] | null>(null);
  const groups =
    category === "repo" ? [] : componentGroups(query).filter((group) => category === "all" || group.family === category);
  const expandedComponent = groups.flatMap((group) => group.components).find((component) => component.type === technologiesOf);
  const title =
    category === "repo"
      ? "From your repo"
      : (CATEGORIES.find((group) => group.family === category)?.label ?? "Components");
  // Clear the old search when switching categories.
  const selectCategory = (next: ComponentFamily | "all" | "repo" | null) => {
    if (active && next === category) return;
    setCategory(next);
    if (next !== null) onActivate?.();
    setQuery("");
    setTechnologiesOf(null);
  };

  const libraryOpen = active && category !== null;
  const flyoutTool = toolContent ? tools.find((tool) => tool.open) : undefined;

  return (
    <CanvasPanel
      side="left"
      hoverFlyout
      label="Components"
      wide={category === "all" && !flyoutTool}
      icon={<Layers size={16} aria-hidden="true" />}
      expanded={libraryOpen || Boolean(flyoutTool)}
      onExpandedChange={(open) => {
        if (open) return;
        if (flyoutTool) flyoutTool.onToggle();
        else selectCategory(null);
      }}
      rail={
        <ul aria-label="Component categories">
          {[...CATEGORIES.map(({ family, label }) => ({ key: family, label, Icon: CATEGORY_ICONS[family] })),
            { key: "all" as const, label: "More", Icon: MoreHorizontal },
            ...(customTechnologies.length > 0 ? [{ key: "repo" as const, label: "From your repo", Icon: Puzzle }] : [])].map(({ key, label, Icon }) => (
            <li key={key} className={key === "all" ? "ax-library-divider" : undefined}>
              <button type="button" className="ax-panel-handle" aria-label={label}
                style={{ "--ax-family": key === "all" || key === "repo" ? "var(--ax-ink-soft)" : FAMILY_COLORS[key] } as CSSProperties}
                aria-expanded={active && category === key}
                onPointerEnter={event => { if (event.pointerType === "mouse") selectCategory(key); }}
                onFocus={() => selectCategory(key)}
                onClick={() => selectCategory(key)}>
                <Icon size={38.4} color={key === "all" || key === "repo" ? undefined : FAMILY_COLORS[key]} aria-hidden="true" />
                <span className="ax-rail-name" aria-hidden="true">{label}</span>
              </button>
            </li>
          ))}
          {tools.length > 0 && <li className="ax-rail-separator" aria-hidden="true" />}
          {tools.map((tool) => (
            <li key={tool.key}>
              <button type="button" className="ax-panel-handle" data-tool={tool.key}
                aria-label={tool.badge ? `${tool.label}, ${tool.badge}` : tool.label}
                aria-expanded={tool.open} disabled={tool.disabled} title={tool.disabled ? tool.title : undefined}
                onClick={tool.onToggle}>
                {tool.icon}
                {tool.badge && <span className="ax-rail-badge" aria-hidden="true">{tool.badge}</span>}
                <span className="ax-rail-name" aria-hidden="true">{tool.label}</span>
              </button>
            </li>
          ))}
        </ul>
      }
    >
      {flyoutTool && <div className="ax-inspector ax-tool-flyout">{toolContent}</div>}
      {/* Stays mounted while a tool uses the flyout, so the search survives switching back. */}
      <div className={`ax-component-menu ${flyoutTool ? "hidden" : "flex"} min-h-0 flex-col p-3`}>
        {/* More uses search as its header; categories retain their title. */}
        <div className="ax-component-menu-header flex shrink-0 items-center justify-between gap-2 pb-2">
          {category === "all" ? <div className="ax-search min-w-0 flex-1">
            <ComponentGlyph type="search" className="ax-search-glyph" />
            <input type="search" value={query} placeholder="Search" aria-label="Search"
              autoComplete="off" onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") selectCategory(null); }} className="ax-search-input" />
          </div> : <h2 className="ax-panel-title">{title}</h2>}
          <button type="button" className="ax-icon-btn shrink-0" aria-label="Close components" onClick={() => selectCategory(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {/* Only the list scrolls; the title, close control, and search remain available. */}
        <div className="ax-component-list">
          {category === "repo" && (
            <section aria-label="From your repo">
              <p className="ax-tech-basis">Found in your imported repository. Drawn and connected, but not measured in Run Design.</p>
              <ul className="ax-component-options">
                {customTechnologies.map((technology) => (
                  <li key={technology.id}>
                    <CustomTechnologyRow technology={technology} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {category !== "repo" && groups.length === 0 && <p className="ax-card-body">No matching components</p>}
          {groups.map((group) => (
            <section key={group.family} aria-label={group.label} className="ax-library-group" data-detail={expandedComponent?.family === group.family || undefined}>
              {category === "all" && <h3 className="ax-section-label">{group.label}</h3>}
              <ul className="ax-component-options">
                {group.components.map((component) => (
                  <li key={component.type}>
                    <ComponentRow
                      component={component}
                      open={technologiesOf === component.type}
                      onToggle={() =>
                        setTechnologiesOf((shown) => (shown === component.type ? null : component.type))
                      }
                    />
                  </li>
                ))}
              </ul>
              {expandedComponent?.family === group.family && <div className="ax-library-detail">
                <h3>{expandedComponent.label}</h3>
                <TechnologyDragList component={expandedComponent} id={`technologies-${expandedComponent.type}`} />
              </div>}
            </section>
          ))}
        </div>
      </div>
    </CanvasPanel>
  );
}
