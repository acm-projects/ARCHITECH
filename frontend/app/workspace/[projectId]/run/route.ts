import { readFileSync } from "node:fs";
import path from "node:path";

import { requireOwnedProject } from "@/lib/projects/access";

// GET /workspace/[projectId]/run: the project's saved design running as an app, inside ARCHITECH.
// The page is the Docker app's own page (export-templates/runnable-app/web/index.html): Archie's
// "How it works" on the left, the app on the right. It talks to /api/projects/[id]/run/... .
type Context = { params: Promise<{ projectId: string }> };

const PAGE = path.join(process.cwd(), "export-templates", "runnable-app", "web", "index.html");
const escape = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function message(status: number, text: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>ARCHITECH</title><body style="font: 15px system-ui; padding: 32px"><p>${escape(text)}</p><p><a href="/projects">Back to your projects</a></p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(_request: Request, { params }: Context) {
  const { projectId } = await params;
  const owner = await requireOwnedProject(projectId);
  if (!owner.ok) return owner.response.status === 401 ? message(401, "Sign in to run this app.") : message(404, "This project was not found, or it is not yours.");
  const base = `/api/projects/${encodeURIComponent(projectId)}/run`;
  const page = readFileSync(PAGE, "utf8")
    .replace('<meta name="app-base" content="">', `<meta name="app-base" content="${escape(base)}">`)
    .replace("<title>App</title>", `<title>${escape(owner.project.title || "App")} · running in ARCHITECH</title>`);
  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
