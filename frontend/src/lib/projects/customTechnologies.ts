// Custom technologies: technologies an imported repository uses that ARCHITECH does not model
// (an unknown docker-compose service, an app written in .NET, Rust, Ruby...). They are saved
// with the project (graph.customTechnologies) and listed in its sidebar under "From your repo",
// so the user can drag that exact technology onto the canvas as a Custom component. They carry
// no numbers: Run Design passes traffic through them unmeasured.

export type CustomTechnology = {
  // Stable within the project, e.g. "traefik".
  id: string;
  // What the sidebar and the node show, e.g. "Traefik".
  name: string;
  // Why it was found, e.g. 'docker-compose.yml runs the "traefik" image'.
  evidence: string[];
};

export const MAX_CUSTOM_TECHNOLOGIES = 30;
export const MAX_CUSTOM_NAME_LENGTH = 60;
export const MAX_CUSTOM_EVIDENCE = 5;
export const MAX_CUSTOM_EVIDENCE_LENGTH = 200;
export const CUSTOM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Strict check for data sent to the server: the first problem, or null when valid.
export function customTechnologiesProblem(raw: unknown, path: string): string | null {
  if (!Array.isArray(raw)) return `${path} must be an array.`;
  if (raw.length > MAX_CUSTOM_TECHNOLOGIES) return `${path} can have at most ${MAX_CUSTOM_TECHNOLOGIES} entries.`;
  const ids = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const at = `${path}[${index}]`;
    if (!isRecord(item)) return `${at} must be an object.`;
    const extra = Object.keys(item).find((key) => !["id", "name", "evidence"].includes(key));
    if (extra) return `${at} has an unknown key "${extra}".`;
    if (typeof item.id !== "string" || !CUSTOM_ID_PATTERN.test(item.id)) return `${at}.id must be lowercase letters, digits or "-".`;
    if (ids.has(item.id)) return `${at}.id "${item.id}" is repeated.`;
    ids.add(item.id);
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > MAX_CUSTOM_NAME_LENGTH) {
      return `${at}.name must be 1-${MAX_CUSTOM_NAME_LENGTH} characters.`;
    }
    if (
      !Array.isArray(item.evidence) ||
      item.evidence.length > MAX_CUSTOM_EVIDENCE ||
      item.evidence.some((line) => typeof line !== "string" || line.length > MAX_CUSTOM_EVIDENCE_LENGTH)
    ) {
      return `${at}.evidence must be at most ${MAX_CUSTOM_EVIDENCE} lines of at most ${MAX_CUSTOM_EVIDENCE_LENGTH} characters.`;
    }
  }
  return null;
}

// Lenient reading for what the browser stored: bad entries are dropped, never fatal.
export function sanitizeCustomTechnologies(raw: unknown): CustomTechnology[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const clean: CustomTechnology[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || !CUSTOM_ID_PATTERN.test(item.id) || seen.has(item.id)) continue;
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > MAX_CUSTOM_NAME_LENGTH) continue;
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.filter((line): line is string => typeof line === "string" && line.length <= MAX_CUSTOM_EVIDENCE_LENGTH).slice(0, MAX_CUSTOM_EVIDENCE)
      : [];
    seen.add(item.id);
    clean.push({ id: item.id, name: item.name, evidence });
    if (clean.length === MAX_CUSTOM_TECHNOLOGIES) break;
  }
  return clean.length > 0 ? clean : undefined;
}
