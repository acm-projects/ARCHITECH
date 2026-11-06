import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { isValidProjectId, validateProjectInput } from "@/lib/projects/projectPayload";
import {
  PROJECT_SELECT,
  checkImplementations,
  etag,
  ifMatchRevision,
  inputToData,
  revisionOf,
  rowToPayload,
} from "@/lib/projects/projectRecords";
import { log, requestIdOf, serverError } from "@/lib/server/log";
import { recordVersion } from "@/lib/projects/versionStore";

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Project not found." };

async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

const unauthenticated = () =>
  NextResponse.json({ error: "Authentication required." }, { status: 401 });

// GET /api/projects/[id]: one project. Another user's project is reported as not found.
export async function GET(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json(NOT_FOUND, { status: 404 });

  try {
    const row = await prisma.project.findFirst({ where: { id, userId }, select: PROJECT_SELECT });
    if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json(rowToPayload(row), { headers: { "Cache-Control": "no-store", ETag: etag(revisionOf(row)) } });
  } catch (error) {
    return serverError(request, "Failed to load project.", error, "Unable to load the project.");
  }
}

// PUT /api/projects/[id]: create the project with this id, or replace it. The id comes from
// the browser (a UUID), so creating offline and retrying are both safe: sending the same
// project twice stores it once.
// Overwrite protection: send `If-Match: "<revision>"` (the ETag of the copy the edit started
// from). If the project changed on the server since (another device saved it), the save is
// refused with 409 and the server's copy: { error, project, revision }. Without If-Match the
// project is replaced as before. Every success returns the new revision as the ETag.
export async function PUT(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();
  const { id } = await params;
  if (!isValidProjectId(id)) {
    return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const validation = validateProjectInput(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const input = validation.value;
  if (typeof (body as { id?: unknown }).id === "string" && (body as { id: string }).id !== id) {
    return NextResponse.json({ error: "The id in the body does not match the URL." }, { status: 400 });
  }

  try {
    const implementationError = await checkImplementations(input.graph);
    if (implementationError) return NextResponse.json({ error: implementationError }, { status: 400 });

    const existing = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
    // Ids are random UUIDs, so this only happens when someone guesses another user's id.
    if (existing && existing.userId !== userId) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    const data = inputToData(input);
    const expected = ifMatchRevision(request.headers.get("if-match"));
    let row;
    if (existing && expected !== null) {
      // Atomic: only replaces the row if it is still at the expected revision.
      const { count } = await prisma.project.updateMany({
        where: { id, userId, syncedAt: new Date(Number(expected)) },
        data,
      });
      const current = await prisma.project.findUnique({ where: { id }, select: PROJECT_SELECT });
      if (count === 0 && current) {
        return NextResponse.json(
          { error: "This project was changed on another device.", project: rowToPayload(current), revision: revisionOf(current) },
          { status: 409, headers: { ETag: etag(revisionOf(current)) } },
        );
      }
      // Deleted in the meantime: store it again.
      row = current ?? (await prisma.project.create({ data: { id, userId, ...data }, select: PROJECT_SELECT }));
    } else {
      row = existing
        ? await prisma.project.update({ where: { id }, data, select: PROJECT_SELECT })
        : await prisma.project.create({ data: { id, userId, ...data }, select: PROJECT_SELECT });
    }
    // Version history: an automatic snapshot when the design changed (best effort: a failure
    // here never fails the save).
    await recordVersion({ id, title: row.title, graph: input.graph }, "auto").catch((error) =>
      log.error("Recording a project version failed.", error, { requestId: requestIdOf(request), projectId: id }),
    );
    return NextResponse.json(rowToPayload(row), { status: existing ? 200 : 201, headers: { ETag: etag(revisionOf(row)) } });
  } catch (error) {
    return serverError(request, "Failed to save project.", error, "Unable to save the project.");
  }
}

// DELETE /api/projects/[id]: delete one of the user's projects.
export async function DELETE(request: Request, { params }: Context) {
  const userId = await currentUserId();
  if (!userId) return unauthenticated();
  const { id } = await params;
  if (!isValidProjectId(id)) return NextResponse.json(NOT_FOUND, { status: 404 });

  try {
    const { count } = await prisma.project.deleteMany({ where: { id, userId } });
    if (count === 0) return NextResponse.json(NOT_FOUND, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError(request, "Failed to delete project.", error, "Unable to delete the project.");
  }
}
