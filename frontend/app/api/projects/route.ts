import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { PROJECT_SELECT, rowToPayload } from "@/lib/projects/projectRecords";
import { serverError } from "@/lib/server/log";

// GET /api/projects: every project of the signed-in user, most recently changed first.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const rows = await prisma.project.findMany({
      where: { userId: session.user.id },
      select: PROJECT_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(
      { projects: rows.map(rowToPayload) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError(request, "Failed to list projects.", error, "Unable to load your projects.");
  }
}
