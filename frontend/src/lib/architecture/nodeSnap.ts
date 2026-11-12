// Alignment while dragging a component. Lining a component up with another straightens the
// arrow between them, so components it is connected to pull from further away.

export type SnapBox = { x: number; y: number; width: number; height: number };
export type SnapNeighbor = { box: SnapBox; connected: boolean };
// A line to draw on the canvas: along `axis`-constant `at`, spanning `from` to `to`.
export type SnapGuide = { axis: "x" | "y"; at: number; from: number; to: number };

const CONNECTED_PULL = 1.5;

const centerX = (box: SnapBox) => box.x + box.width / 2;
const centerY = (box: SnapBox) => box.y + box.height / 2;

type Match = { delta: number; neighbor: SnapNeighbor };

function closest(moving: number, neighbors: readonly SnapNeighbor[], center: (box: SnapBox) => number, reach: number): Match | null {
  let best: Match | null = null;
  for (const neighbor of neighbors) {
    const delta = center(neighbor.box) - moving;
    if (Math.abs(delta) > (neighbor.connected ? reach * CONNECTED_PULL : reach)) continue;
    const closer = !best || Math.abs(delta) < Math.abs(best.delta);
    const sameButConnected = best && Math.abs(delta) === Math.abs(best.delta) && neighbor.connected && !best.neighbor.connected;
    if (closer || sameButConnected) best = { delta, neighbor };
  }
  return best;
}

// Where `moving` lands, and the guides to show. Each axis snaps on its own, center to center.
export function snapNode(moving: SnapBox, neighbors: readonly SnapNeighbor[], reach: number): { x: number; y: number; guides: SnapGuide[] } {
  const column = closest(centerX(moving), neighbors, centerX, reach);
  const row = closest(centerY(moving), neighbors, centerY, reach);
  const x = moving.x + (column?.delta ?? 0);
  const y = moving.y + (row?.delta ?? 0);
  const placed = { ...moving, x, y };

  const guides: SnapGuide[] = [];
  if (column) {
    const other = column.neighbor.box;
    guides.push({ axis: "x", at: centerX(placed), from: Math.min(placed.y, other.y), to: Math.max(placed.y + placed.height, other.y + other.height) });
  }
  if (row) {
    const other = row.neighbor.box;
    guides.push({ axis: "y", at: centerY(placed), from: Math.min(placed.x, other.x), to: Math.max(placed.x + placed.width, other.x + other.width) });
  }
  return { x, y, guides };
}
