import type { EvalEdge, EvalNode } from "../challenge/evaluation/graph.ts";

export const PREVIEW_WIDTH = 200;
export const PREVIEW_HEIGHT = 64;

export type PreviewNode = { id: string; x: number; y: number };
export type PreviewLine = { x1: number; y1: number; x2: number; y2: number };
export type Preview = { nodes: PreviewNode[]; lines: PreviewLine[] };

type PositionedNode = EvalNode & { position: { x: number; y: number } };

const PADDING_X = 16;
const PADDING_Y = 12;

// A lightweight, monochrome-friendly layout of the saved graph: positions are scaled to
// fit a 200x64 box, keeping the aspect ratio so left-to-right structure is preserved.
export function computePreview(
  nodes: readonly PositionedNode[],
  edges: readonly EvalEdge[],
): Preview {
  if (nodes.length === 0) return { nodes: [], lines: [] };

  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;

  const availableX = PREVIEW_WIDTH - PADDING_X * 2;
  const availableY = PREVIEW_HEIGHT - PADDING_Y * 2;
  // Never enlarge small graphs beyond their natural scale of 1 preview unit per 3 px.
  const scale = Math.min(
    spanX > 0 ? availableX / spanX : Infinity,
    spanY > 0 ? availableY / spanY : Infinity,
    1 / 3,
  );

  const usedX = spanX * scale;
  const usedY = spanY * scale;
  const offsetX = (PREVIEW_WIDTH - usedX) / 2;
  const offsetY = (PREVIEW_HEIGHT - usedY) / 2;

  const placed = nodes.map((node) => ({
    id: node.id,
    x: offsetX + (node.position.x - minX) * scale,
    y: offsetY + (node.position.y - minY) * scale,
  }));
  const byId = new Map(placed.map((node) => [node.id, node]));

  const lines = edges.flatMap((edge) => {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    return from && to ? [{ x1: from.x, y1: from.y, x2: to.x, y2: to.y }] : [];
  });

  return { nodes: placed, lines };
}

const UNITS: readonly [limitMs: number, divisorMs: number, suffix: string][] = [
  [60_000, 1_000, "s"],
  [3_600_000, 60_000, "m"],
  [86_400_000, 3_600_000, "h"],
  [604_800_000, 86_400_000, "d"],
  [Infinity, 604_800_000, "w"],
];

// "just now", "2h ago", "3d ago", "1w ago".
export function formatRelativeTime(iso: string, nowMs: number): string {
  const elapsed = nowMs - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "just now";
  for (const [limit, divisor, suffix] of UNITS) {
    if (elapsed < limit) return `${Math.floor(elapsed / divisor)}${suffix} ago`;
  }
  return "";
}
