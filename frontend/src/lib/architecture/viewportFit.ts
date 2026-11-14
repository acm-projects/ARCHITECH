// Keeps components in view when the canvas gets narrower, as it does when a right panel opens.
// Only components that were on screen count: a part of the design the user has panned or
// zoomed away from stays out of view, so opening a panel never refits the whole canvas.

export type Viewport = { x: number; y: number; zoom: number };
export type Size = { width: number; height: number };
export type Box = { x: number; y: number; width: number; height: number };

// Clear space kept between the components and the canvas edge.
export const VIEW_MARGIN = 24;

export function viewportAfterShrink(
  boxes: readonly Box[],
  viewport: Viewport,
  before: Size,
  after: Size,
  minZoom: number,
): Viewport | null {
  const { x, y, zoom } = viewport;
  const onScreen = boxes
    .map((box) => ({ left: box.x * zoom + x, right: (box.x + box.width) * zoom + x }))
    .filter((box) => box.right > 0 && box.left < before.width);
  if (onScreen.length === 0) return null;

  const left = Math.min(...onScreen.map((box) => box.left));
  const right = Math.max(...onScreen.map((box) => box.right));
  if (right + VIEW_MARGIN <= after.width) return null;

  const room = after.width - 2 * VIEW_MARGIN;
  // Panning is enough when they fit at this zoom: move them just clear of the new edge.
  if (right - left <= room) return { x: x - (right + VIEW_MARGIN - after.width), y, zoom };

  // Otherwise zoom out around the components, keeping them vertically where they were.
  const nextZoom = Math.max(minZoom, (zoom * room) / (right - left));
  const scale = nextZoom / zoom;
  const middle = after.height / 2;
  return {
    x: VIEW_MARGIN - ((left - x) * scale),
    y: middle - (middle - y) * scale,
    zoom: nextZoom,
  };
}

// Pans just enough to show one whole component, for one that lands partly outside the canvas
// (dropped past its edge, or added at the middle of a screen the panels have narrowed). Null
// when it is already fully in view. The zoom never changes.
export function viewportToShow(box: Box, viewport: Viewport, size: Size): Viewport | null {
  const { x, y, zoom } = viewport;
  const left = box.x * zoom + x;
  const right = (box.x + box.width) * zoom + x;
  const top = box.y * zoom + y;
  const bottom = (box.y + box.height) * zoom + y;
  const shift = (start: number, end: number, limit: number) =>
    end + VIEW_MARGIN > limit ? limit - VIEW_MARGIN - end : start < VIEW_MARGIN ? VIEW_MARGIN - start : 0;
  const dx = shift(left, right, size.width);
  const dy = shift(top, bottom, size.height);
  return dx === 0 && dy === 0 ? null : { x: x + dx, y: y + dy, zoom };
}
