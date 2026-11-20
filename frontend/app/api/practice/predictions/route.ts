import { NextResponse } from "next/server";

import { gradePrediction, parsePrediction } from "@/lib/architecture/practice/predictions";
import { sanitizeTraffic } from "@/lib/architecture/evaluation/traffic";
import type { GraphInput } from "@/lib/architecture/graph";
import { serverError } from "@/lib/server/log";
import { practiceLimit, practiceUser, readFields, readGraph, readProjectId, saveAttempt } from "@/lib/server/practice";

// POST /api/practice/predictions: "Predict, then run". The learner's prediction about a design
// (src/lib/architecture/practice/predictions.ts) is graded with the metrics engine, explained, and
// saved to their practice history.
//   body { graph, traffic?, after?, prediction, projectId? }
//     after: the design with a proposed change, for prediction.change
//   201 { attempt: { id, createdAt }, answers, correct, total, actual, adjustedInputs }
//   400 invalid input · 401 not signed in · 429 more than 120 practice attempts an hour

export async function POST(request: Request) {
  const user = await practiceUser();
  if (!user.ok) return user.response;
  const fields = await readFields(request, ["graph", "traffic", "after", "prediction", "projectId"]);
  if (!fields.ok) return fields.response;
  const { body } = fields;
  const graph = readGraph(body.graph);
  if (!graph.ok) return graph.response;
  const after = body.after === undefined ? null : readGraph(body.after, "after");
  if (after && !after.ok) return after.response;
  const projectId = readProjectId(body.projectId);
  if (!projectId.ok) return projectId.response;
  const prediction = parsePrediction(body.prediction, graph.graph as unknown as GraphInput, Boolean(after));
  if (!prediction.ok) return NextResponse.json({ error: prediction.error }, { status: 400 });
  const { traffic, adjusted } = sanitizeTraffic(body.traffic);

  try {
    const limited = await practiceLimit(user.userId);
    if (limited) return limited;
    const graded = gradePrediction(graph.graph as unknown as GraphInput, traffic, prediction.value, after?.ok ? (after.graph as unknown as GraphInput) : undefined);
    const attempt = await saveAttempt({
      userId: user.userId,
      kind: "prediction",
      projectId: projectId.projectId,
      graph: after?.ok ? { before: graph.graph, after: after.graph } : graph.graph,
      traffic,
      answer: prediction.value,
      result: graded,
      correct: graded.correct,
      total: graded.total,
      passed: graded.correct === graded.total,
    });
    return NextResponse.json({ attempt, ...graded, adjustedInputs: adjusted }, { status: 201 });
  } catch (error) {
    return serverError(request, "Failed to grade a prediction.", error, "Unable to grade your prediction right now.");
  }
}
