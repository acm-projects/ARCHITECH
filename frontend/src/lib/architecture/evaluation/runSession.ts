import type { ArchitectureEvaluation } from "./contract.ts";
import type { EvaluateDesign } from "./evaluationService.ts";
import { fingerprintEvaluationInput } from "./fingerprint.ts";
import { snapshotGraph } from "./input.ts";
import { sanitizeTraffic, type TrafficProfile } from "./traffic.ts";

// manages the full lifecycle of one Run Design session.
//
// the flow is:
// idle -> analyzing -> results
//                  -> error
//
// a successful result stays around until a newer successful run replaces it.
// changing the architecture does not delete the old result; the UI marks it as stale instead.
//
// nothing here changes or saves the actual architecture.
export type RunResult = {
  evaluation: ArchitectureEvaluation;

  // remembers exactly which architecture + traffic produced this result.
  fingerprint: string;

  // remembers the traffic this specific run was tested against.
  traffic: TrafficProfile;
};

// keeps everything we need to know about the current Run Design session.
export type RunState = {
  status: "idle" | "analyzing" | "results" | "error";

  // current is the latest successful run, and previous lets us compare it to the run before.
  current: RunResult | null;
  previous: RunResult | null;

  // keeps track of the evaluation that is currently running.
  pending: {
    requestId: number;
    fingerprint: string;
    traffic: TrafficProfile;
  } | null;

  // keeps the latest error so the UI can show it and let the user retry.
  error: {
    message: string;
    requestId: number;
  } | null;

  // every run gets a new id so an old/late response can never replace a newer result.
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

// these are the only things allowed to change the run lifecycle.
export type RunAction =
  | {
      type: "start";
      fingerprint: string;
      traffic: TrafficProfile;
    }
  | {
      type: "succeed";
      requestId: number;
      evaluation: ArchitectureEvaluation;
    }
  | {
      type: "fail";
      requestId: number;
      message: string;
    }
  | {
      type: "reset";
    };

// takes the current run state and an action, then decides what the next state should be.
//
// keeping this separate from React makes the run lifecycle easier to test and keeps
// weird timing cases from being handled differently in different UI components.
export function reduceRun(
  state: RunState,
  action: RunAction,
): RunState {
  switch (action.type) {
    case "start":
      // ignore another Run click while an evaluation is already running.
      if (state.status === "analyzing") {
        return state;
      }

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
      // ignore a late response if it does not belong to the run we are waiting for anymore.
      if (
        !state.pending ||
        state.pending.requestId !== action.requestId
      ) {
        return state;
      }

      return {
        ...state,
        status: "results",

        // keep the last successful result so the UI can compare runs.
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
      // ignore an error from an old run for the same reason we ignore an old success.
      if (
        !state.pending ||
        state.pending.requestId !== action.requestId
      ) {
        return state;
      }

      return {
        ...state,
        status: "error",
        pending: null,

        // keep current/previous results so one failed retry does not erase the last good result.
        error: {
          message: action.message,
          requestId: action.requestId,
        },
      };

    case "reset":
      // clear the session but keep increasing request ids so old responses can never match a new run.
      return {
        ...INITIAL_RUN_STATE,
        nextRequestId: state.nextRequestId,
      };
  }
}

export type RunInput = {
  projectId: string | null;
  nodes: Parameters<typeof snapshotGraph>[0];
  edges: Parameters<typeof snapshotGraph>[1];
  traffic: unknown;
};

// creates one independent Run Design session.
//
// Learn and Challenge can both use this, but each controller creates its own instance,
// which is why their results never leak into each other.
//
// BACKEND: this session should stay the same when evaluation moves to the server.
// the actual backend request belongs behind the EvaluateDesign function passed in here.
export function createRunSession(
  evaluate: EvaluateDesign,
) {
  let state = INITIAL_RUN_STATE;

  // keeps the current evaluation request so Reset can cancel it.
  let inFlight: AbortController | null = null;

  // React subscribes to this set so it knows when the run state changes.
  const listeners = new Set<() => void>();

  // sends an action through the reducer and tells subscribers only when something actually changed.
  const apply = (action: RunAction) => {
    const next = reduceRun(state, action);

    if (next === state) {
      return false;
    }

    state = next;

    listeners.forEach((listener) => {
      listener();
    });

    return true;
  };

  return {
    // gives React the latest run state.
    getState: () => state,

    // lets React listen for run-state changes.
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    // takes a snapshot of the architecture and evaluates exactly that version.
    //
    // this is important because the user can keep editing while evaluation is running.
    // those later edits should not secretly change the design that was already submitted.
    run(input: RunInput): Promise<void> | null {
      const graph = snapshotGraph(
        input.nodes,
        input.edges,
      );

      const { traffic } =
        sanitizeTraffic(input.traffic);

      const fingerprint =
        fingerprintEvaluationInput({
          graph,
          traffic,
        });

      // start returns false if another evaluation is already running.
      if (
        !apply({
          type: "start",
          fingerprint,
          traffic,
        })
      ) {
        return null;
      }

      // grab the id that was just assigned to this specific run.
      const requestId = (
        state.pending as NonNullable<
          RunState["pending"]
        >
      ).requestId;

      // give this run its own cancellation controller.
      const controller =
        new AbortController();

      inFlight = controller;

      // wrap the evaluator so both async failures and immediate throws end up
      // going through the same success/error lifecycle.
      return new Promise<ArchitectureEvaluation>(
        (resolve) =>
          resolve(
            evaluate(
              {
                projectId: input.projectId,
                graph,
                traffic,
              },
              {
                signal: controller.signal,
              },
            ),
          ),
      ).then(
        (evaluation) => {
          // the reducer will ignore this if this run is no longer the active request.
          apply({
            type: "succeed",
            requestId,
            evaluation,
          });
        },

        (error: unknown) => {
          // turn any evaluator failure into a message the results UI can show.
          apply({
            type: "fail",
            requestId,
            message:
              error instanceof Error &&
              error.message
                ? error.message
                : "The evaluation failed.",
          });
        },
      );
    },

    // forget all results and cancel anything that is still evaluating.
    //
    // if the cancelled evaluator still returns later, its old request id will
    // no longer match anything active, so the answer is safely ignored.
    reset() {
      inFlight?.abort();
      inFlight = null;

      apply({
        type: "reset",
      });
    },
  };
}

// useful anywhere we need the type of a run-session instance.
export type RunSession =
  ReturnType<typeof createRunSession>;