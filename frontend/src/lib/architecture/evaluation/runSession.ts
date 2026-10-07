import type { ArchitectureEvaluation } from "./contract.ts";
import type { EvaluateDesign } from "./evaluationService.ts";
import { fingerprintEvaluationInput } from "./fingerprint.ts";
import { snapshotGraph } from "./input.ts";
import { sanitizeTraffic, type TrafficProfile } from "./traffic.ts";

// The Run Design lifecycle for one editing session of one design:
//
//   idle ──run──▶ analyzing ──ok──▶ results ──run──▶ analyzing ...
//                     └──fails──▶ error ──run (retry)──▶ analyzing
//
// A finished result is kept until a newer one replaces it, whether or not the design has
// changed since: whether it is stale is not stored here but worked out by comparing its
// fingerprint with the live design's (see resultsView.ts). A failed run never removes the
// last good result. Nothing here is persisted, and nothing here touches the design.

export type RunResult = {
  evaluation: ArchitectureEvaluation;
  // What the design looked like when it was evaluated (see fingerprint.ts).
  fingerprint: string;
  traffic: TrafficProfile;
};

export type RunState = {
  status: "idle" | "analyzing" | "results" | "error";
  // The latest successful run, and the successful run before it.
  current: RunResult | null;
  previous: RunResult | null;
  // The run in progress.
  pending: { requestId: number; fingerprint: string; traffic: TrafficProfile } | null;
  // Why the latest run failed. Cleared by the next run.
  error: { message: string; requestId: number } | null;
  // Ids are never reused within a session, so a late answer can always be recognised.
  nextRequestId: number;
};

export const INITIAL_RUN_STATE: RunState = {
  status: "idle",
  current: null,
  previous: null,
  pending: null,
  error: null,
  nextRequestId: 1,
};

export type RunAction =
  | { type: "start"; fingerprint: string; traffic: TrafficProfile }
  | { type: "succeed"; requestId: number; evaluation: ArchitectureEvaluation }
  | { type: "fail"; requestId: number; message: string }
  | { type: "reset" };

// Returns the same state when an action changes nothing: starting while a run is already
// in progress, or an answer for a run that is no longer the current one.
export function reduceRun(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start":
      if (state.status === "analyzing") return state;
      return {
        ...state,
        status: "analyzing",
        pending: {
          requestId: state.nextRequestId,
          fingerprint: action.fingerprint,
          traffic: action.traffic,
        },
        error: null,
        nextRequestId: state.nextRequestId + 1,
      };

    case "succeed": {
      if (!state.pending || state.pending.requestId !== action.requestId) return state;
      return {
        ...state,
        status: "results",
        previous: state.current,
        current: {
          evaluation: action.evaluation,
          fingerprint: state.pending.fingerprint,
          traffic: state.pending.traffic,
        },
        pending: null,
        error: null,
      };
    }

    case "fail":
      if (!state.pending || state.pending.requestId !== action.requestId) return state;
      return {
        ...state,
        status: "error",
        pending: null,
        error: { message: action.message, requestId: action.requestId },
      };

    case "reset":
      return { ...INITIAL_RUN_STATE, nextRequestId: state.nextRequestId };
  }
}

export type RunInput = {
  projectId: string | null;
  nodes: Parameters<typeof snapshotGraph>[0];
  edges: Parameters<typeof snapshotGraph>[1];
  traffic: unknown;
};

// Runs the lifecycle against an evaluation function. No React: a UI subscribes to it. One
// instance belongs to one design session, so one project's runs can never show in another.
export function createRunSession(evaluate: EvaluateDesign) {
  let state = INITIAL_RUN_STATE;
  let inFlight: AbortController | null = null;
  const listeners = new Set<() => void>();

  const apply = (action: RunAction) => {
    const next = reduceRun(state, action);
    if (next === state) return false;
    state = next;
    listeners.forEach((listener) => listener());
    return true;
  };

  return {
    getState: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Evaluates the design as it is right now. Returns null (and does nothing) when a run
    // is already in progress, otherwise a promise that settles when this run is finished.
    // The design is copied at the moment of the call, so edits made while it runs cannot
    // change what is evaluated.
    run(input: RunInput): Promise<void> | null {
      const graph = snapshotGraph(input.nodes, input.edges);
      const { traffic } = sanitizeTraffic(input.traffic);
      const fingerprint = fingerprintEvaluationInput({ graph, traffic });

      if (!apply({ type: "start", fingerprint, traffic })) return null;
      const requestId = (state.pending as NonNullable<RunState["pending"]>).requestId;
      const controller = new AbortController();
      inFlight = controller;

      // `new Promise` turns an evaluator that throws straight away into a failed run.
      return new Promise<ArchitectureEvaluation>((resolve) =>
        resolve(evaluate({ projectId: input.projectId, graph, traffic }, { signal: controller.signal })),
      ).then(
        (evaluation) => {
          apply({ type: "succeed", requestId, evaluation });
        },
        (error: unknown) => {
          apply({
            type: "fail",
            requestId,
            message: error instanceof Error && error.message ? error.message : "The evaluation failed.",
          });
        },
      );
    },

    // Forgets everything, cancels a run in progress, and ignores its answer if it arrives.
    reset() {
      inFlight?.abort();
      inFlight = null;
      apply({ type: "reset" });
    },
  };
}

export type RunSession = ReturnType<typeof createRunSession>;
