import { useEffect, useRef, useState } from "react";

import {
  liveChanges,
  sharedEvaluationCache,
  type LiveChanges,
  type LiveResult,
} from "../../lib/architecture/evaluation/liveMetrics";
import type { TrafficProfile } from "../../lib/architecture/evaluation/traffic";

// Re-evaluates the design shortly after it stops changing (debounced), using the shared
// fingerprint cache, so dragging never re-evaluates and repeated designs are instant.
// Returns the latest result and how each number moved compared with the previous design.
export const LIVE_METRICS_DELAY_MS = 150;

export function useLiveMetrics({
  nodes,
  edges,
  traffic,
  enabled,
}: {
  nodes: readonly unknown[];
  edges: readonly unknown[];
  traffic: TrafficProfile;
  enabled: boolean;
}): { result: LiveResult | null; changes: LiveChanges | null } {
  const [state, setState] = useState<{ result: LiveResult | null; changes: LiveChanges | null }>({ result: null, changes: null });
  const latest = useRef<LiveResult | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      const next = sharedEvaluationCache.get({ nodes, edges }, traffic);
      const previous = latest.current;
      if (previous?.fingerprint === next.fingerprint) return;
      latest.current = next;
      setState({
        result: next,
        changes: previous && previous.summary.ready && next.summary.ready ? liveChanges(previous.evaluation, next.evaluation) : null,
      });
    }, LIVE_METRICS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nodes, edges, traffic, enabled]);

  return state;
}
