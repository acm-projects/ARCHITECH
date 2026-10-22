"use client";

import { GitBranch } from "lucide-react";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { parseRepositoryUrl, readRepositories, type Repository } from "../../lib/github/repositoryPicker";
import { HOME_ROUTE } from "../../lib/routes";
import { isValidProjectId, payloadToStoredProject, validateProjectInput } from "../../lib/projects/projectPayload";
import { projectStore, type Project } from "../projects/projectStore";
import ImportReview from "./ImportReview";

export default function GitRepositoryPicker({ onBack, onBusyChange, onImported }: {
  onBack: () => void;
  onImported: (project: Project) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  // The repository as ARCHITECH's compose file, shown for review before the design is created.
  const [review, setReview] = useState<{ title: string; yaml: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/github/repos?page=${page}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) {
          setNeedsConnection([401, 404, 409].includes(response.status));
          throw new Error(typeof body?.error === "string" ? body.error : "Unable to load repositories.");
        }
        const next = readRepositories(body);
        if (controller.signal.aborted) return;
        setNeedsConnection(false);
        setRepos(previous => page === 1 ? next : [...previous, ...next.filter(repo => !previous.some(item => item.id === repo.id))]);
        setHasMore(next.length === 100);
      } catch (cause) {
        if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : "Unable to load repositories.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, attempt]);

  const setWorking = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange(value);
  };

  const connect = async () => {
    if (busyRef.current) return;
    setWorking(true);
    setError(null);
    try {
      const result = await signIn("github", { callbackUrl: `${HOME_ROUTE}?newProject=git` });
      if (result?.error) throw new Error("Unable to connect GitHub. Please try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect GitHub.");
    } finally {
      setWorking(false);
    }
  };

  const importRepo = async (repository: { owner: string; repo: string }) => {
    if (busyRef.current) return;
    setWorking(true);
    setImporting(`${repository.owner}/${repository.repo}`);
    setError(null);
    try {
      // Read the repository and show the design for review; nothing is saved yet.
      const response = await fetch("/api/github/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: repository.owner, repo: repository.repo, preview: true }),
      });
      const body = await response.json();
      if (!response.ok) {
        if ([401, 409].includes(response.status)) setNeedsConnection(true);
        throw new Error(typeof body?.error === "string" ? body.error : "Unable to import repository.");
      }
      if (typeof body?.yaml !== "string" || typeof body?.title !== "string") throw new Error("The import preview response is invalid.");
      setReview({ title: body.title, yaml: body.yaml });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import repository.");
    } finally {
      setWorking(false);
      setImporting(null);
    }
  };

  // Creates the project from the reviewed file. Returns an error message, or null.
  const create = async ({ title, yaml }: { title: string; yaml: string }): Promise<string | null> => {
    try {
      const response = await fetch("/api/projects/from-compose", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, yaml, source: "github" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) return typeof body?.error === "string" ? body.error : "Unable to create the design.";
      const project = body?.project;
      const checked = validateProjectInput(project);
      if (!checked.ok || !isValidProjectId(project?.id)) return "The imported project response is invalid.";
      let imported: Project;
      try {
        imported = projectStore.receiveProject(payloadToStoredProject({ ...checked.value, id: project.id }));
      } catch {
        return "The project was saved to your account, but browser storage is unavailable. Reopen it from Projects after restoring storage.";
      }
      onImported(imported);
      return null;
    } catch {
      return "Unable to create the design. Check your connection and try again.";
    }
  };

  if (review) {
    return (
      <ImportReview
        initialTitle={review.title}
        initialYaml={review.yaml}
        busy={busy}
        onBusyChange={setWorking}
        onCreate={create}
        onBack={() => setReview(null)}
      />
    );
  }

  return (
    <div className="ax-repository-picker" aria-busy={busy}>
      <div className="ax-repository-list" aria-label="Your GitHub repositories">
        {repos.map(repo => (
          <button type="button" key={repo.id} disabled={busy} onClick={() => void importRepo(repo)}>
            <GitBranch size={14} aria-hidden="true" />
            <span>{repo.fullName}</span>
            {repo.private && <small>Private</small>}
          </button>
        ))}
        {loading && <p role="status">Loading repositories…</p>}
        {!loading && !listError && repos.length === 0 && <p>No repositories found for this account.</p>}
        {listError && <p role="alert">{listError}</p>}
        {needsConnection ? (
          <button type="button" disabled={busy} onClick={() => void connect()}>Connect GitHub account</button>
        ) : listError ? (
          <button type="button" disabled={busy || loading} onClick={() => { setListError(null); setLoading(true); setAttempt(value => value + 1); }}>Retry</button>
        ) : hasMore && (
          <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Load more repositories</button>
        )}
      </div>
      <form onSubmit={event => {
        event.preventDefault();
        const parsed = parseRepositoryUrl(url);
        if (!parsed) { setError("Enter a GitHub repository URL, such as https://github.com/owner/repo."); return; }
        void importRepo(parsed);
      }}>
        <label htmlFor="repository-url">Or paste a repository URL</label>
        <input id="repository-url" type="url" required maxLength={250} placeholder="https://github.com/username/repo" value={url} onChange={event => setUrl(event.target.value)} disabled={busy} autoComplete="off" />
        <button type="submit" className="ax-repository-import" disabled={busy || !url.trim()}>Import repository</button>
      </form>
      {importing && <p role="status">Importing {importing}…</p>}
      {error && <p role="alert" className="ax-repository-error">{error}</p>}
      <button type="button" className="ax-repository-back" disabled={busy} onClick={onBack}>← Back</button>
    </div>
  );
}
