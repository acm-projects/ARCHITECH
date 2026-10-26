import { NextResponse } from "next/server";

import type { GraphInput } from "@/lib/architecture/graph";
import { gradeIncidentAttempt, scenarioById, scenarioTraffic } from "@/lib/architecture/practice/scenarios";
import { serverError } from "@/lib/server/log";
import { badRequest, practiceLimit, practiceUser, readFields, readGraph, saveAttempt } from "@/lib/server/practice";

// POST /api/practice/incidents/[scenarioId]/attempts: grades an Incident Lab attempt.
//   body { diagnosis?, graph? }: at least one.
//     diagnosis: the component id the learner thinks is the weakness
//     graph: their revised design; the incident is replayed on it and the goal checked
//   201 { attempt: { id, createdAt }, passed, checks, diagnosis, impact, debrief }
//   400 invalid input · 401 not signed in · 404 unknown scenario · 429 more than 120 attempts an hour
type Context = { params: Promise<{ scenarioId: string }> };

export async function POST(request: Request, { params }: Context) {
  const user = await practiceUser();
  if (!user.ok) return user.response;
  const scenario = scenarioById((await params).scenarioId);
  if (!scenario) return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  const fields = await readFields(request, ["diagnosis", "graph"]);
  if (!fields.ok) return fields.response;
  const { diagnosis, graph: rawGraph } = fields.body;
  if (diagnosis === undefined && rawGraph === undefined) return badRequest("Send a diagnosis, a revised graph, or both.");
  if (diagnosis !== undefined && (typeof diagnosis !== "string" || !scenario.design.nodes.some((node) => node.id === diagnosis))) {
    return badRequest("diagnosis must be the id of a component in the scenario's design.");
  }
  const graph = rawGraph === undefined ? null : readGraph(rawGraph);
  if (graph && !graph.ok) return graph.response;

  try {
    const limited = await practiceLimit(user.userId);
    if (limited) return limited;
    const graded = gradeIncidentAttempt(scenario, {
      ...(diagnosis !== undefined ? { diagnosis: diagnosis as string } : {}),
      ...(graph?.ok ? { graph: graph.graph as unknown as GraphInput } : {}),
    });
    const answers = [...(graded.diagnosis ? [graded.diagnosis.correct] : []), ...(graded.checks.length > 0 ? [graded.passed] : [])];
    const attempt = await saveAttempt({
      userId: user.userId,
      kind: "incident",
      scenarioId: scenario.id,
      graph: graph?.ok ? graph.graph : scenario.design,
      traffic: scenarioTraffic(scenario),
      answer: { diagnosis: diagnosis ?? null, revised: Boolean(graph?.ok) },
      result: { passed: graded.passed, checks: graded.checks, diagnosis: graded.diagnosis },
      correct: answers.filter(Boolean).length,
      total: answers.length,
      passed: graded.passed,
    });
    return NextResponse.json({ attempt, ...graded }, { status: 201 });
  } catch (error) {
    return serverError(request, "Failed to grade an incident attempt.", error, "Unable to grade your attempt right now.");
  }
}
