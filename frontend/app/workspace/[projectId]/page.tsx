import AuthGate from "@/components/auth/AuthGate";
import ProjectWorkspace from "@/components/workspace/ProjectWorkspace";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  // Get the project ID from the URL so we know which workspace to open.
  const { projectId } = await params;

  // Workspace pages are private, so only signed-in users can open a project.
  return (
    <AuthGate>
      {/* Give each project its own component instance so switching projects can't
          accidentally carry over canvas/history state from the previous one. */}
      <ProjectWorkspace key={projectId} projectId={projectId} />
    </AuthGate>
  );
}

/*Big Picture:
  /workspace/abc123
      ↓
  get "abc123"
      ↓
  make sure user is signed in
      ↓
  open ProjectWorkspace for abc123
*/