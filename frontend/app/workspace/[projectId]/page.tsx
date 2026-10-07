import AuthGate from "@/components/auth/AuthGate";
import ProjectWorkspace from "@/components/workspace/ProjectWorkspace";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // Keyed so that moving between projects never reuses the previous project's state.
  return (
    <AuthGate>
      <ProjectWorkspace key={projectId} projectId={projectId} />
    </AuthGate>
  );
}
