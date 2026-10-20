import { toDockerCompose } from "@/lib/architecture/export/dockerCompose";
import { requireOwnedProject } from "@/lib/projects/access";
import type { GraphDocument } from "@/lib/projects/projectPayload";
import { serverError } from "@/lib/server/log";

// GET /api/projects/[id]/export/docker-compose: the saved project as a starter
// docker-compose.yml (src/lib/architecture/export/dockerCompose.ts), as a download.
// 200 text/yaml · 401 not signed in · 404 not one of the user's projects.
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const owner = await requireOwnedProject(id);
    if (!owner.ok) return owner.response;
    const graph = owner.project.graph as GraphDocument;
    const { yaml } = toDockerCompose({ title: owner.project.title, nodes: graph.nodes ?? [], edges: graph.edges ?? [] });
    return new Response(yaml, {
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="docker-compose.yml"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError(request, "Failed to export docker-compose.", error, "Unable to export the project.");
  }
}
