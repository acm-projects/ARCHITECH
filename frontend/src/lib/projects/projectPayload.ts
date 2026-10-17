// The project resource exchanged with /api/projects, and the server-side check of it.
//
// A project travels as `ProjectPayload`: the frontend's Project (projectStore.ts) with the
// diagram wrapped in the graph document defined by docs/graph-spec.md. validateProjectPayload
// enforces that spec's validation rules 1-8 strictly and reports the first problem with its
// path, e.g. "graph.nodes[2].data.label must be 1-60 characters." Rule 9 (implementation ids
// exist in the database) is checked by the API route, which has the database.
//
// The browser cleans projects before sending them (sanitizeNodes/sanitizeEdges), so a project
// made in the app always passes; this exists so the server never stores data it was not
// designed for.

import { COMPONENT_CATALOG } from "../../components/workspace/componentCatalog.ts";
import {
  MAX_TITLE_LENGTH,
  isProjectMode,
  type Project,
  type ProjectMode,
  type ProjectSource,
} from "../../components/projects/projectStore.ts";
import { getPropertyDefinition, validatePropertyValue } from "../architecture/componentProperties.ts";
import {
  MAX_PROPERTY_COUNT,
  MAX_PROPERTY_KEY_LENGTH,
  MAX_PROPERTY_STRING_LENGTH,
} from "../architecture/nodeProperties.ts";
import type { ArchitectureNodeType, NodeProperties } from "../architecture/types.ts";

export const GRAPH_SCHEMA_VERSION = 1;
const MAX_LABEL_LENGTH = 60;
// Guards against oversized saves; far beyond any design built by hand.
export const MAX_NODES = 500;
export const MAX_EDGES = 2_000;
// Project ids are generated in the browser (crypto.randomUUID, or "p-..." as a fallback).
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const PROPERTY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const PROJECT_SOURCES: readonly ProjectSource[] = ["blank", "duplicate", "template", "shared"];

export type GraphNodePayload = {
  id: string;
  type: "architecture";
  position: { x: number; y: number };
  data: {
    type: ArchitectureNodeType;
    label: string;
    implementation?: string;
    properties?: NodeProperties;
  };
};

export type GraphEdgePayload = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type GraphDocument = {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  nodes: GraphNodePayload[];
  edges: GraphEdgePayload[];
};

export type ProjectPayload = {
  id: string;
  title: string;
  mode: ProjectMode;
  learnSkipped: boolean;
  source?: ProjectSource;
  graph: GraphDocument;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

// What the client sends to PUT /api/projects/[id]: everything except the id, which is in the URL.
export type ProjectInput = Omit<ProjectPayload, "id">;

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export const isValidProjectId = (id: unknown): id is string =>
  typeof id === "string" && PROJECT_ID_PATTERN.test(id);

// ---- Conversions between the browser's Project and the API payload ----

export function projectToPayload(project: Project): ProjectPayload {
  return {
    id: project.id,
    title: project.title,
    mode: project.mode,
    learnSkipped: project.learnSkipped ?? false,
    ...(project.source ? { source: project.source } : {}),
    graph: {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      nodes: project.nodes.map((node) => ({
        id: node.id,
        type: "architecture",
        position: { x: node.position.x, y: node.position.y },
        data: {
          type: node.data.type,
          label: node.data.label,
          ...(node.data.properties ? { properties: node.data.properties } : {}),
        },
      })),
      edges: project.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(typeof edge.sourceHandle === "string" ? { sourceHandle: edge.sourceHandle } : {}),
        ...(typeof edge.targetHandle === "string" ? { targetHandle: edge.targetHandle } : {}),
      })),
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastOpenedAt: project.lastOpenedAt,
  };
}

// The stored shape the browser's project store reads (parseProject cleans it again on load).
export function payloadToStoredProject(payload: ProjectPayload): Record<string, unknown> {
  return {
    id: payload.id,
    title: payload.title,
    nodes: payload.graph.nodes,
    edges: payload.graph.edges,
    mode: payload.mode,
    ...(payload.learnSkipped ? { learnSkipped: true } : {}),
    ...(payload.source ? { source: payload.source } : {}),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    lastOpenedAt: payload.lastOpenedAt,
  };
}

// ---- Validation ----

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isDateString = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path} has an unknown field "${key}".`);
  }
}

function checkProperties(raw: unknown, type: ArchitectureNodeType, path: string): NodeProperties {
  if (!isRecord(raw)) return fail(`${path} must be an object.`);
  const entries = Object.entries(raw);
  if (entries.length === 0) fail(`${path} must be left out instead of empty.`);
  if (entries.length > MAX_PROPERTY_COUNT) fail(`${path} can have at most ${MAX_PROPERTY_COUNT} entries.`);

  for (const [key, value] of entries) {
    const at = `${path}.${key}`;
    if (key.length > MAX_PROPERTY_KEY_LENGTH || !PROPERTY_KEY_PATTERN.test(key)) {
      fail(`${path} has an invalid key "${key}".`);
    }
    if (typeof value === "string") {
      if (value.length > MAX_PROPERTY_STRING_LENGTH) {
        fail(`${at} can be at most ${MAX_PROPERTY_STRING_LENGTH} characters.`);
      }
    } else if (!isFiniteNumber(value) && typeof value !== "boolean") {
      fail(`${at} must be a string, a finite number or a boolean.`);
    }
    // Settings this component supports must be within its range (spec rule 8).
    if (getPropertyDefinition(type, key)) {
      const result = validatePropertyValue(type, key, value);
      if (!result.ok) fail(`${at}: ${result.message}`);
    }
  }
  return raw as NodeProperties;
}

function checkNode(raw: unknown, index: number, ids: Set<string>): GraphNodePayload {
  const path = `graph.nodes[${index}]`;
  if (!isRecord(raw)) return fail(`${path} must be an object.`);
  onlyKeys(raw, ["id", "type", "position", "data"], path);

  const { id, type, position, data } = raw;
  if (typeof id !== "string" || !id) fail(`${path}.id must be a non-empty string.`);
  if (ids.has(id as string)) fail(`${path}.id "${id}" is used by another node.`);
  ids.add(id as string);
  if (type !== "architecture") fail(`${path}.type must be "architecture".`);

  if (!isRecord(position)) return fail(`${path}.position must be an object.`);
  onlyKeys(position, ["x", "y"], `${path}.position`);
  if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
    fail(`${path}.position.x and .y must be finite numbers.`);
  }

  if (!isRecord(data)) return fail(`${path}.data must be an object.`);
  onlyKeys(data, ["type", "label", "implementation", "properties"], `${path}.data`);
  if (typeof data.type !== "string" || !Object.hasOwn(COMPONENT_CATALOG, data.type)) {
    fail(`${path}.data.type "${String(data.type)}" is not a known component type.`);
  }
  const componentType = data.type as ArchitectureNodeType;
  if (
    typeof data.label !== "string" ||
    !data.label.trim() ||
    data.label.length > MAX_LABEL_LENGTH
  ) {
    fail(`${path}.data.label must be 1-${MAX_LABEL_LENGTH} characters.`);
  }
  if (data.implementation !== undefined && (typeof data.implementation !== "string" || !data.implementation)) {
    fail(`${path}.data.implementation must be a non-empty string.`);
  }
  const properties =
    data.properties === undefined
      ? undefined
      : checkProperties(data.properties, componentType, `${path}.data.properties`);

  return {
    id: id as string,
    type: "architecture",
    position: { x: position.x as number, y: position.y as number },
    data: {
      type: componentType,
      label: data.label as string,
      ...(typeof data.implementation === "string" ? { implementation: data.implementation } : {}),
      ...(properties ? { properties } : {}),
    },
  };
}

function checkEdge(
  raw: unknown,
  index: number,
  nodeIds: ReadonlySet<string>,
  edgeIds: Set<string>,
  connections: Set<string>,
): GraphEdgePayload {
  const path = `graph.edges[${index}]`;
  if (!isRecord(raw)) return fail(`${path} must be an object.`);
  onlyKeys(raw, ["id", "source", "target", "sourceHandle", "targetHandle"], path);

  const { id, source, target, sourceHandle, targetHandle } = raw;
  if (typeof id !== "string" || !id) fail(`${path}.id must be a non-empty string.`);
  if (edgeIds.has(id as string)) fail(`${path}.id "${id}" is used by another edge.`);
  edgeIds.add(id as string);
  if (typeof source !== "string" || !nodeIds.has(source)) fail(`${path}.source must be the id of a node in this graph.`);
  if (typeof target !== "string" || !nodeIds.has(target)) fail(`${path}.target must be the id of a node in this graph.`);
  if (source === target) fail(`${path} connects a node to itself.`);
  for (const [name, handle] of [["sourceHandle", sourceHandle], ["targetHandle", targetHandle]] as const) {
    if (handle !== undefined && typeof handle !== "string") fail(`${path}.${name} must be a string.`);
  }

  const connection = JSON.stringify([source, target, sourceHandle ?? null, targetHandle ?? null]);
  if (connections.has(connection)) fail(`${path} repeats another edge's connection.`);
  connections.add(connection);

  return {
    id: id as string,
    source: source as string,
    target: target as string,
    ...(typeof sourceHandle === "string" ? { sourceHandle } : {}),
    ...(typeof targetHandle === "string" ? { targetHandle } : {}),
  };
}

export function validateGraph(raw: unknown): Validation<GraphDocument> {
  try {
    if (!isRecord(raw)) return fail("graph must be an object.");
    onlyKeys(raw, ["schemaVersion", "nodes", "edges"], "graph");
    // A graph saved before schemaVersion existed is version 1 (spec section 1).
    if (raw.schemaVersion !== undefined && raw.schemaVersion !== GRAPH_SCHEMA_VERSION) {
      fail(`graph.schemaVersion must be ${GRAPH_SCHEMA_VERSION}.`);
    }
    if (!Array.isArray(raw.nodes)) fail("graph.nodes must be an array.");
    if (!Array.isArray(raw.edges)) fail("graph.edges must be an array.");
    const rawNodes = raw.nodes as unknown[];
    const rawEdges = raw.edges as unknown[];
    if (rawNodes.length > MAX_NODES) fail(`graph can have at most ${MAX_NODES} nodes.`);
    if (rawEdges.length > MAX_EDGES) fail(`graph can have at most ${MAX_EDGES} edges.`);

    const nodeIds = new Set<string>();
    const nodes = rawNodes.map((node, index) => checkNode(node, index, nodeIds));
    const edgeIds = new Set<string>();
    const connections = new Set<string>();
    const edges = rawEdges.map((edge, index) => checkEdge(edge, index, nodeIds, edgeIds, connections));
    return { ok: true, value: { schemaVersion: GRAPH_SCHEMA_VERSION, nodes, edges } };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

// Validates the body of PUT /api/projects/[id].
export function validateProjectInput(raw: unknown): Validation<ProjectInput> {
  try {
    if (!isRecord(raw)) return fail("The request body must be a JSON object.");
    onlyKeys(
      raw,
      ["id", "title", "mode", "learnSkipped", "source", "graph", "createdAt", "updatedAt", "lastOpenedAt"],
      "project",
    );
    const { title, mode, learnSkipped, source, createdAt, updatedAt, lastOpenedAt } = raw;
    if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE_LENGTH) {
      fail(`title must be 1-${MAX_TITLE_LENGTH} characters.`);
    }
    if (!isProjectMode(mode)) fail(`mode must be "learn" or "challenge".`);
    if (learnSkipped !== undefined && typeof learnSkipped !== "boolean") fail("learnSkipped must be a boolean.");
    if (source !== undefined && !PROJECT_SOURCES.includes(source as ProjectSource)) {
      fail(`source must be one of ${PROJECT_SOURCES.join(", ")}.`);
    }
    for (const [name, value] of [["createdAt", createdAt], ["updatedAt", updatedAt], ["lastOpenedAt", lastOpenedAt]] as const) {
      if (!isDateString(value)) fail(`${name} must be an ISO date string.`);
    }

    const graph = validateGraph(raw.graph);
    if (!graph.ok) return graph;

    return {
      ok: true,
      value: {
        title: title as string,
        mode: mode as ProjectMode,
        learnSkipped: (learnSkipped as boolean | undefined) ?? false,
        ...(source !== undefined ? { source: source as ProjectSource } : {}),
        graph: graph.value,
        createdAt: new Date(createdAt as string).toISOString(),
        updatedAt: new Date(updatedAt as string).toISOString(),
        lastOpenedAt: new Date(lastOpenedAt as string).toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

// Implementation ids used in a graph, for the database check (spec rule 9).
export function implementationsUsed(graph: GraphDocument): Map<string, Set<ArchitectureNodeType>> {
  const used = new Map<string, Set<ArchitectureNodeType>>();
  for (const node of graph.nodes) {
    const id = node.data.implementation;
    if (!id) continue;
    const types = used.get(id) ?? new Set<ArchitectureNodeType>();
    types.add(node.data.type);
    used.set(id, types);
  }
  return used;
}
