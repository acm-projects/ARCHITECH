import type { Edge } from "@xyflow/react";

import { MAX_EDGES, MAX_NODES } from "../../lib/projects/projectPayload.ts";
import { sanitizeEdges, sanitizeNodes } from "../projects/projectStore.ts";
import type { ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";

// A breakdown's Challenge design, kept in this browser so a reload or a visit to Learn does
// not lose it. It is not a project: it never reaches the dashboard or the server.

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type BreakdownDraft = { nodes: ArchitectureFlowNode[]; edges: Edge[] };

const EMPTY_DRAFT: BreakdownDraft = { nodes: [], edges: [] };

export const breakdownDraftKey = (challengeId: string) => `architech:breakdown-challenge:v1:${challengeId}`;

// The saved design, cleaned exactly like a saved project. Anything unreadable starts empty.
export function readBreakdownDraft(storage: DraftStorage | null, challengeId: string): BreakdownDraft {
  let text: string | null;
  try {
    text = storage?.getItem(breakdownDraftKey(challengeId)) ?? null;
  } catch (error) {
    console.warn("Could not read the saved challenge design.", error);
    return EMPTY_DRAFT;
  }
  if (text === null) return EMPTY_DRAFT;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    console.warn("The saved challenge design is unreadable; starting empty.", error);
    return EMPTY_DRAFT;
  }
  if (typeof raw !== "object" || raw === null) return EMPTY_DRAFT;
  const { nodes, edges } = raw as { nodes?: unknown; edges?: unknown };
  const cleanNodes = Array.isArray(nodes) ? sanitizeNodes(nodes.slice(0, MAX_NODES)) : [];
  const cleanEdges = Array.isArray(edges) ? sanitizeEdges(edges.slice(0, MAX_EDGES), cleanNodes) : [];
  return { nodes: cleanNodes, edges: cleanEdges };
}

// Keeps the design without canvas-only state (selection, measurements). An empty canvas
// clears the entry. Returns false when the browser refused to store it.
export function writeBreakdownDraft(storage: DraftStorage | null, challengeId: string, nodes: readonly unknown[], edges: readonly unknown[]): boolean {
  if (!storage) return false;
  const cleanNodes = sanitizeNodes(nodes);
  const key = breakdownDraftKey(challengeId);
  try {
    if (cleanNodes.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ nodes: cleanNodes, edges: sanitizeEdges(edges, cleanNodes) }));
    return true;
  } catch (error) {
    console.warn("Could not save the challenge design in this browser.", error);
    return false;
  }
}

// The browser's storage, or null where it is blocked.
export function browserStorage(): DraftStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
