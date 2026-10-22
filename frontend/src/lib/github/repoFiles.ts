import { githubApiUrl } from "./endpoints.ts";

// Reading a GitHub repository's stack files through GitHub's GraphQL API.
//
// Two requests at most:
//   1. the repository, its top-level file list, and the stack files at the top level;
//   2. the same stack files inside up to MAX_FOLDERS top-level folders (monorepos such as
//      frontend/ + backend/), only when there are folders worth looking in.
// The GraphQL call itself is passed in, so everything here can be tested with fake data.

// Files that reveal what a project is built with.
export const STACK_FILES = [
  "package.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "prisma/schema.prisma",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  // Stacks the app does not model, so they can be offered as custom technologies.
  "Dockerfile",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "mix.exs",
  "CMakeLists.txt",
] as const;

export const MAX_FOLDERS = 12;
// A file this large is not read (lock files and generated code are irrelevant anyway).
export const MAX_FILE_BYTES = 200_000;

// Folders that never hold an app of their own.
const SKIPPED_FOLDERS = new Set([
  "node_modules", "docs", "doc", "test", "tests", "__tests__", "examples", "example",
  "scripts", "public", "assets", "static", "dist", "build", "out", "coverage", "vendor",
]);
const SAFE_NAME = /^[A-Za-z0-9._-]{1,100}$/;

// Runs one GraphQL query against GitHub and returns its `data`, or throws GitHubError.
export type GitHubGraphql = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

// not-found: no such repository (or no access) · nothing-detected: no recognizable stack
export type GitHubErrorKind = "not-found" | "nothing-detected" | "unauthorized" | "rate-limited" | "failed";
export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  constructor(kind: GitHubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type RepoFiles = {
  nameWithOwner: string;
  description: string | null;
  // Path -> text, for every stack file that exists and is readable text.
  files: Map<string, string>;
  // Every top-level folder (not only the ones read), to match compose services to their code.
  folders: string[];
};

type Blob = { text?: string | null; byteSize?: number; isBinary?: boolean | null } | null;

const blobFields = "... on Blob { text byteSize isBinary }";
const literal = (value: string) => JSON.stringify(value);

function fileFields(paths: readonly string[]): string {
  return paths.map((path, index) => `f${index}: object(expression: ${literal(`HEAD:${path}`)}) { ${blobFields} }`).join("\n    ");
}

export function rootQuery(): string {
  return `query RepoRoot($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    description
    root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
    ${fileFields(STACK_FILES)}
  }
}`;
}

export function folderPaths(folders: readonly string[]): string[] {
  return folders.flatMap((folder) => STACK_FILES.map((file) => `${folder}/${file}`));
}

// Other compose files next to the main one (docker-compose.postgres.yml, compose.prod.yaml...):
// some projects keep their full setup there. At most 6.
export const MAX_COMPOSE_VARIANTS = 6;
const COMPOSE_VARIANT = /^(docker-)?compose[.-][A-Za-z0-9_.-]+\.ya?ml$/;

export function composeVariants(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is { name: string; type: string } => typeof entry?.name === "string" && entry?.type === "blob")
    .map((entry) => entry.name)
    .filter((name) => COMPOSE_VARIANT.test(name) && SAFE_NAME.test(name) && !(STACK_FILES as readonly string[]).includes(name))
    .sort()
    .slice(0, MAX_COMPOSE_VARIANTS);
}

// The folders' stack files, then any root compose variants (after, so the aliases of the
// folder files do not depend on them).
export function foldersQuery(folders: readonly string[], extra: readonly string[] = []): string {
  return `query RepoFolders($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ${fileFields([...folderPaths(folders), ...extra])}
  }
}`;
}

// Top-level folders worth reading, in GitHub's order, at most MAX_FOLDERS.
export function topLevelFolders(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (entry): entry is { name: string; type: string } =>
        typeof entry?.name === "string" && entry?.type === "tree" && SAFE_NAME.test(entry.name),
    )
    .map((entry) => entry.name);
}

// The folders to read stack files from. Folders the compose file builds services from, or
// that are named after its services, come first, so a repository with many folders still
// has each service's own files read.
export function candidateFolders(entries: unknown, composeText = ""): string[] {
  const folders = topLevelFolders(entries).filter((name) => !name.startsWith(".") && !SKIPPED_FOLDERS.has(name.toLowerCase()));
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const named = new Set(
    [...composeText.matchAll(/^ {2}([A-Za-z0-9._-]+):\s*$/gm)].map((match) => squash(match[1]!)).filter((name) => name.length >= 4),
  );
  const built = new Set([...composeText.matchAll(/(?:context:|build:)\s*["']?\.\/([A-Za-z0-9._-]+)/g)].map((match) => match[1]!));
  const preferred = (name: string) =>
    built.has(name) || [...named].some((service) => squash(name) === service || squash(name).endsWith(service));
  return [...folders.filter(preferred), ...folders.filter((name) => !preferred(name))].slice(0, MAX_FOLDERS);
}

function collect(repository: Record<string, unknown>, paths: readonly string[], into: Map<string, string>) {
  paths.forEach((path, index) => {
    const blob = repository[`f${index}`] as Blob;
    if (!blob || blob.isBinary || typeof blob.text !== "string") return;
    if ((blob.byteSize ?? blob.text.length) > MAX_FILE_BYTES) return;
    into.set(path, blob.text);
  });
}

export async function readRepoFiles(graphql: GitHubGraphql, owner: string, name: string): Promise<RepoFiles> {
  const first = (await graphql(rootQuery(), { owner, name })) as { repository?: Record<string, unknown> | null } | null;
  const repository = first?.repository;
  if (!repository) throw new GitHubError("not-found", `Repository ${owner}/${name} was not found, or your GitHub account cannot see it.`);

  const files = new Map<string, string>();
  collect(repository, STACK_FILES, files);

  const entries = (repository.root as { entries?: unknown } | null)?.entries;
  const composeText = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].map((path) => files.get(path) ?? "").join("\n");
  const folders = candidateFolders(entries, composeText);
  const variants = composeVariants(entries);
  if (folders.length > 0 || variants.length > 0) {
    const second = (await graphql(foldersQuery(folders, variants), { owner, name })) as { repository?: Record<string, unknown> | null } | null;
    if (second?.repository) collect(second.repository, [...folderPaths(folders), ...variants], files);
  }

  return {
    nameWithOwner: typeof repository.nameWithOwner === "string" ? repository.nameWithOwner : `${owner}/${name}`,
    description: typeof repository.description === "string" ? repository.description : null,
    files,
    folders: topLevelFolders(entries),
  };
}

// The real GraphQL call, with the user's GitHub token. Server-only.
export function githubGraphql(token: string, fetchImpl: typeof fetch = fetch): GitHubGraphql {
  return async (query, variables) => {
    const response = await fetchImpl(`${githubApiUrl()}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ARCHITECH",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (response.status === 401) throw new GitHubError("unauthorized", "GitHub authorization expired. Reconnect GitHub.");
    if (response.status === 403 || response.status === 429) {
      throw new GitHubError("rate-limited", "GitHub is limiting requests right now. Try again in a minute.");
    }
    let body: { data?: unknown; errors?: { type?: string; message?: string }[] };
    try {
      body = await response.json();
    } catch {
      throw new GitHubError("failed", "GitHub returned an invalid response.");
    }
    if (!response.ok) throw new GitHubError("failed", "GitHub could not read the repository.");
    if (body.errors?.some((error) => error.type === "NOT_FOUND")) {
      throw new GitHubError("not-found", "Repository not found, or your GitHub account cannot see it.");
    }
    if (body.errors?.some((error) => error.type === "RATE_LIMITED")) {
      throw new GitHubError("rate-limited", "GitHub is limiting requests right now. Try again in a minute.");
    }
    if (body.errors && body.errors.length > 0 && !body.data) {
      throw new GitHubError("failed", "GitHub could not read the repository.");
    }
    return body.data;
  };
}
