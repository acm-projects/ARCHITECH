import ProjectWorkspace from "@/components/workspace/ProjectWorkspace";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  // Get the project ID from the URL so we know which workspace to open.
  const { projectId } = await params;

  return <ProjectWorkspace key={projectId} projectId={projectId} />;
}