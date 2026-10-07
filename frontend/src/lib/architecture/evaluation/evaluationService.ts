import type { GraphInput } from "../graph.ts";
import type { ArchitectureEvaluation } from "./contract.ts";
import { evaluateArchitecture } from "./evaluate.ts";
import type { TrafficProfile } from "./traffic.ts";

// This is the one place the rest of the frontend asks to evaluate a design.
//
// Right now evaluation happens locally with evaluateArchitecture().
// Later, this file can call the backend instead without Learn, Challenge,
// Run Design, Stress Test, or Archie needing to know where evaluation happens.
//
// BACKEND: Replace the local evaluateArchitecture() call below with the real
// evaluation API, for example POST /api/projects/:projectId/evaluate.
export type EvaluateDesignRequest = {
  // The project being evaluated. null is allowed for an unsaved/session-only design.
  projectId: string | null;

  // The architecture the user wants evaluated.
  graph: GraphInput;

  // The traffic/load conditions we want to test the architecture against.
  traffic: TrafficProfile;
};

// Everything that runs a design depends on this function shape instead of
// depending directly on the local evaluator or a future backend API.
//
// It already returns a Promise and accepts an AbortSignal so moving evaluation
// to a network request later should not require changing the callers.
export type EvaluateDesign = (
  request: EvaluateDesignRequest,
  options?: {
    signal?: AbortSignal;
  },
) => Promise<ArchitectureEvaluation>;

// current frontend implementation of the evaluation service.
export const evaluateDesign: EvaluateDesign = async (
  request,
  options,
) => {
  // run may be cancelled if the user leaves, resets, or starts another run.
  // stop before doing evaluation if that already happened.
  if (options?.signal?.aborted) {
    const error = new Error(
      "The evaluation was cancelled.",
    );

    error.name = "AbortError";
    throw error;
  }

  // for now everything is calculated locally in the browser.
  //
  // BACKEND: This is the line to replace with the evaluation API call.
  // Send request.projectId, request.graph, and request.traffic, then return
  // the server response in the same ArchitectureEvaluation shape.
  return evaluateArchitecture({
    graph: request.graph,
    traffic: request.traffic,
  });
};