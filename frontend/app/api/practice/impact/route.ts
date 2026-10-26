import { NextResponse } from "next/server";

import { incidentImpact, parseIncident } from "@/lib/architecture/practice/incidents";
import type { GraphInput } from "@/lib/architecture/graph";
import { serverError } from "@/lib/server/log";
import { practiceUser, readFields, readGraph } from "@/lib/server/practice";

// POST /api/practice/impact: "what if this part fails?" for any design
// (src/lib/architecture/practice/incidents.ts). Nothing is saved.
//   body { graph, traffic?, incident: { kind: "component-down" | "instance-down", nodeId }
//                                    | { kind: "capacity-drop", nodeId, factor } | { kind: "traffic-spike", multiplier } }
//   200 { incident, description, failed, cutOff, operations, healthy, during, explanation }
//   400 invalid input · 401 not signed in

export async function POST(request: Request) {
  const user = await practiceUser();
  if (!user.ok) return user.response;
  const fields = await readFields(request, ["graph", "traffic", "incident"]);
  if (!fields.ok) return fields.response;
  const graph = readGraph(fields.body.graph);
  if (!graph.ok) return graph.response;
  const design = graph.graph as unknown as GraphInput;
  const incident = parseIncident(fields.body.incident, design);
  if (!incident.ok) return NextResponse.json({ error: incident.error }, { status: 400 });
  try {
    return NextResponse.json(incidentImpact(design, fields.body.traffic, incident.incident), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(request, "Failed to work out an incident's impact.", error, "Unable to work out the impact right now.");
  }
}
