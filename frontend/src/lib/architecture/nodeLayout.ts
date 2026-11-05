// One node for the workspace canvas and the breakdowns. Its width follows its text up to
// this limit (`.ax-node` in the stylesheet), so placement reserves the widest it can be.
export const ARCHITECTURE_NODE_SIZE = { width: 192, height: 56 } as const;

// Room left between components so a connection can route and label in the gap.
const NODE_GAP = { x: 48, y: 24 } as const;
// Layouts saved before the node grew were spaced for an 82px-wide component. Spreading by
// this much clears anything that was legible then, so a stacked pair cannot blow up a graph.
const PREVIOUS_NODE_WIDTH = 82;
const MAX_SPREAD = (ARCHITECTURE_NODE_SIZE.width + NODE_GAP.x) / PREVIOUS_NODE_WIDTH;

type Positioned = { position: { x: number; y: number } };

// How far apart two positions must move, as a multiple of their current distance, to stop
// their boxes touching. Either axis alone is enough. 1 means they already clear each other.
function pairSpread(a: Positioned, b: Positioned): number {
  const dx = Math.abs(a.position.x - b.position.x);
  const dy = Math.abs(a.position.y - b.position.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 1;
  if (dx >= ARCHITECTURE_NODE_SIZE.width || dy >= ARCHITECTURE_NODE_SIZE.height) return 1;
  return Math.min(
    (ARCHITECTURE_NODE_SIZE.width + NODE_GAP.x) / dx,
    (ARCHITECTURE_NODE_SIZE.height + NODE_GAP.y) / dy,
    MAX_SPREAD,
  );
}

// Scales a whole layout just enough that no two components overlap, which keeps the
// arrangement the user drew. A layout with no overlaps comes back unchanged (same array),
// so this is safe to run every time a graph loads.
export function spreadOverlappingNodes<N extends Positioned>(nodes: N[]): N[] {
  let spread = 1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      spread = Math.max(spread, pairSpread(nodes[i], nodes[j]));
    }
  }
  if (spread === 1) return nodes;
  return nodes.map((node) => ({
    ...node,
    position: { x: Math.round(node.position.x * spread), y: Math.round(node.position.y * spread) },
  }));
}
