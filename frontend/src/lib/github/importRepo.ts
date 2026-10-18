import { resolveImplementation } from "../architecture/componentLibrary.ts";
import { MAX_TITLE_LENGTH } from "../../components/projects/projectStore.ts";
import { validateGraph, type GraphDocument } from "../projects/projectPayload.ts";
import { buildDesign } from "./buildDesign.ts";
import { detectStack, detectUnmodeled } from "./detectStack.ts";
import type { CustomTechnology } from "../projects/customTechnologies.ts";
import { GitHubError, readRepoFiles, type GitHubGraphql } from "./repoFiles.ts";

// Importing a GitHub repository as a design: read its stack files (GraphQL), detect the
// components, build and validate the design. Saving it is the route's job.

export const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export type ImportRequest = { owner: string; repo: string };

export function validateImportRequest(raw: unknown): { ok: true; value: ImportRequest } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "The request body must be a JSON object." };
  const { owner, repo, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false, error: `Unknown field "${Object.keys(rest)[0]}".` };
  if (typeof owner !== "string" || !OWNER_PATTERN.test(owner)) return { ok: false, error: "owner must be a GitHub user or organization name." };
  if (typeof repo !== "string" || !REPO_PATTERN.test(repo) || repo === "." || repo === "..") {
    return { ok: false, error: "repo must be a GitHub repository name." };
  }
  return { ok: true, value: { owner, repo } };
}

export type DetectedSummary = { nodeId: string; label: string; type: string; technology: string; evidence: string[] };

export type ImportResult = {
  title: string;
  graph: GraphDocument;
  detected: DetectedSummary[];
  // Technologies found that the app does not model; saved with the project for its sidebar.
  customTechnologies: CustomTechnology[];
  scannedFiles: string[];
};

export async function importRepository(graphql: GitHubGraphql, request: ImportRequest): Promise<ImportResult> {
  const repo = await readRepoFiles(graphql, request.owner, request.repo);
  const detected = detectStack(repo.files);
  const customTechnologies = detectUnmodeled(repo.files, { owner: request.owner, name: request.repo });
  if (detected.length === 0 && customTechnologies.length === 0) {
    throw new GitHubError(
      "nothing-detected",
      repo.files.size === 0
        ? "No stack files (package.json, docker-compose, requirements.txt, go.mod, pom.xml...) were found in this repository."
        : "No recognizable components were found in this repository's stack files.",
    );
  }
  const design = {
    ...buildDesign(detected),
    ...(customTechnologies.length > 0 ? { customTechnologies } : {}),
  };
  const checked = validateGraph(JSON.parse(JSON.stringify(design)));
  if (!checked.ok) throw new GitHubError("failed", `The design built from the repository is invalid: ${checked.error}`);

  const nodes = checked.value.nodes.slice(1); // after the client added by buildDesign
  return {
    title: repo.nameWithOwner.slice(0, MAX_TITLE_LENGTH),
    graph: checked.value,
    detected: detected.map((component, index) => ({
      nodeId: nodes[index].id,
      label: component.label,
      type: component.type,
      technology: resolveImplementation(component.type, component.implementation).name,
      evidence: component.evidence,
    })),
    customTechnologies,
    scannedFiles: [...repo.files.keys()].sort(),
  };
}

export { GitHubError };
