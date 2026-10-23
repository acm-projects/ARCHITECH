import { parseDocument } from "yaml";

// docker-compose files often name their images and build files with variables that a `.env`
// file next to them fills in (`image: ${POSTGRES_IMAGE}`, `dockerfile: ${AD_DOCKERFILE}`).
// Compose itself substitutes them; so does the import, so it sees what really runs.

// KEY=value lines; # comments; optional quotes; `export KEY=value`.
export function parseDotEnv(text: string | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    env[match[1]!] = value;
  }
  return env;
}

// ${VAR}, ${VAR:-default}, ${VAR-default} and $VAR, as compose does; unknown ones stay as written.
export function interpolate(value: string, env: Readonly<Record<string, string>>): string {
  return value
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?-)([^}]*))?\}/g, (whole, name: string, op: string | undefined, fallback: string | undefined) => {
      const set = Object.hasOwn(env, name);
      if (op === ":-") return set && env[name] !== "" ? env[name]! : (fallback ?? "");
      if (op === "-") return set ? env[name]! : (fallback ?? "");
      return set ? env[name]! : whole;
    })
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name: string) => (Object.hasOwn(env, name) ? env[name]! : whole));
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

// "./a/../b" relative to the repository root -> "b"; undefined if it leaves the repository.
export function normalizePath(path: string, base = ""): string | undefined {
  const out: string[] = [];
  for (const part of [...(base ? base.split("/") : []), ...path.split("/")]) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return undefined;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

// The folders a compose file builds its services from: each build context, and the folder of
// its Dockerfile when that is elsewhere (`context: .` with `dockerfile: src/ad/Dockerfile`).
export function composeBuildFolders(text: string, env: Readonly<Record<string, string>> = {}): string[] {
  let parsed: unknown;
  try {
    const document = parseDocument(text, { merge: true });
    if (document.errors.length > 0) return [];
    parsed = document.toJS({ maxAliasCount: 10_000 });
  } catch {
    return [];
  }
  const services = (parsed as { services?: Record<string, unknown> } | null)?.services;
  if (!services || typeof services !== "object") return [];
  const folders = new Set<string>();
  for (const raw of Object.values(services)) {
    const build = (raw as { build?: unknown } | null)?.build;
    const context = typeof build === "string" ? build : typeof (build as { context?: unknown })?.context === "string" ? (build as { context: string }).context : undefined;
    if (context === undefined || /^[a-z]+:\/\//i.test(context)) continue;
    const folder = normalizePath(interpolate(context, env));
    if (folder === undefined) continue;
    if (folder) folders.add(folder);
    const rawDockerfile = (build as { dockerfile?: unknown })?.dockerfile;
    const dockerfile = typeof rawDockerfile === "string" ? interpolate(rawDockerfile, env) : undefined;
    if (dockerfile && dockerfile.includes("/") && !dockerfile.includes("$")) {
      const file = normalizePath(dockerfile, folder);
      const dir = file?.includes("/") ? file.slice(0, file.lastIndexOf("/")) : undefined;
      if (dir) folders.add(dir);
    }
  }
  return [...folders].filter((folder) => folder.split("/").every((part) => SAFE_SEGMENT.test(part)));
}
