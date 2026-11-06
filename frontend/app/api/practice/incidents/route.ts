import { NextResponse } from "next/server";

import { INCIDENT_SCENARIOS } from "@/lib/architecture/practice/scenarios";
import { prisma } from "@/lib/prisma";
import { serverError } from "@/lib/server/log";
import { practiceUser } from "@/lib/server/practice";

// GET /api/practice/incidents: the Incident Lab scenarios, and whether the signed-in user has passed each.
//   200 { scenarios: [{ id, title, brief, symptom, goal, attempts, passed }] } · 401 not signed in

export async function GET(request: Request) {
  const user = await practiceUser();
  if (!user.ok) return user.response;
  try {
    const rows = await prisma.practiceAttempt.groupBy({
      by: ["scenarioId", "passed"],
      where: { userId: user.userId, kind: "incident" },
      _count: { _all: true },
    });
    const scenarios = INCIDENT_SCENARIOS.map(({ id, title, brief, symptom, goal }) => ({
      id,
      title,
      brief,
      symptom,
      goal,
      attempts: rows.filter((row) => row.scenarioId === id).reduce((sum, row) => sum + row._count._all, 0),
      passed: rows.some((row) => row.scenarioId === id && row.passed),
    }));
    return NextResponse.json({ scenarios }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(request, "Failed to list incident scenarios.", error, "Unable to load the Incident Lab.");
  }
}
