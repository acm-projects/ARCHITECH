export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

export interface ProjectPoint {
  x: number;
  y: number;
}

export interface ProjectConnection {
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
  label?: string;
}

export interface ProjectAddedComponent {
  id: string;
  name: string;
}

export type ProjectNodePropertyValue = string | number | boolean;
export type ProjectNodeProperties = Record<
  string,
  Record<string, ProjectNodePropertyValue>
>;

export type ProjectLayer = "frontend" | "backend" | "fullstack";

export interface ProjectState {
  schemaVersion: number;
  addedComponents: ProjectAddedComponent[];
  nodeOffsets: Record<string, ProjectPoint>;
  deletedNodes: string[];
  connections: ProjectConnection[];
  nodeProperties: ProjectNodeProperties;
  deletedEdges: string[];
  notes: number;
  tabs: string[];
  activeTab: number;
  traffic: number;
  dataset: number;
  readRatio: number;
  networkLatency: number;
  zoom: number;
  pan: ProjectPoint;
  leftOpen: boolean;
  rightOpen: boolean;
  layer: ProjectLayer;
}

const DEFAULT_TABS = ["Architecture", "Notes"];

export function defaultProjectState(): ProjectState {
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    addedComponents: [],
    nodeOffsets: {},
    deletedNodes: [],
    connections: [],
    nodeProperties: {},
    deletedEdges: [],
    notes: 0,
    tabs: [...DEFAULT_TABS],
    activeTab: 0,
    traffic: 5000,
    dataset: 100,
    readRatio: 50,
    networkLatency: 100,
    zoom: 1,
    pan: { x: 0, y: 0 },
    leftOpen: true,
    rightOpen: true,
    layer: "fullstack",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return Math.max(0, Math.round(finiteNumber(value, fallback)));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePoint(value: unknown, fallback: ProjectPoint): ProjectPoint {
  if (!isRecord(value)) return { ...fallback };

  const x = finiteNumber(value.x, fallback.x);
  const y = finiteNumber(value.y, fallback.y);
  return { x, y };
}

function normalizeAddedComponents(value: unknown): ProjectAddedComponent[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();

  return value.flatMap((entry, index) => {
    const component =
      typeof entry === "string"
        ? { id: `added-${index}`, name: entry }
        : isRecord(entry) &&
            typeof entry.id === "string" &&
            typeof entry.name === "string"
          ? { id: entry.id, name: entry.name }
          : null;

    if (!component) return [];

    const id = component.id.trim();
    const name = component.name.trim();
    if (!id || !name || seen.has(id)) return [];

    seen.add(id);
    return [{ id, name }];
  });
}

function normalizeOffsets(value: unknown): Record<string, ProjectPoint> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, point]) => {
      if (!id || !isRecord(point)) return [];
      if (
        typeof point.x !== "number" ||
        !Number.isFinite(point.x) ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.y)
      ) {
        return [];
      }
      return [[id, { x: point.x, y: point.y }]];
    }),
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry)))];
}

function normalizeConnections(value: unknown): ProjectConnection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.from !== "string" ||
      typeof entry.to !== "string" ||
      !entry.from ||
      !entry.to
    ) {
      return [];
    }

    const connection: ProjectConnection = {
      from: entry.from,
      to: entry.to,
    };

    if (typeof entry.fromPort === "string" && entry.fromPort) {
      connection.fromPort = entry.fromPort;
    }
    if (typeof entry.toPort === "string" && entry.toPort) {
      connection.toPort = entry.toPort;
    }
    if (typeof entry.label === "string" && entry.label) {
      connection.label = entry.label;
    }

    return [connection];
  });
}

function normalizeNodeProperties(value: unknown): ProjectNodeProperties {
  if (!isRecord(value)) return {};

  const result: ProjectNodeProperties = {};

  for (const [nodeId, properties] of Object.entries(value)) {
    if (!nodeId || !isRecord(properties)) continue;

    const normalized: Record<string, ProjectNodePropertyValue> = {};
    for (const [key, propertyValue] of Object.entries(properties)) {
      if (
        typeof propertyValue === "string" ||
        typeof propertyValue === "boolean" ||
        (typeof propertyValue === "number" && Number.isFinite(propertyValue))
      ) {
        normalized[key] = propertyValue;
      }
    }

    result[nodeId] = normalized;
  }

  return result;
}

function normalizeTabs(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_TABS];
  const tabs = value.filter(
    (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
  );
  return tabs.length ? tabs : [...DEFAULT_TABS];
}

function normalizeLayer(value: unknown): ProjectLayer {
  return value === "frontend" || value === "backend" || value === "fullstack"
    ? value
    : "fullstack";
}

export function normalizeProjectState(value: unknown): ProjectState {
  const defaults = defaultProjectState();
  const raw = isRecord(value) ? value : {};
  const tabs = normalizeTabs(raw.tabs);

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    addedComponents: normalizeAddedComponents(raw.addedComponents),
    nodeOffsets: normalizeOffsets(raw.nodeOffsets),
    deletedNodes: normalizeStringArray(raw.deletedNodes),
    connections: normalizeConnections(raw.connections),
    nodeProperties: normalizeNodeProperties(raw.nodeProperties),
    deletedEdges: normalizeStringArray(raw.deletedEdges),
    notes: nonNegativeInteger(raw.notes, defaults.notes),
    tabs,
    activeTab: Math.min(
      tabs.length - 1,
      nonNegativeInteger(raw.activeTab, defaults.activeTab),
    ),
    traffic: Math.max(0, finiteNumber(raw.traffic, defaults.traffic)),
    dataset: Math.max(0, finiteNumber(raw.dataset, defaults.dataset)),
    readRatio: boundedNumber(raw.readRatio, defaults.readRatio, 0, 100),
    networkLatency: Math.max(
      0,
      finiteNumber(raw.networkLatency, defaults.networkLatency),
    ),
    zoom: boundedNumber(raw.zoom, defaults.zoom, 0.45, 1.8),
    pan: normalizePoint(raw.pan, defaults.pan),
    leftOpen: booleanValue(raw.leftOpen, defaults.leftOpen),
    rightOpen: booleanValue(raw.rightOpen, defaults.rightOpen),
    layer: normalizeLayer(raw.layer),
  };
}
