import { useCallback, useEffect, useMemo, useState } from "react";

import { failureImpact, type FailureImpact } from "../../lib/architecture/evaluation/failure";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";
import { LIVE_METRICS_DELAY_MS } from "./useLiveMetrics";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// One component down at a time. The impact is re-read shortly after each edit, like live
// estimates, so adding a replica while the database is down shows it taking over. The test is
// part of the session, not the design: nothing is saved, and deleting the component ends it.
export function useFailureTest({
  nodes,
  edges,
  traffic,
  enabled,
}: {
  nodes: readonly ArchitectureFlowNode[];
  edges: readonly unknown[];
  traffic: TrafficProfile;
  enabled: boolean;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [impact, setImpact] = useState<FailureImpact | null>(null);
  const downId = enabled && chosenId !== null && nodes.some((node) => node.id === chosenId) ? chosenId : null;

  useEffect(() => {
    if (downId === null) return;
    const timer = setTimeout(() => setImpact(failureImpact({ nodes, edges }, traffic, downId)), LIVE_METRICS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [downId, nodes, edges, traffic]);

  const toggle = useCallback((nodeId: string) => {
    setChosenId((current) => (current === nodeId ? null : nodeId));
  }, []);
  const restore = useCallback(() => setChosenId(null), []);
  const context = useMemo(() => (enabled ? { downId, toggle } : null), [enabled, downId, toggle]);

  return {
    downId,
    // Only the result for the component that is down now, never one left from an earlier test.
    impact: downId !== null && impact?.nodeId === downId ? impact : null,
    restore,
    context,
  };
}
