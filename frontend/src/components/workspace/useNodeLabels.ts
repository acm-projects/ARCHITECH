import { useState } from "react";

import { labelsOf, sameLabels } from "../../lib/architecture/labels";

// The components' names by id, as an object that only changes when a name does. Moving or
// dragging nodes creates new node arrays all the time; anything built from the names (Archie,
// challenge feedback) would otherwise be rebuilt on every drag frame.
export function useNodeLabels(
  nodes: readonly { id: string; data: { label: string } }[],
): Readonly<Record<string, string>> {
  const next = labelsOf(nodes);
  const [labels, setLabels] = useState(next);
  if (!sameLabels(labels, next)) {
    setLabels(next);
    return next;
  }
  return labels;
}
