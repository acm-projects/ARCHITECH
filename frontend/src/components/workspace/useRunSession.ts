import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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

// Shared Run Design controller used by Learn free-play and Challenge.
//
// It takes the current architecture + traffic, runs the evaluator, and keeps the
// latest result for this session. Results are temporary: they are not autosaved
// with the project and they are not part of undo/redo.
//
// BACKEND: evaluateDesign is the evaluation boundary. If evaluation later runs
// on the server or through an AI service, connect that inside evaluationService
// instead of adding API calls to Learn, Challenge, or this workspace hook.
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

  // Learn uses the normal traffic defaults. A Challenge can provide its own load.
  initialTraffic?: Partial<TrafficProfile>;
}) {
  // One run session keeps track of things like running state, current result,
  // previous result, and errors for this mounted controller.
  const [session] = useState(() =>
    createRunSession(evaluateDesign),
  );

  // Rerender whenever the run session changes.
  const state = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState,
  );

  // Traffic belongs to the run session, not the saved project.
  // Stress Test can change it temporarily, and Reset brings it back to this starting value.
  const [startingTraffic] = useState<TrafficProfile>(
    () =>
      sanitizeTraffic(
        initialTraffic ?? DEFAULT_TRAFFIC,
      ).traffic,
  );

  const [traffic, setTrafficState] =
    useState<TrafficProfile>(startingTraffic);

  // Update any part of the traffic profile while still keeping the values valid.
  const setTraffic = useCallback(
    (patch: Partial<TrafficProfile>) =>
      setTrafficState((current) =>
        sanitizeTraffic({
          ...current,
          ...patch,
        }).traffic,
      ),
    [],
  );

  // Stress Test usually only needs to change request rate, so it gets a simpler helper.
  const setRequestRate = useCallback(
    (requestsPerSecond: number) =>
      setTrafficState((current) =>
        withRequestRate(
          current,
          requestsPerSecond,
        ),
      ),
    [],
  );

  // This fingerprint represents the architecture + traffic that would be evaluated right now.
  //
  // We use it to know whether an old result still belongs to the current design.
  // Things like selecting, dragging, or moving a node don't affect evaluation,
  // so they don't make the result stale.
  const fingerprint = useMemo(
    () =>
      enabled
        ? fingerprintEvaluationInput({
            graph: {
              nodes,
              edges,
            },
            traffic,
          })
        : "",
    [
      enabled,
      nodes,
      edges,
      traffic,
    ],
  );

  // If this hook starts representing another project, throw away the previous
  // project's run state so results can never leak between projects.
  const scope = useRef(scopeKey);

  useEffect(() => {
    if (scope.current !== scopeKey) {
      scope.current = scopeKey;
      session.reset();
    }

    return undefined;
  }, [scopeKey, session]);

  // Also cancel/clear this run session when the controller leaves the page.
  useEffect(
    () => () => {
      session.reset();
    },
    [session],
  );

  // Turn the raw run state into the simpler shape the results UI needs.
  // This also compares the saved run fingerprint with the current fingerprint
  // so the UI knows when a result has become stale.
  const view = useMemo(
    () =>
      buildResultsView(
        state,
        fingerprint,
      ),
    [state, fingerprint],
  );

  // Archie uses the same evaluation result instead of running a second evaluator.
  // Current node labels are passed separately so if the user renames something,
  // Archie explains it using the name currently shown on the canvas.
  const labels = useNodeLabels(nodes);

  const archie = useCallback(
    () =>
      buildArchieView(
        state,
        fingerprint,
        labels,
      ),
    [
      state,
      fingerprint,
      labels,
    ],
  );

  // Evaluate the architecture exactly as it looks right now using the current traffic.
  const run = useCallback(() => {
    if (!enabled) return;

    void session.run({
      projectId: scopeKey,
      nodes,
      edges,
      traffic,
    });
  }, [
    enabled,
    session,
    scopeKey,
    nodes,
    edges,
    traffic,
  ]);

  // Stress Test is the same evaluation, just at a different request rate.
  // We keep that new rate as the current traffic so the result and controls stay in sync.
  const runAtRate = useCallback(
    (requestsPerSecond: number) => {
      if (!enabled) return;

      const next = withRequestRate(
        traffic,
        requestsPerSecond,
      );

      setTrafficState(next);

      void session.run({
        projectId: scopeKey,
        nodes,
        edges,
        traffic: next,
      });
    },
    [
      enabled,
      session,
      scopeKey,
      nodes,
      edges,
      traffic,
    ],
  );

  // Forget all run results and put Stress Test traffic back to where this session started.
  // This does not change the architecture itself.
  const reset = useCallback(() => {
    session.reset();
    setTrafficState(startingTraffic);
  }, [
    session,
    startingTraffic,
  ]);

  // Learn and Challenge both use this same interface, but each gets its own session.
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