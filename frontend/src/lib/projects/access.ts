import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../../app/api/auth/[...nextauth]/route";
import { prisma } from "../prisma";
import { isValidProjectId } from "./projectPayload";

// For routes under /api/projects/[id]/...: the signed-in user and their project, or the
// response to send instead (401 not signed in, 404 not one of their projects).
export async function requireOwnedProject(
  id: string,
): Promise<{ ok: true; userId: string; project: { id: string; title: string; graph: unknown } } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { ok: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const notFound = { ok: false as const, response: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  if (!isValidProjectId(id)) return notFound;
  const project = await prisma.project.findFirst({ where: { id, userId }, select: { id: true, title: true, graph: true } });
  return project ? { ok: true, userId, project } : notFound;
}
