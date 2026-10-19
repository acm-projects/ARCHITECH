import { NextResponse } from "next/server";

import { validateConversation } from "@/lib/ai/conversation";
import { prisma } from "@/lib/prisma";
import { requireOwnedProject } from "@/lib/projects/access";
import { serverError } from "@/lib/server/log";

// The project's saved AI Architect conversation.
//   GET     200 { turns, updatedAt }   (turns: [] when there is none yet)
//   PUT     body { turns }  200 { updatedAt }  ·  400 invalid
//   DELETE  204 (start a new conversation)
// 401 not signed in · 404 not one of the user's projects (or not saved to the server yet).

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const row = await prisma.aiConversation.findUnique({ where: { projectId: id } });
    return NextResponse.json(
      { turns: row?.turns ?? [], updatedAt: row?.updatedAt.toISOString() ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError(request, "Failed to load the AI conversation.", error, "Unable to load the conversation.");
  }
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = validateConversation(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const turns = parsed.value as unknown as object;
    const row = await prisma.aiConversation.upsert({
      where: { projectId: id },
      create: { projectId: id, turns },
      update: { turns },
    });
    return NextResponse.json({ updatedAt: row.updatedAt.toISOString() });
  } catch (error) {
    return serverError(request, "Failed to save the AI conversation.", error, "Unable to save the conversation.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    await prisma.aiConversation.deleteMany({ where: { projectId: id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError(request, "Failed to clear the AI conversation.", error, "Unable to clear the conversation.");
  }
}
