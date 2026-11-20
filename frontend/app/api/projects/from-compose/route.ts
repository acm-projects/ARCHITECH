import { randomUUID } from "node:crypto";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { MAX_TITLE_LENGTH } from "@/components/projects/projectStore";
import { MAX_COMPOSE_BYTES, designFromCompose } from "@/lib/architecture/export/fromCompose";
import { prisma } from "@/lib/prisma";
import { PROJECT_SELECT, inputToData, rowToPayload } from "@/lib/projects/projectRecords";
import { serverError } from "@/lib/server/log";

// POST /api/projects/from-compose  { yaml, title?, source?, preview? }
// Creates a project from a docker-compose file (src/lib/architecture/export/fromCompose.ts):
// exactly the design in a file ARCHITECH wrote (its x-architech fields, which the user may
// have edited, e.g. after a GitHub import preview), or a design recognized from any other
// compose file. source: "github" when the file came from a repository import (default
// "compose"). title defaults to the file's x-architech title.
//   201 { project, warnings }       created
//   200 { title, nodes, edges, warnings } with preview: true (checked, nothing saved)
//   400 the body or the file is invalid (error says what) · 401 not signed in
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "The request body must be a JSON object." }, { status: 400 });
  }
  const { yaml, title, source, preview, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return NextResponse.json({ error: `Unknown field "${Object.keys(rest)[0]}".` }, { status: 400 });
  if (typeof yaml !== "string" || !yaml.trim()) return NextResponse.json({ error: "yaml must be the docker-compose file's text." }, { status: 400 });
  if (yaml.length > MAX_COMPOSE_BYTES) return NextResponse.json({ error: `The file is larger than ${MAX_COMPOSE_BYTES / 1000} KB.` }, { status: 400 });
  if (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE_LENGTH)) {
    return NextResponse.json({ error: `title must be 1-${MAX_TITLE_LENGTH} characters.` }, { status: 400 });
  }
  if (source !== undefined && source !== "github" && source !== "compose") return NextResponse.json({ error: 'source must be "github" or "compose".' }, { status: 400 });
  if (preview !== undefined && typeof preview !== "boolean") return NextResponse.json({ error: "preview must be true or false." }, { status: 400 });

  const read = designFromCompose(yaml);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const name = ((title as string | undefined) ?? read.title ?? "Imported design").trim().slice(0, MAX_TITLE_LENGTH);
  if (preview) {
    return NextResponse.json({ title: name, nodes: read.graph.nodes.length, edges: read.graph.edges.length, warnings: read.warnings });
  }

  try {
    const now = new Date().toISOString();
    const row = await prisma.project.create({
      data: {
        id: randomUUID(),
        userId,
        ...inputToData({
          title: name,
          mode: "learn",
          // Opens in free play, with Run Design, rather than the guided lesson.
          learnSkipped: true,
          source: (source as "github" | "compose" | undefined) ?? "compose",
          graph: read.graph,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        }),
      },
      select: PROJECT_SELECT,
    });
    return NextResponse.json({ project: rowToPayload(row), warnings: read.warnings }, { status: 201 });
  } catch (error) {
    return serverError(request, "Creating a project from docker-compose failed.", error, "Unable to create the project. Please try again.");
  }
}
