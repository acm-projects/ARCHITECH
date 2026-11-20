type Edges = { top: number; bottom: number };

// How far the column of right panels must scroll to show a panel, keeping `margin` clear of its
// edges. The column hides its scrollbar, so a panel opened below the fold would otherwise give
// no sign it is there. A panel taller than the column shows its top.
export function columnScrollDelta(panel: Edges, column: Edges, margin: number): number {
  const above = panel.top - (column.top + margin);
  const below = panel.bottom - (column.bottom - margin);
  if (above < 0) return above;
  return below > 0 ? Math.min(below, above) : 0;
}
