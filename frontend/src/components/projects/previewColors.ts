import { COMPONENT_CATALOG, type ComponentFamily } from "../workspace/componentCatalog.ts";

// Dashboard-only colors. Canvas styling and persisted node data remain independent.
const PREVIEW_FAMILY_COLORS: Record<ComponentFamily, string> = {
  frontend: "#155DFC",
  backend: "#DC2626",
  data: "#16A34A",
  infrastructure: "#737373",
  general: "#EAB308",
};

export function previewNodeColor(type: string): string {
  const component = Object.hasOwn(COMPONENT_CATALOG, type)
    ? COMPONENT_CATALOG[type as keyof typeof COMPONENT_CATALOG]
    : undefined;
  return PREVIEW_FAMILY_COLORS[component?.family ?? "general"];
}
