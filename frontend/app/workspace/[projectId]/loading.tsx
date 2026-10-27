// Switch away from the dashboard while the workspace route is loading.
export default function WorkspaceLoading() {
  return (
    <main className="h-dvh bg-white" aria-busy="true">
      <p role="status" className="sr-only">Opening canvas...</p>
    </main>
  );
}
