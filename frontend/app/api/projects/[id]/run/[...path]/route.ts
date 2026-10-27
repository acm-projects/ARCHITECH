import { NextResponse } from "next/server";

import { MAX_FILE, RunApp, runConfig } from "@/lib/architecture/run/runApp";
import { requireOwnedProject } from "@/lib/projects/access";
import type { GraphDocument } from "@/lib/projects/projectPayload";
import { serverError } from "@/lib/server/log";

// /api/projects/[id]/run/...: the project's saved design running as an app inside ARCHITECH
// (src/lib/architecture/run/runApp.ts), for the page at /workspace/[id]/run. Owner only.
//   GET  .../app.config.json   the app's settings (the same file the Docker app has)
//   *    .../api/...           the app's API, through every part of the design's request path
type Context = { params: Promise<{ id: string; path: string[] }> };

const basePath = (id: string) => `/api/projects/${encodeURIComponent(id)}/run`;

async function handle(request: Request, { params }: Context) {
  const { id, path } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const graph = owner.project.graph as GraphDocument;
    const config = runConfig({ title: owner.project.title, nodes: graph.nodes ?? [], edges: graph.edges ?? [] });

    if (path.length === 1 && path[0] === "app.config.json" && request.method === "GET") {
      return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
    }
    if (path[0] !== "api") return NextResponse.json({ error: "Not found." }, { status: 404 });

    // The largest request is a file upload (5 MB); anything bigger is refused before it is read.
    if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE + 64_000) return NextResponse.json({ error: "That is too large." }, { status: 413 });
    const body = request.method === "GET" || request.method === "HEAD" ? new Uint8Array() : new Uint8Array(await request.arrayBuffer());
    if (body.length > MAX_FILE + 64_000) return NextResponse.json({ error: "That is too large." }, { status: 413 });

    const url = new URL(request.url);
    const answer = await new RunApp(id, config, basePath(id)).handle({
      method: request.method,
      path: `/${path.join("/")}`,
      query: url.searchParams,
      headers: request.headers,
      body,
    });
    if (answer.bytes) return new Response(Buffer.from(answer.bytes), { status: answer.status, headers: answer.headers });
    return NextResponse.json(answer.json, { status: answer.status, headers: answer.headers });
  } catch (error) {
    return serverError(request, "The app running inside ARCHITECH failed.", error, "The app failed.");
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
