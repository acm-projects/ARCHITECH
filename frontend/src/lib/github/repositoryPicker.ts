export type Repository = { id: number; fullName: string; owner: string; repo: string; private: boolean };

export function parseRepositoryUrl(value: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.replace(/\/$/, "").split("/");
    if (parts.length !== 3) return null;
    const owner = parts[1];
    const repo = parts[2].replace(/\.git$/, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === "." || repo === "..") return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export function readRepositories(raw: unknown): Repository[] {
  if (!Array.isArray(raw)) throw new Error("GitHub returned an invalid repository list.");
  return raw.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("GitHub returned an invalid repository.");
    const { id, full_name: fullName, private: isPrivate } = item as Record<string, unknown>;
    const parsed = typeof fullName === "string" ? parseRepositoryUrl(`https://github.com/${fullName}`) : null;
    if (!Number.isSafeInteger(id) || typeof id !== "number" || id < 1 || !parsed || typeof isPrivate !== "boolean") throw new Error("GitHub returned an invalid repository.");
    return { id, fullName: fullName as string, ...parsed, private: isPrivate };
  });
}
