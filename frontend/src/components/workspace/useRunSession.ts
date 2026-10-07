import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Edge } from "@xyflow/react";

import { buildArchieView } from "../../lib/architecture/archie/view";
import { evaluateDesign } from "../../lib/architecture/evaluation/evaluationService";
import { fingerprintEvaluationInput } from "../../lib/architecture/evaluation/fingerprint";
import { buildResultsView } from "../../lib/architecture/evaluation/resultsView";
import { createRunSession } from "../../lib/architecture/evaluation/runSession";
import {
  DEFAULT_TRAFFIC,
  sanitizeTraffic,
  withRequestRate,
  type TrafficProfile,
} from "../../lib/architecture/evaluation/traffic";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";
import { useNodeLabels } from "./useNodeLabels";

// Run Design for the workspace: a thin layer over the run session in lib. `scopeKey` (the
// project id) keeps each project's results separate, and nothing here is saved or added to
// the undo history. Pass `enabled: false` where Run Design is not used (Learn, Challenge).
export function useRunSession({
  scopeKey,
  enabled,
  nodes,
  edges,
  initialTraffic,
}: {
  scopeKey: string | null;
  enabled: boolean;
  nodes: ArchitectureFlowNode[];
  edges: Edge[];
  // The load runs are evaluated against. Defaults to the standard traffic; a challenge sets its own.
  initialTraffic?: Partial<TrafficProfile>;
}) {
  const [session] = useState(() => createRunSession(evaluateDesign));
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  // The load a run is evaluated against: the stress test changes it. It is state of this session
  // only, never saved and never part of the undo history, and Reset returns it to where it began.
  const [startingTraffic] = useState<TrafficProfile>(
    () => sanitizeTraffic(initialTraffic ?? DEFAULT_TRAFFIC).traffic,
  );
  const [traffic, setTrafficState] = useState<TrafficProfile>(startingTraffic);
  const setTraffic = useCallback(
    (patch: Partial<TrafficProfile>) =>
      setTrafficState((current) => sanitizeTraffic({ ...current, ...patch }).traffic),
    [],
  );
  const setRequestRate = useCallback(
    (requestsPerSecond: number) =>
      setTrafficState((current) => withRequestRate(current, requestsPerSecond)),
    [],
  );

  // Identity of the live design and traffic. Selection, measuring, dragging and moving a
  // node leave it unchanged, so they never make a result stale.
  const fingerprint = useMemo(
    () => (enabled ? fingerprintEvaluationInput({ graph: { nodes, edges }, traffic }) : ""),
    [enabled, nodes, edges, traffic],
  );

  // Another project's results must never show here, and a run in progress is cancelled.
  const scope = useRef(scopeKey);
  useEffect(() => {
    if (scope.current !== scopeKey) {
      scope.current = scopeKey;
      session.reset();
    }
    return undefined;
  }, [scopeKey, session]);
  useEffect(() => () => session.reset(), [session]);

  const view = useMemo(() => buildResultsView(state, fingerprint), [state, fingerprint]);

  // Archie's explanation of the latest run, built on demand with the components' current
  // names (so a renamed component is described by its new name).
  const labels = useNodeLabels(nodes);
  const archie = useCallback(() => buildArchieView(state, fingerprint, labels), [state, fingerprint, labels]);

  const run = useCallback(() => {
    if (!enabled) return;
    void session.run({ projectId: scopeKey, nodes, edges, traffic });
  }, [enabled, session, scopeKey, nodes, edges, traffic]);

  // Stress test: runs the design at another request rate, and keeps that rate as the live load.
  const runAtRate = useCallback(
    (requestsPerSecond: number) => {
      if (!enabled) return;
      const next = withRequestRate(traffic, requestsPerSecond);
      setTrafficState(next);
      void session.run({ projectId: scopeKey, nodes, edges, traffic: next });
    },
    [enabled, session, scopeKey, nodes, edges, traffic],
  );

  // Forgets every result (current, previous and one in progress) and the stress-test load.
  const reset = useCallback(() => {
    session.reset();
    setTrafficState(startingTraffic);
  }, [session, startingTraffic]);

  return {
    view,
    state,
    fingerprint,
    labels,
    run,
    runAtRate,
    archie,
    reset,
    traffic,
    setTraffic,
    setRequestRate,
  };
}
