import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { runnableAppFiles } from "@/lib/architecture/export/runnableApp";
import { requireOwnedProject } from "@/lib/projects/access";
import type { GraphDocument } from "@/lib/projects/projectPayload";
import { serverError } from "@/lib/server/log";
import { createZip } from "@/lib/zip";

// GET /api/projects/[id]/export/runnable-app: the saved design as an app you can run
// (src/lib/architecture/export/runnableApp.ts): a .zip with a docker-compose project, the app's
// services and page, and a README. 200 application/zip · 401 not signed in · 404 not yours.
type Context = { params: Promise<{ id: string }> };

const TEMPLATES = path.join(process.cwd(), "export-templates", "runnable-app");

function readTemplates(dir = TEMPLATES, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(files, readTemplates(full, `${prefix}${name}/`));
    else files[`${prefix}${name}`] = readFileSync(full, "utf8");
  }
  return files;
}

const folderName = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "app";

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const graph = owner.project.graph as GraphDocument;
    // Archie, ARCHITECH's mascot, explains the app's requests in its "How it works" view.
    const templates = { ...readTemplates(), "web/archie.svg": readFileSync(path.join(process.cwd(), "public", "archie.svg"), "utf8") };
    const { files } = runnableAppFiles({ title: owner.project.title, nodes: graph.nodes ?? [], edges: graph.edges ?? [] }, templates);
    const folder = folderName(owner.project.title);
    const zip = createZip(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([file, content]) => ({ path: `${folder}/${file}`, content })));
    return new Response(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${folder}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError(request, "Failed to export the runnable app.", error, "Unable to export the app.");
  }
}
