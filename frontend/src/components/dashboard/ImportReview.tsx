"use client";

import { useMemo, useState } from "react";

import { researchableTechnologies } from "../../lib/ai/research";
import { implementationById } from "../../lib/architecture/componentLibrary";
import { designFromCompose } from "../../lib/architecture/export/fromCompose";
import { MAX_TITLE_LENGTH } from "../projects/projectStore";

// The review step of a GitHub import: the repository as ARCHITECH's docker-compose file
// (services with their x-architech type, technology, settings and connections), editable before
// the design is created. Edits are checked as you type with the same reader the server uses.
// Unknown technologies can be looked up on the web, which fills in what each acts like and
// sourced estimates of its numbers.

type ResearchResult = { technology: string; finding: { actsAs: string; implementation?: string; similarTo?: string } | null; error?: string };

const technologyName = (id: string | undefined) => (id ? (implementationById(id)?.name ?? id) : "");

function describeResult(result: ResearchResult): string {
  const finding = result.finding;
  if (!finding) return `${result.technology}: ${result.error ?? "nothing found"}`;
  if (finding.implementation) return `${result.technology}: recognized as ${technologyName(finding.implementation)}.`;
  return `${result.technology}: acts like ${finding.actsAs}${finding.similarTo ? `, with numbers like ${technologyName(finding.similarTo)}` : ""}.`;
}

export default function ImportReview({
  initialTitle,
  initialYaml,
  busy,
  onBusyChange,
  onCreate,
  onBack,
}: {
  initialTitle: string;
  initialYaml: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  // Creates the project from the reviewed file; resolves with an error message, or null.
  onCreate: (input: { title: string; yaml: string }) => Promise<string | null>;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [yaml, setYaml] = useState(initialYaml);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [research, setResearch] = useState<ResearchResult[] | null>(null);

  const read = useMemo(() => designFromCompose(yaml), [yaml]);
  const unknown = useMemo(() => researchableTechnologies(yaml), [yaml]);

  const lookUp = async () => {
    onBusyChange(true);
    setError(null);
    setStatus(`Looking up ${unknown.length} ${unknown.length === 1 ? "technology" : "technologies"}…`);
    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The lookup failed.");
      if (typeof body?.yaml === "string") setYaml(body.yaml);
      setResearch(Array.isArray(body?.findings) ? (body.findings as ResearchResult[]) : []);
      setStatus(
        typeof body?.stoppedEarly === "string"
          ? `Partly done: ${body.stoppedEarly} What was found is already in the file.`
          : "Done: the file now uses what was found (see the comments above each one). Create the design when it looks right.",
      );
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : "The lookup failed.");
    } finally {
      onBusyChange(false);
    }
  };

  const create = async () => {
    if (!read.ok) return;
    onBusyChange(true);
    setError(null);
    setStatus("Creating the design…");
    const problem = await onCreate({ title: title.trim() || initialTitle, yaml });
    onBusyChange(false);
    setStatus(null);
    if (problem) setError(problem);
  };

  return (
    <div className="ax-repository-picker ax-import-review" aria-busy={busy}>
      <p>
        This is your repository as a docker-compose file. Each service&apos;s <code>x-architech</code> says what ARCHITECH measures it as: change a
        type, an <code>actsAs</code> role, a setting or a connection, then create the design.
      </p>
      <label htmlFor="import-title">Project name</label>
      <input id="import-title" value={title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
      <label htmlFor="import-yaml">docker-compose.yml</label>
      <textarea
        id="import-yaml"
        className="ax-import-yaml"
        value={yaml}
        onChange={(event) => setYaml(event.target.value)}
        spellCheck={false}
        disabled={busy}
        rows={16}
      />
      <p role="status" className={read.ok ? undefined : "ax-repository-error"}>
        {read.ok
          ? `${read.graph.nodes.length} components, ${read.graph.edges.length} connections.`
          : read.error}
      </p>
      {read.ok && read.warnings.length > 0 && (
        <ul className="ax-import-notes">
          {read.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <div className="ax-import-research">
          <p>
            {unknown.length} {unknown.length === 1 ? "technology isn't" : "technologies aren't"} modeled by ARCHITECH ({unknown.map((item) => item.technology).join(", ")}).
            Their roles and numbers are guesses until looked up.
          </p>
          <button type="button" disabled={busy || !read.ok} onClick={() => void lookUp()}>
            Look them up
          </button>
        </div>
      )}
      {research && research.length > 0 && (
        <ul className="ax-import-notes">
          {research.map((result) => (
            <li key={result.technology}>{describeResult(result)}</li>
          ))}
        </ul>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="ax-repository-error">{error}</p>}
      <button type="button" className="ax-repository-import" disabled={busy || !read.ok} onClick={() => void create()}>
        Create design
      </button>
      <button type="button" className="ax-repository-back" disabled={busy} onClick={onBack}>← Back</button>
    </div>
  );
}
