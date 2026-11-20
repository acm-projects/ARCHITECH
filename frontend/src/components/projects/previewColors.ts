import { COMPONENT_CATALOG, FAMILY_COLORS } from "../workspace/componentCatalog.ts";

// The canvas's family color, tinting a preview node's icon. Unknown types read as general.
export function previewNodeColor(type: string): string {
  const component = Object.hasOwn(COMPONENT_CATALOG, type)
    ? COMPONENT_CATALOG[type as keyof typeof COMPONENT_CATALOG]
    : undefined;
  return FAMILY_COLORS[component?.family ?? "general"];
}
