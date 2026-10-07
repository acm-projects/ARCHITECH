import type {
  ArchitectureNodeData,
  ArchitectureNodeType,
} from "./nodes/ArchitectureNode";

// Family is the semantic role of a component: it groups the library and tints the glyph.
export type ComponentFamily =
  | "general"
  | "frontend"
  | "backend"
  | "data"
  | "infrastructure";

export const FAMILY_LABELS: Record<ComponentFamily, string> = {
  general: "General",
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  infrastructure: "Infrastructure",
};

// Accent colors for glyphs only, never surfaces.
export const FAMILY_COLORS: Record<ComponentFamily, string> = {
  general: "#8a8a86",
  frontend: "#4f7cff",
  backend: "#f05a72",
  data: "#45a66b",
  infrastructure: "#38a7a5",
};

// A palette entry: what is placed on the canvas plus static metadata.
export type ComponentDefinition = ArchitectureNodeData & {
  family: ComponentFamily;
  description: string;
};

// Ordered by typical request path: origin, edge, services, data.
const COMPONENTS: readonly ComponentDefinition[] = [
  {
    type: "client",
    family: "general",
    label: "Client",
    description: "The user-facing device or application that starts a request.",
  },
  {
    type: "web-app",
    family: "frontend",
    label: "Web App",
    description:
      "A browser-based frontend that renders the interface and calls backend APIs.",
  },
  {
    type: "mobile-app",
    family: "frontend",
    label: "Mobile App",
    description: "A native iOS or Android application that calls backend APIs.",
  },
  {
    type: "cdn",
    family: "infrastructure",
    label: "CDN",
    description: "Serves static content from edge locations close to the user.",
  },
  {
    type: "dns",
    family: "infrastructure",
    label: "DNS",
    description:
      "Resolves domain names to the addresses of servers or load balancers.",
  },
  {
    type: "server",
    family: "backend",
    label: "API Server",
    description: "Runs application logic and handles requests from clients.",
  },
  {
    type: "api-gateway",
    family: "backend",
    label: "API Gateway",
    description:
      "Single entry point that routes, authenticates and rate-limits API traffic.",
  },
  {
    type: "load-balancer",
    family: "infrastructure",
    label: "Load Balancer",
    description: "Distributes incoming traffic across multiple servers.",
  },
  {
    type: "database",
    family: "data",
    label: "Database",
    description: "Stores persistent application data.",
  },
  {
    type: "cache",
    family: "data",
    label: "Cache",
    description:
      "Stores frequently accessed data so requests can be served faster.",
  },
  {
    type: "queue",
    family: "data",
    label: "Message Queue",
    description:
      "Buffers messages between services so work can be processed asynchronously.",
  },
  {
    type: "worker",
    family: "backend",
    label: "Worker",
    description: "Processes background jobs taken from a queue.",
  },
  {
    type: "object-storage",
    family: "data",
    label: "Object Storage",
    description: "Stores large files such as images, videos and backups.",
  },
  {
    type: "search",
    family: "data",
    label: "Search",
    description:
      "Indexes data to answer full-text and filtered queries quickly.",
  },
  {
    type: "auth",
    family: "backend",
    label: "Authentication",
    description:
      "Verifies who a user is and issues credentials for later requests.",
  },
];

export const COMPONENT_CATALOG = Object.fromEntries(
  COMPONENTS.map((component) => [component.type, component]),
) as Record<ArchitectureNodeType, ComponentDefinition>;

// Section order in the full library.
const FAMILY_ORDER: readonly ComponentFamily[] = [
  "frontend",
  "backend",
  "data",
  "infrastructure",
  "general",
];

// The common building blocks shown in the compact panel.
const QUICK_TYPES: readonly ArchitectureNodeType[] = [
  "client",
  "server",
  "database",
  "cache",
  "load-balancer",
];

export const QUICK_COMPONENTS: readonly ComponentDefinition[] = QUICK_TYPES.map(
  (type) => COMPONENT_CATALOG[type],
);

export type ComponentGroup = {
  family: ComponentFamily;
  label: string;
  components: ComponentDefinition[];
};

// Library sections, filtered by a case-insensitive match on the component or family name.
export function componentGroups(query: string): ComponentGroup[] {
  const q = query.trim().toLowerCase();
  const matches = (component: ComponentDefinition) =>
    !q ||
    component.label.toLowerCase().includes(q) ||
    FAMILY_LABELS[component.family].toLowerCase().includes(q);

  return FAMILY_ORDER.map((family) => ({
    family,
    label: FAMILY_LABELS[family],
    components: COMPONENTS.filter(
      (component) => component.family === family && matches(component),
    ),
  })).filter((group) => group.components.length > 0);
}

// ---- Drag payload ----

export const COMPONENT_DRAG_MIME = "application/x-architech-component";

const MAX_LABEL_LENGTH = 60;

export function writeComponentDragData(
  dataTransfer: DataTransfer,
  component: ArchitectureNodeData,
) {
  // Only the node data travels with the drag, not the palette metadata.
  const payload: ArchitectureNodeData = {
    type: component.type,
    label: component.label,
  };
  dataTransfer.setData(COMPONENT_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = "copy";
}

function isNodeType(value: unknown): value is ArchitectureNodeType {
  return typeof value === "string" && Object.hasOwn(COMPONENT_CATALOG, value);
}

// Drag data comes from the DOM, so it is validated before it can create a node.
export function readComponentDragData(
  dataTransfer: DataTransfer,
): ArchitectureNodeData | null {
  const raw = dataTransfer.getData(COMPONENT_DRAG_MIME);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { type, label } = parsed as Record<string, unknown>;
    if (!isNodeType(type)) return null;
    if (
      typeof label !== "string" ||
      !label.trim() ||
      label.length > MAX_LABEL_LENGTH
    ) {
      return null;
    }
    return { type, label: label.trim() };
  } catch {
    return null;
  }
}

export function hasComponentDragData(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(COMPONENT_DRAG_MIME);
}
