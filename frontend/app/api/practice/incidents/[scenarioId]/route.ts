import { NextResponse } from "next/server";

import { scenarioById, scenarioView } from "@/lib/architecture/practice/scenarios";
import { practiceUser } from "@/lib/server/practice";

// GET /api/practice/incidents/[scenarioId]: one scenario to attempt: the design, traffic, incident,
// goal, and what the incident does to the starting design. The root cause and debrief are only
// given once an attempt is graded.
//   200 { id, title, brief, symptom, goal, design, traffic, incident, impact } · 401 · 404 unknown scenario
type Context = { params: Promise<{ scenarioId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await practiceUser();
  if (!user.ok) return user.response;
  const scenario = scenarioById((await params).scenarioId);
  if (!scenario) return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  return NextResponse.json(scenarioView(scenario));
}
