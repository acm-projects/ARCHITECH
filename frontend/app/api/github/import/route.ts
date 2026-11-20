import { randomUUID } from "node:crypto";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { GitHubError, importRepository, validateImportRequest } from "@/lib/github/importRepo";
import { githubGraphql } from "@/lib/github/repoFiles";
import { githubAccessTokenFor } from "@/lib/github/githubTokenServer";
import { prisma } from "@/lib/prisma";
import { PROJECT_SELECT, inputToData, rowToPayload } from "@/lib/projects/projectRecords";
import { serverError } from "@/lib/server/log";

// POST /api/github/import  { owner, repo, preview? }
// Reads the repository's stack files with GitHub's GraphQL API (using the GitHub account the
// user connected at sign-in), detects its components and technologies, builds a design and
// saves it as a new project. Technologies it uses that the app does not model are saved with
// the project for its sidebar. Returns 201 { project, detected, customTechnologies, scannedFiles }.
// The project then reaches the browser through the normal project sync.
// With preview: true nothing is saved: 200 { title, yaml, detected, customTechnologies,
// scannedFiles }, where yaml is the design as ARCHITECH's docker-compose file for the user to
// review and edit; POST /api/projects/from-compose then creates the project from it.
const STATUS: Record<GitHubError["kind"], number> = {
  "not-found": 404,
  "nothing-detected": 422,
  unauthorized: 401,
  "rate-limited": 429,
  failed: 502,
};

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
  const parsed = validateImportRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    // The user's GitHub token, refreshed automatically when it has expired.
    const githubToken = await githubAccessTokenFor(userId);
    if (!githubToken.ok) return NextResponse.json({ error: githubToken.error }, { status: githubToken.status });

    const result = await importRepository(githubGraphql(githubToken.token), parsed.value);
    if (parsed.value.preview) {
      return NextResponse.json({
        title: result.title,
        yaml: result.yaml,
        detected: result.detected,
        customTechnologies: result.customTechnologies,
        scannedFiles: result.scannedFiles,
      });
    }
    const now = new Date().toISOString();
    const row = await prisma.project.create({
      data: {
        id: randomUUID(),
        userId,
        ...inputToData({
          title: result.title,
          mode: "learn",
          // Opens in free play, with Run Design, rather than the guided lesson.
          learnSkipped: true,
          source: "github",
          graph: result.graph,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        }),
      },
      select: PROJECT_SELECT,
    });
    return NextResponse.json(
      {
        project: rowToPayload(row),
        detected: result.detected,
        customTechnologies: result.customTechnologies,
        scannedFiles: result.scannedFiles,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof GitHubError) {
      return NextResponse.json({ error: error.message }, { status: STATUS[error.kind] });
    }
    return serverError(request, "GitHub import failed.", error, "Unable to import the repository. Please try again.");
  }
}
