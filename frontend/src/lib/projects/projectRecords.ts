// Database <-> API conversions for projects, shared by the /api/projects routes.
import type { Prisma } from "@prisma/client";

import { isProjectMode } from "../../components/projects/projectStore.ts";
import { prisma } from "../prisma.ts";
import {
  GRAPH_SCHEMA_VERSION,
  implementationsUsed,
  type GraphDocument,
  type ProjectInput,
  type ProjectPayload,
} from "./projectPayload.ts";

type ProjectRow = {
  id: string;
  title: string;
  mode: string;
  learnSkipped: boolean;
  source: string | null;
  graph: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date;
};

export const PROJECT_SELECT = {
  id: true,
  title: true,
  mode: true,
  learnSkipped: true,
  source: true,
  graph: true,
  createdAt: true,
  updatedAt: true,
  lastOpenedAt: true,
} as const;

export function rowToPayload(row: ProjectRow): ProjectPayload {
  const graph = (row.graph ?? {}) as Partial<GraphDocument>;
  return {
    id: row.id,
    title: row.title,
    mode: isProjectMode(row.mode) ? row.mode : "learn",
    learnSkipped: row.learnSkipped,
    ...(row.source ? { source: row.source as ProjectPayload["source"] } : {}),
    graph: {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : [],
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastOpenedAt: row.lastOpenedAt.toISOString(),
  };
}

export function inputToData(input: ProjectInput) {
  return {
    title: input.title,
    mode: input.mode,
    learnSkipped: input.learnSkipped,
    source: input.source ?? null,
    graph: input.graph as unknown as Prisma.InputJsonValue,
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.updatedAt),
    lastOpenedAt: new Date(input.lastOpenedAt),
  };
}

// Spec rule 9: every data.implementation must exist and belong to the node's component type.
// Returns an error message, or null when every implementation is valid.
export async function checkImplementations(graph: GraphDocument): Promise<string | null> {
  const used = implementationsUsed(graph);
  if (used.size === 0) return null;
  const rows = await prisma.componentImplementation.findMany({
    where: { id: { in: [...used.keys()] } },
    select: { id: true, componentType: { select: { name: true } } },
  });
  const typeOf = new Map(rows.map((row) => [row.id, row.componentType.name]));
  for (const [id, nodeTypes] of used) {
    const typeKey = typeOf.get(id);
    if (!typeKey) return `Unknown implementation "${id}".`;
    for (const nodeType of nodeTypes) {
      if (nodeType !== typeKey) return `Implementation "${id}" is a ${typeKey}, not a ${nodeType}.`;
    }
  }
  return null;
}
