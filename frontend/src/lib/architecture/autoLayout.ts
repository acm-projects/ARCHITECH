import { ARCHITECTURE_NODE_SIZE } from "./nodeLayout.ts";

// Auto align: lays a design out left to right in the direction requests travel. Each component
// goes one column to the right of everything that sends to it; components no connection reaches
// start the first column. Within a column, components sit in the order of what feeds them, which
// keeps lines from crossing where it can. Deterministic: the same design always lands the same way.

type LayoutNode = { id: string; position: { x: number; y: number } };
type LayoutEdge = { source: string; target: string };

// Wide enough for a connection's label between columns, and room for one between rows.
export const AUTO_ALIGN_GAP = { x: 96, y: 40 } as const;

const COLUMN = ARCHITECTURE_NODE_SIZE.width + AUTO_ALIGN_GAP.x;
const ROW = ARCHITECTURE_NODE_SIZE.height + AUTO_ALIGN_GAP.y;

// Column index for every node: the longest chain of connections that reaches it. A connection
// that closes a loop is ignored, so cycles cannot push a column out forever.
function columnsOf(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) outgoing.get(edge.source)!.push(edge.target);
  }
  // Depth-first order from every start, marking back edges (loops) to skip.
  const state = new Map<string, "visiting" | "done">();
  const order: string[] = [];
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, "visiting");
    for (const next of outgoing.get(id)!) {
      if (state.get(next) === "visiting") back.add(`${id}->${next}`);
      else if (!state.has(next)) visit(next);
    }
    state.set(id, "done");
    order.push(id);
  };
  const incoming = new Set(edges.map((edge) => edge.target));
  for (const node of nodes) if (!incoming.has(node.id) && !state.has(node.id)) visit(node.id);
  for (const node of nodes) if (!state.has(node.id)) visit(node.id);

  const column = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const id of order.reverse()) {
    for (const next of outgoing.get(id)!) {
      if (back.has(`${id}->${next}`)) continue;
      column.set(next, Math.max(column.get(next)!, column.get(id)! + 1));
    }
  }
  return column;
}

export function autoAlign<N extends LayoutNode>(nodes: readonly N[], edges: readonly LayoutEdge[]): N[] {
  if (nodes.length === 0) return [];
  const column = columnsOf(nodes, edges);
  const columns: N[][] = [];
  // Start from the current top-to-bottom order, so a layout the person arranged keeps its rows.
  for (const node of [...nodes].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)) {
    (columns[column.get(node.id)!] ??= []).push(node);
  }
  // Each column follows the rows of what feeds it (the average row of its senders).
  const row = new Map<string, number>();
  const senders = new Map<string, string[]>();
  for (const edge of edges) senders.set(edge.target, [...(senders.get(edge.target) ?? []), edge.source]);
  columns.forEach((members, index) => {
    if (index > 0) {
      const rank = (node: N) => {
        const placed = (senders.get(node.id) ?? []).filter((id) => row.has(id)).map((id) => row.get(id)!);
        return placed.length ? placed.reduce((sum, value) => sum + value, 0) / placed.length : Number.POSITIVE_INFINITY;
      };
      members.sort((a, b) => rank(a) - rank(b));
    }
    members.forEach((node, position) => row.set(node.id, position));
  });

  // Columns are centred on each other, and the whole layout keeps the design's top-left corner
  // so the canvas does not jump away from where the person was looking.
  const tallest = Math.max(...columns.map((members) => members?.length ?? 0));
  const left = Math.min(...nodes.map((node) => node.position.x));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const placed = new Map<string, { x: number; y: number }>();
  columns.forEach((members, index) => {
    const offset = ((tallest - members.length) * ROW) / 2;
    members.forEach((node, position) => {
      placed.set(node.id, { x: Math.round(left + index * COLUMN), y: Math.round(top + offset + position * ROW) });
    });
  });
  return nodes.map((node) => ({ ...node, position: placed.get(node.id)! }));
}
