import type { EvalEdge, EvalNode } from "../challenge/evaluation/graph.ts";
import type { ArchitectureNodeType } from "../../lib/architecture/types.ts";

export const PREVIEW_BOX = 18;

const MIN_WIDTH = 200;
const MIN_HEIGHT = 64;
const MARGIN = 6;
const ROW_GAP = 6;
const MIN_COLUMN_GAP = 12;
const MAX_COLUMN_GAP = 26;
const ARROW = 2.5;
const ARC_LIFT = 16;

export type PreviewNode = { id: string; x: number; y: number };
export type PlacedPreviewNode = PreviewNode & { type: ArchitectureNodeType; count: number };
export type PreviewLink = EvalEdge & { path: string };
export type Preview = { width: number; height: number; nodes: PlacedPreviewNode[]; links: PreviewLink[] };

type PositionedNode = EvalNode & { position: { x: number; y: number } };
type RepeatedNode = PositionedNode & { count: number };

const byPosition = (a: PositionedNode, b: PositionedNode) =>
  a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id);

const edgeKey = ({ source, target }: EvalEdge) => JSON.stringify([source, target]);

function uniqueEdges(nodes: readonly PositionedNode[], edges: readonly EvalEdge[]): EvalEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  const seen = new Map<string, EvalEdge>();
  for (const { source, target } of edges) {
    if (source === target || !ids.has(source) || !ids.has(target)) continue;
    seen.set(edgeKey({ source, target }), { source, target });
  }
  return [...seen.values()];
}

// Nodes of one type with the same neighbors are interchangeable, so they draw as one with a count.
function collapseRepeats(nodes: readonly PositionedNode[], edges: readonly EvalEdge[]) {
  const signature = (node: PositionedNode) => JSON.stringify([
    node.data.type,
    edges.filter((edge) => edge.target === node.id).map((edge) => edge.source).sort(),
    edges.filter((edge) => edge.source === node.id).map((edge) => edge.target).sort(),
  ]);
  const groups = new Map<string, RepeatedNode>();
  const representative = new Map<string, string>();
  for (const node of [...nodes].sort(byPosition)) {
    const key = signature(node);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { ...node, count: 1 });
    representative.set(node.id, groups.get(key)!.id);
  }
  const merged = [...groups.values()];
  return {
    nodes: merged,
    edges: uniqueEdges(merged, edges.map(({ source, target }) => ({
      source: representative.get(source)!,
      target: representative.get(target)!,
    }))),
  };
}

// Each node sits one column past its furthest upstream node. A cycle is cut at its top-left node.
function assignColumns(nodes: readonly PositionedNode[], edges: readonly EvalEdge[]) {
  const column = new Map(nodes.map((node) => [node.id, 0]));
  const waitingOn = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const { source, target } of edges) {
    waitingOn.set(target, waitingOn.get(target)! + 1);
    outgoing.get(source)!.push(target);
  }
  const remaining = new Set([...nodes].sort(byPosition).map((node) => node.id));
  while (remaining.size > 0) {
    const [first] = remaining;
    const next = [...remaining].find((id) => waitingOn.get(id) === 0) ?? first;
    remaining.delete(next);
    for (const target of outgoing.get(next)!) {
      if (!remaining.has(target)) continue;
      column.set(target, Math.max(column.get(target)!, column.get(next)! + 1));
      waitingOn.set(target, waitingOn.get(target)! - 1);
    }
  }
  return column;
}

const round = (value: number) => Math.round(value * 100) / 100;

function chevron(x: number, y: number, dx: number, dy: number) {
  const back = (side: number) =>
    `${round(x - dx * ARROW + dy * side * ARROW)} ${round(y - dy * ARROW + dx * side * ARROW)}`;
  return `M${back(-1)}L${round(x)} ${round(y)}L${back(1)}`;
}

function vertical(x: number, startY: number, endY: number, direction: number) {
  return `M${round(x)} ${round(startY)}L${round(x)} ${round(endY)}${chevron(x, endY, 0, direction)}`;
}

function curve(startX: number, startY: number, endX: number, endY: number, direction: number) {
  const middle = round((startX + endX) / 2);
  return `M${round(startX)} ${round(startY)}C${middle} ${round(startY)} ${middle} ${round(endY)} ${round(endX)} ${round(endY)}${chevron(endX, endY, direction, 0)}`;
}

function linkPath(from: PreviewNode, to: PreviewNode, spansColumns: boolean) {
  const half = PREVIEW_BOX / 2;
  if (from.x === to.x) {
    const direction = Math.sign(to.y - from.y);
    return vertical(from.x, from.y + direction * half, to.y - direction * half, direction);
  }
  // A link running along a row would hide behind the nodes between, so it arcs over them.
  if (from.y === to.y && spansColumns) {
    const top = from.y - half;
    return `M${round(from.x)} ${round(top)}C${round(from.x)} ${round(top - ARC_LIFT)} ${round(to.x)} ${round(top - ARC_LIFT)} ${round(to.x)} ${round(top)}${chevron(to.x, top, 0, 1)}`;
  }
  const direction = Math.sign(to.x - from.x);
  return curve(from.x + direction * half, from.y, to.x - direction * half, to.y, direction);
}

// The saved graph as a left-to-right flow: columns follow the connections rather than where the
// nodes were dragged, and the box grows only when the graph no longer fits at full size.
export function computePreview(
  nodes: readonly PositionedNode[],
  edges: readonly EvalEdge[],
): Preview {
  if (nodes.length === 0) return { width: MIN_WIDTH, height: MIN_HEIGHT, nodes: [], links: [] };

  const graph = collapseRepeats(nodes, uniqueEdges(nodes, edges));
  const columnOf = assignColumns(graph.nodes, graph.edges);
  const columnCount = Math.max(...columnOf.values()) + 1;
  const columns = Array.from({ length: columnCount }, () => [] as RepeatedNode[]);
  for (const node of graph.nodes) columns[columnOf.get(node.id)!].push(node);

  const tallest = Math.max(...columns.map((column) => column.length));
  const fittedGap = (MIN_WIDTH - MARGIN * 2 - columnCount * PREVIEW_BOX) / Math.max(columnCount - 1, 1);
  const columnGap = Math.min(MAX_COLUMN_GAP, Math.max(MIN_COLUMN_GAP, fittedGap));
  const contentWidth = columnCount * PREVIEW_BOX + (columnCount - 1) * columnGap;
  const contentHeight = tallest * PREVIEW_BOX + (tallest - 1) * ROW_GAP;
  const width = Math.max(MIN_WIDTH, contentWidth + MARGIN * 2);
  const height = Math.max(MIN_HEIGHT, contentHeight + MARGIN * 2);

  // Sweep left to right, ordering each column by its upstream nodes to limit crossings.
  const placed = new Map<string, PlacedPreviewNode>();
  columns.forEach((column, index) => {
    const pull = new Map(column.map((node) => {
      const upstream = graph.edges.flatMap((edge) => {
        const source = edge.target === node.id ? placed.get(edge.source) : undefined;
        return source ? [source.y] : [];
      });
      return [node.id, upstream.length > 0
        ? upstream.reduce((sum, y) => sum + y, 0) / upstream.length
        : height / 2];
    }));
    const ordered = [...column].sort((a, b) => pull.get(a.id)! - pull.get(b.id)! || byPosition(a, b));
    ordered.forEach((node, row) => {
      placed.set(node.id, {
        id: node.id,
        type: node.data.type,
        count: node.count,
        x: round((width - contentWidth) / 2 + PREVIEW_BOX / 2 + index * (PREVIEW_BOX + columnGap)),
        y: round(height / 2 + (row - (ordered.length - 1) / 2) * (PREVIEW_BOX + ROW_GAP)),
      });
    });
  });

  const links = graph.edges.map(({ source, target }) => ({
    source,
    target,
    path: linkPath(
      placed.get(source)!,
      placed.get(target)!,
      Math.abs(columnOf.get(source)! - columnOf.get(target)!) > 1,
    ),
  }));

  return { width, height, nodes: [...placed.values()], links };
}

// Preview-only emphasis: prefer connectivity, then visual centrality, then ID.
// Unique neighbors prevent duplicate/reversed edges from biasing the result.
export function selectPreviewAccent(
  nodes: readonly PreviewNode[],
  edges: readonly EvalEdge[],
): string | null {
  if (nodes.length === 0) return null;

  const neighbors = new Map(nodes.map(node => [node.id, new Set<string>()]));
  for (const { source, target } of edges) {
    if (source === target || !neighbors.has(source) || !neighbors.has(target)) continue;
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
  }

  const centerX = (Math.min(...nodes.map(node => node.x)) + Math.max(...nodes.map(node => node.x))) / 2;
  const centerY = (Math.min(...nodes.map(node => node.y)) + Math.max(...nodes.map(node => node.y))) / 2;
  let selectedId: string | null = null;
  let bestDegree = -1;
  let bestDistance = Infinity;

  for (const node of nodes) {
    const degree = neighbors.get(node.id)!.size;
    const distance = (node.x - centerX) ** 2 + (node.y - centerY) ** 2;
    if (
      degree > bestDegree ||
      (degree === bestDegree && distance < bestDistance) ||
      (degree === bestDegree && distance === bestDistance && (selectedId === null || node.id < selectedId))
    ) {
      selectedId = node.id;
      bestDegree = degree;
      bestDistance = distance;
    }
  }
  return selectedId;
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
