import type { EvalEdge, EvalNode } from "../challenge/evaluation/graph.ts";
import type { ArchitectureNodeType } from "../../lib/architecture/types.ts";

export const PREVIEW_BOX = 18;

const MIN_WIDTH = 200;
const MIN_HEIGHT = 64;
const MARGIN = 6;
const ROW_GAP = 10;
const MIN_COLUMN_GAP = 12;
const MAX_COLUMN_GAP = 26;
const ARROW_LENGTH = 4;
const ARROW_HALF_WIDTH = 2.5;
const CORNER = 3;
// Distance from a node's edge to a lane running past it: halfway to the next node in its column.
const LANE_GAP = ROW_GAP / 2;

export type PreviewNode = { id: string; x: number; y: number };
export type PlacedPreviewNode = PreviewNode & { type: ArchitectureNodeType; count: number };
// `path` is the line; `arrow` the filled head at the target, drawn separately like the canvas's.
export type PreviewLink = EvalEdge & { path: string; arrow: string };
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

type Point = readonly [x: number, y: number];

// Drops repeated points and points in the middle of a straight run, so every corner is real.
function simplify(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    const before = kept.at(-2);
    const straight = before && last &&
      ((before[0] === last[0] && last[0] === point[0]) || (before[1] === last[1] && last[1] === point[1]));
    if (straight) kept[kept.length - 1] = point;
    else kept.push(point);
  }
  return kept;
}

// Straight runs joined by small rounded corners, like the connections on the canvas.
function orthogonalPath(points: readonly Point[]): string {
  let path = `M${round(points[0]![0])} ${round(points[0]![1])}`;
  for (let index = 1; index < points.length; index++) {
    const corner = points[index]!;
    const next = points[index + 1];
    if (!next) {
      path += `L${round(corner[0])} ${round(corner[1])}`;
      break;
    }
    const previous = points[index - 1]!;
    const radius = Math.min(
      CORNER,
      Math.hypot(corner[0] - previous[0], corner[1] - previous[1]) / 2,
      Math.hypot(next[0] - corner[0], next[1] - corner[1]) / 2,
    );
    const toward = (point: Point): Point => {
      const length = Math.hypot(point[0] - corner[0], point[1] - corner[1]) || 1;
      return [corner[0] + (point[0] - corner[0]) / length * radius, corner[1] + (point[1] - corner[1]) / length * radius];
    };
    const enter = toward(previous);
    const leave = toward(next);
    path += `L${round(enter[0])} ${round(enter[1])}Q${round(corner[0])} ${round(corner[1])} ${round(leave[0])} ${round(leave[1])}`;
  }
  return path;
}

// A filled head pointing along x with its tip on the target's edge, as on the canvas.
function arrowHead(tipX: number, tipY: number, direction: number) {
  const baseX = tipX - direction * ARROW_LENGTH;
  return `M${round(tipX)} ${round(tipY)}L${round(baseX)} ${round(tipY - ARROW_HALF_WIDTH)}L${round(baseX)} ${round(tipY + ARROW_HALF_WIDTH)}Z`;
}

type Route = {
  source: PlacedPreviewNode;
  target: PlacedPreviewNode;
  sourceColumn: number;
  targetColumn: number;
  lane: number;
  // Gaps holding the link's vertical runs; gap i follows column i, gap -1 is the left margin.
  exitGap: number | null;
  entryGap: number | null;
};

// Links run horizontally along lanes and vertically only in the gaps between columns, where no
// node sits, so a link never passes behind a node. A lane is a height that no node in the
// columns it crosses occupies; the one closest to both ends wins, so a link only leaves its row
// to get around something.
function routeLinks(
  edges: readonly EvalEdge[],
  placed: ReadonlyMap<string, PlacedPreviewNode>,
  columnOf: ReadonlyMap<string, number>,
  columnX: readonly number[],
  width: number,
): PreviewLink[] {
  const half = PREVIEW_BOX / 2;
  const nodesByColumn = columnX.map(() => [] as PlacedPreviewNode[]);
  for (const node of placed.values()) nodesByColumn[columnOf.get(node.id)!]!.push(node);
  const heights = [...placed.values()].map((node) => node.y);
  const above = Math.min(...heights) - half - LANE_GAP;
  const below = Math.max(...heights) + half + LANE_GAP;

  const laneBetween = (source: PlacedPreviewNode, target: PlacedPreviewNode, from: number, to: number) => {
    const crossed = nodesByColumn.slice(from, to + 1).flat();
    const candidates = [source.y, target.y, above, below,
      ...crossed.flatMap((node) => [node.y - half - LANE_GAP, node.y + half + LANE_GAP])];
    const free = (y: number) => crossed.every((node) => Math.abs(node.y - y) >= half + 1);
    const cost = (y: number) => Math.abs(y - source.y) + Math.abs(y - target.y);
    return candidates.filter(free).sort((a, b) => cost(a) - cost(b) || a - b)[0] ?? above;
  };

  const routes = edges.map(({ source: sourceId, target: targetId }): Route => {
    const source = placed.get(sourceId)!;
    const target = placed.get(targetId)!;
    const sourceColumn = columnOf.get(sourceId)!;
    const targetColumn = columnOf.get(targetId)!;
    const base = { source, target, sourceColumn, targetColumn };
    // Next column: one vertical run in the gap between them, or none on the same row.
    if (targetColumn === sourceColumn + 1) {
      return { ...base, lane: target.y, exitGap: source.y === target.y ? null : sourceColumn, entryGap: null };
    }
    // Same column: out to the gap on the right and back into the target's right side.
    if (targetColumn === sourceColumn) {
      return { ...base, lane: target.y, exitGap: sourceColumn, entryGap: null };
    }
    // Skipping columns, or running back: a lane across every column between the two gaps.
    const [from, to] = targetColumn > sourceColumn ? [sourceColumn + 1, targetColumn - 1] : [targetColumn, sourceColumn];
    const lane = laneBetween(source, target, from, to);
    return {
      ...base,
      lane,
      exitGap: lane === source.y ? null : sourceColumn,
      entryGap: lane === target.y ? null : targetColumn - 1,
    };
  });

  // A gap shares its width between its vertical runs: one per node leaving through it and one
  // per node entered from it, ordered top to bottom so runs do not cross needlessly.
  const tracks = new Map<number, { key: string; y: number }[]>();
  const claim = (gap: number | null, key: string, y: number) => {
    if (gap === null) return;
    const list = tracks.get(gap) ?? [];
    if (!list.some((track) => track.key === key)) list.push({ key, y });
    tracks.set(gap, list);
  };
  for (const route of routes) {
    claim(route.exitGap, `out:${route.source.id}`, route.source.y);
    claim(route.entryGap, `in:${route.target.id}`, route.target.y);
  }
  const trackX = (gap: number, key: string) => {
    const list = [...tracks.get(gap)!].sort((a, b) => a.y - b.y || a.key.localeCompare(b.key));
    const left = gap < 0 ? 0 : columnX[gap]! + half;
    const right = gap >= columnX.length - 1 ? width : columnX[gap + 1]! - half;
    return left + (right - left) * (list.findIndex((track) => track.key === key) + 1) / (list.length + 1);
  };

  return routes.map(({ source, target, sourceColumn, targetColumn, lane, exitGap, entryGap }) => {
    const sameColumn = targetColumn === sourceColumn;
    const direction = sameColumn ? -1 : 1;
    const tip: Point = [target.x + (sameColumn ? half : -half), target.y];
    const points: Point[] = [[source.x + half, source.y]];
    if (exitGap !== null) {
      const x = trackX(exitGap, `out:${source.id}`);
      points.push([x, source.y], [x, lane]);
    }
    if (entryGap !== null) {
      const x = trackX(entryGap, `in:${target.id}`);
      points.push([x, lane], [x, target.y]);
    }
    const line = simplify([...points, tip]);
    // The line stops at the base of the head, so the head keeps a clean point.
    const before = line.at(-2)!;
    const end = direction > 0 ? Math.max(before[0], tip[0] - ARROW_LENGTH) : Math.min(before[0], tip[0] + ARROW_LENGTH);
    line[line.length - 1] = [end, tip[1]];
    return { source: source.id, target: target.id, path: orthogonalPath(line), arrow: arrowHead(tip[0], tip[1], direction) };
  });
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
  // Room above and below for a lane that runs around a whole column.
  const height = Math.max(MIN_HEIGHT, contentHeight + (MARGIN + LANE_GAP) * 2);

  // Sweep left to right, ordering each column by its upstream nodes to limit crossings.
  const columnX = Array.from({ length: columnCount }, (_, index) =>
    round((width - contentWidth) / 2 + PREVIEW_BOX / 2 + index * (PREVIEW_BOX + columnGap)));
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
        x: columnX[index]!,
        y: round(height / 2 + (row - (ordered.length - 1) / 2) * (PREVIEW_BOX + ROW_GAP)),
      });
    });
  });

  const links = routeLinks(graph.edges, placed, columnOf, columnX, width);
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
