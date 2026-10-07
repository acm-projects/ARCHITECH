import type { GraphInput } from "../graph.ts";
import type { ArchitectureEvaluation } from "./contract.ts";
import { evaluateArchitecture } from "./evaluate.ts";
import type { TrafficProfile } from "./traffic.ts";

// The one way the UI asks for an evaluation. Today it runs the local engine; it can later
// call the server instead without any caller changing: the request and the result are
// plain data, and the answer already arrives as a promise that can fail or be cancelled.
//
// BACKEND: replace the body with `POST /api/projects/:projectId/evaluate`.

export type EvaluateDesignRequest = {
  // Which project is being evaluated, or null for a session that is not saved.
  projectId: string | null;
  graph: GraphInput;
  traffic: TrafficProfile;
};

export type EvaluateDesign = (
  request: EvaluateDesignRequest,
  options?: { signal?: AbortSignal },
) => Promise<ArchitectureEvaluation>;

export const evaluateDesign: EvaluateDesign = async (request, options) => {
  if (options?.signal?.aborted) {
    const error = new Error("The evaluation was cancelled.");
    error.name = "AbortError";
    throw error;
  }
  return evaluateArchitecture({ graph: request.graph, traffic: request.traffic });
};
