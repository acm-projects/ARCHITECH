import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOwnedProject } from "@/lib/projects/access";
import type { GraphDocument } from "@/lib/projects/projectPayload";
import { VERSION_LIST_SELECT, recordVersion, toListItem } from "@/lib/projects/versionStore";
import { validateLabel } from "@/lib/projects/versions";
import { serverError } from "@/lib/server/log";

// Version history of a project (rules: src/lib/projects/versions.ts).
//   GET   200 { versions: [{ id, title, kind, label, summary, createdAt }] }, newest first
//   POST  body { label?, kind?: "manual" | "before-restore" | "other-device" }: snapshot the
//         saved project now ("other-device": the sync engine keeps a version saved elsewhere
//         before overwriting it)
//         201 { version }
// Automatic versions are recorded by PUT /api/projects/[id] when the design changes.
// 401 not signed in · 404 not one of the user's projects.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const rows = await prisma.projectVersion.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: VERSION_LIST_SELECT,
    });
    return NextResponse.json({ versions: rows.map(toListItem) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(request, "Failed to list project versions.", error, "Unable to load the version history.");
  }
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const label = validateLabel(body.label);
  if (!label.ok) return NextResponse.json({ error: label.error }, { status: 400 });
  const kind = body.kind ?? "manual";
  if (kind !== "manual" && kind !== "before-restore" && kind !== "other-device") {
    return NextResponse.json({ error: 'kind must be "manual", "before-restore" or "other-device".' }, { status: 400 });
  }
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const version = await recordVersion(
      { id, title: owner.project.title, graph: owner.project.graph as GraphDocument },
      kind,
      label.value,
    );
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return serverError(request, "Failed to save a project version.", error, "Unable to save the version.");
  }
}
