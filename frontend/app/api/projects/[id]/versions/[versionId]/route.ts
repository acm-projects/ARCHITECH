import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOwnedProject } from "@/lib/projects/access";
import { toListItem } from "@/lib/projects/versionStore";
import { serverError } from "@/lib/server/log";

// GET /api/projects/[id]/versions/[versionId]: one version with its diagram, for previewing or
// restoring it ({ ...version, graph }). Restoring happens in the app: the canvas loads the graph
// as one undo step after saving a "before-restore" version, and the normal save follows.
type Context = { params: Promise<{ id: string; versionId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id, versionId } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const row = await prisma.projectVersion.findFirst({ where: { id: versionId, projectId: id } });
    if (!row) return NextResponse.json({ error: "Version not found." }, { status: 404 });
    return NextResponse.json({ ...toListItem(row), graph: row.graph }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(request, "Failed to load a project version.", error, "Unable to load the version.");
  }
}
