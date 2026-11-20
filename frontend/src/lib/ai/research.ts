import { isMap, parseDocument, type Document } from "yaml";

import { COMPONENT_IMPLEMENTATIONS, defaultImplementationFor, type ComponentImplementationSeed } from "../architecture/componentLibrary.ts";
import { ACTS_AS_LABELS, ACTS_AS_TYPES, isActsAsType, type ActsAsType } from "../architecture/customComponents.ts";
import { TECHNOLOGY_CATALOG } from "../architecture/technologyCatalog.ts";
import { KNOWN_NAMES } from "../github/detectStack.ts";
import { ModelBusyError, retryAfterSeconds } from "./errors.ts";

// Looking up technologies ARCHITECH has no component for (a repository's Snuba, Relay...), so
// an imported design measures them with real numbers instead of a guess from the name. Built
// to fit a free Groq plan:
//
//   1. ARCHITECH's own technology catalog first, with no API call: a technology it already
//      knows (ClickHouse, PgBouncer, Kong...) becomes that component.
//   2. What the rest are, from Wikipedia (free, no key, no limits).
//   3. ONE Groq call for all of them together: each one's role and the most similar technology
//      in the catalog, whose numbers it then uses (marked as estimates).
//   4. Groq's rate limit is waited out (briefly) rather than failing, and the catalog matches
//      are applied even if the Groq call cannot be made.
//
// Everything Groq says is checked: a role must be one ARCHITECH can measure and the similar
// technology must exist and have that role (else the role's standard technology is used).
// Sources are the Wikipedia pages actually read. The results are written into the import's
// compose file for review; live metrics never call this.
//
// Environment (only the Groq key, the same one the AI Architect uses):
//   GROQ_API_KEY                required
//   GROQ_RESEARCH_EXTRACT_MODEL optional: the model for the one call; default GROQ_MODEL, else
//                               openai/gpt-oss-120b
//   GROQ_RESEARCH_SEARCH        optional: "compound" or "browser" to read with Groq's web
//                               search instead of Wikipedia (more calls; paid plans)
//   GROQ_RESEARCH_MODEL         optional: the model for that search

export const DEFAULT_COMPOUND_MODEL = "groq/compound-mini";
export const DEFAULT_BROWSER_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_EXTRACT_MODEL = "openai/gpt-oss-120b";
export const MAX_TECHNOLOGIES_PER_REQUEST = 12;
const MAX_NOTES_PER_TECHNOLOGY = 1_200;
// Longest wait for Groq's rate limit before giving up, and how many times.
const MAX_WAIT_SECONDS = 20;
const MAX_RETRIES = 2;

export type Source = { url: string; title?: string };

export type Finding = {
  technology: string;
  actsAs: ActsAsType;
  summary: string;
  // A catalog technology it IS: the component becomes that technology.
  implementation?: string;
  // Otherwise, the catalog technology whose numbers it uses.
  similarTo?: string;
  capacity?: number;
  latencyMs?: number;
  costPerInstance?: number;
  availability?: number;
  sources: Source[];
};

// A provider error worth showing to the user (it never contains the key).
export class ResearchProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchProviderError";
  }
}

// Reads about a technology, and answers one JSON request.
export type Researcher = {
  notes: (technology: string, hint: string, signal?: AbortSignal) => Promise<string>;
  complete: (system: string, user: string, signal?: AbortSignal) => Promise<string>;
};

export function researchConfig(env: Record<string, string | undefined> = process.env) {
  const search = env.GROQ_RESEARCH_SEARCH?.trim();
  return {
    search: search === "compound" || search === "browser" ? search : ("wikipedia" as "compound" | "browser" | "wikipedia"),
    searchModel: env.GROQ_RESEARCH_MODEL?.trim() || null,
    extractModel: env.GROQ_RESEARCH_EXTRACT_MODEL?.trim() || env.GROQ_MODEL?.trim() || DEFAULT_EXTRACT_MODEL,
  };
}

// Names the configuration, for the cache key.
export function researchModelName(env: Record<string, string | undefined> = process.env): string {
  const config = researchConfig(env);
  return `v2:${config.search}:${config.searchModel ?? "-"}:${config.extractModel}`;
}

const WIKIPEDIA = "https://en.wikipedia.org";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// What Wikipedia says the technology is, with the article's link; empty if nothing matches.
export async function wikipediaNotes(technology: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal, base = WIKIPEDIA): Promise<string> {
  const headers = { "User-Agent": "ARCHITECH/1.0 (system-design tool; https://github.com/acm-projects/ARCHITECH)", Accept: "application/json" };
  // "software" steers away from same-named people, places and films.
  const search = await fetchImpl(`${base}/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(`${technology} software`)}`, { headers, signal });
  if (!search.ok) return "";
  const titles = (((await search.json()) as { query?: { search?: { title?: string }[] } }).query?.search ?? [])
    .map((item) => item.title)
    .filter((title): title is string => typeof title === "string");
  for (const title of titles) {
    const summary = await fetchImpl(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers, signal });
    if (!summary.ok) continue;
    const page = (await summary.json()) as { type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    if (page.type === "disambiguation" || !page.extract) continue;
    const url = page.content_urls?.desktop?.page ?? `${base}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    return `${title} (Wikipedia): ${page.extract}\nSource: ${url}`;
  }
  return "";
}

// The Groq researcher, or null when no Groq key is configured.
export function groqResearcher(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Researcher | null {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  const config = researchConfig(env);
  const baseUrl = (env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  // Only tests point this elsewhere.
  const wikipedia = (env.RESEARCH_WIKIPEDIA_URL?.trim() || WIKIPEDIA).replace(/\/+$/, "");
  const read = (technology: string, signal?: AbortSignal) => wikipediaNotes(technology, fetchImpl, signal, wikipedia).catch(() => "");

  const post = async (body: Record<string, unknown>, signal?: AbortSignal) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (response.status === 429) {
        // The free plan's per-minute limit: wait it out when the wait is short.
        const wait = retryAfterSeconds(response.headers.get("retry-after")) ?? 10;
        if (attempt < MAX_RETRIES && wait <= MAX_WAIT_SECONDS) {
          await sleep(Math.ceil(wait * 1000) + 250);
          continue;
        }
        throw new ModelBusyError(wait, "Groq's rate limit was reached.");
      }
      const json = (await response.json().catch(() => null)) as
        | { choices?: { message?: { content?: string | null; executed_tools?: unknown } }[]; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new ResearchProviderError(`Groq (${String(body.model)}) refused the request (${response.status})${json?.error?.message ? `: ${json.error.message.slice(0, 300)}` : "."}`);
      }
      return json?.choices?.[0]?.message;
    }
  };

  return {
    notes: async (technology, hint, signal) => {
      if (config.search === "wikipedia") return read(technology, signal);
      const model = config.searchModel ?? (config.search === "compound" ? DEFAULT_COMPOUND_MODEL : DEFAULT_BROWSER_MODEL);
      const messages = [
        { role: "system", content: "Describe the technology in three sentences: what it is and what role it plays in a system. End with the URLs you used." },
        { role: "user", content: `${technology}${hint ? ` (${hint})` : ""}` },
      ];
      try {
        const message = await post(
          config.search === "compound"
            ? { model, max_completion_tokens: 400, messages }
            : { model, reasoning_effort: "low", max_completion_tokens: 600, messages, tools: [{ type: "browser_search" }], tool_choice: "required" },
          signal,
        );
        return message?.content ?? "";
      } catch (error) {
        // A search the plan does not include: read Wikipedia instead.
        if (error instanceof ResearchProviderError) return read(technology, signal);
        throw error;
      }
    },
    complete: async (system, user, signal) => {
      const base = {
        model: config.extractModel,
        max_completion_tokens: 2_000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(config.extractModel.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      };
      try {
        return (await post({ ...base, response_format: { type: "json_object" } }, signal))?.content ?? "";
      } catch (error) {
        // Not every model offers JSON mode; the answer is parsed from plain text anyway.
        if (error instanceof ResearchProviderError && /response_format|json/i.test(error.message)) return (await post(base, signal))?.content ?? "";
        throw error;
      }
    },
  };
}

// ---- 1. The catalog ----

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const imageNameOf = (hint: string) => /docker image (\S+)/.exec(hint)?.[1]?.split("@")[0]!.replace(/:[^/]*$/, "").split("/").pop()?.toLowerCase() ?? "";
const MEASURABLE = new Set<string>(ACTS_AS_TYPES);

// The catalog technology this is, by name ("Pgbouncer" = PgBouncer, "ClickHouse") or image.
export function catalogMatch(technology: string, hint = ""): ComponentImplementationSeed | null {
  const key = squash(technology);
  const image = imageNameOf(hint);
  const candidates = COMPONENT_IMPLEMENTATIONS.filter((item) => MEASURABLE.has(item.componentType));
  const byName = candidates.find((item) => key.length >= 3 && (squash(item.name) === key || squash(item.name.replace(/\s*\(.*\)\s*/g, "")) === key || squash(item.id) === key));
  if (byName) return byName;
  if (!image) return null;
  const entry = TECHNOLOGY_CATALOG.find((item) => item.detect?.images?.includes(image) && MEASURABLE.has(item.componentType));
  return entry ? (COMPONENT_IMPLEMENTATIONS.find((item) => item.id === entry.id) ?? null) : null;
}

function fromCatalog(technology: string, implementation: ComponentImplementationSeed): Finding {
  return {
    technology,
    actsAs: implementation.componentType as ActsAsType,
    summary: `${implementation.name} is in ARCHITECH's technology catalog: ${implementation.description}`,
    implementation: implementation.id,
    sources: [],
  };
}

// ---- 2 and 3. Reading, then one call for all ----

const BATCH_SYSTEM = `You classify infrastructure technologies for a system-design tool. Use the notes and your knowledge. Answer with one JSON object and nothing else.`;

// The catalog ids the model may pick as "similar", by role (names only, to keep the prompt short).
const catalogByRole = () =>
  ACTS_AS_TYPES.map(
    (role) =>
      `${role}: ${COMPONENT_IMPLEMENTATIONS.filter((item) => item.componentType === role)
        .map((item) => item.id)
        .join(", ")}`,
  ).join("\n");

const batchPrompt = (items: { technology: string; hint: string; notes: string }[]) =>
  `For each technology, choose the role it plays (one of: ${ACTS_AS_TYPES.join(", ")}) and the most similar technology id from that role's list below (similar workload and scale), and write one sentence about what it is.

Technologies:
${items.map((item, index) => `${index + 1}. ${item.technology}${item.hint ? ` (${item.hint})` : ""}\n${item.notes ? item.notes.slice(0, MAX_NOTES_PER_TECHNOLOGY) : "(no notes found)"}`).join("\n\n")}

Technology ids by role:
${catalogByRole()}

Return: {"results": [{"technology": "<name as given>", "actsAs": "<role>", "similarTo": "<id from that role's list>", "summary": "<one sentence>"}]}`;

const URL_PATTERN = /https?:\/\/[^\s<>"'\]【】)]+/g;

// Checks one result; null when it says nothing usable.
export function checkResult(technology: string, raw: unknown, notes: string): Finding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (!isActsAsType(data.actsAs)) return null;
  const actsAs = data.actsAs;
  const similar =
    COMPONENT_IMPLEMENTATIONS.find((item) => item.id === data.similarTo && item.componentType === actsAs) ?? defaultImplementationFor(actsAs);
  const sources = [...new Set([...notes.matchAll(URL_PATTERN)].map((match) => match[0].replace(/[.,;:]+$/, "")))]
    .slice(0, 3)
    .map((url) => ({ url }));
  return {
    technology,
    actsAs,
    summary: typeof data.summary === "string" ? data.summary.trim().slice(0, 300) : "",
    similarTo: similar.id,
    ...(similar.capacityPerInstance !== null ? { capacity: similar.capacityPerInstance } : {}),
    latencyMs: similar.latencyMs,
    costPerInstance: similar.monthlyCostPerInstance,
    availability: similar.availability,
    sources,
  };
}

export type ResearchOutcome = { technology: string; finding: Finding | null; error?: string };

// Looks up technologies: the catalog first, then Wikipedia and one model call for the rest.
// Catalog matches come back even if the model call fails (its error is on the others).
export async function researchTechnologies(
  researcher: Researcher,
  items: readonly { technology: string; hint: string }[],
  signal?: AbortSignal,
): Promise<{ outcomes: ResearchOutcome[]; busy?: ModelBusyError }> {
  const outcomes = new Map<string, ResearchOutcome>();
  const rest: { technology: string; hint: string; notes: string }[] = [];
  for (const item of items) {
    const known = catalogMatch(item.technology, item.hint);
    if (known) outcomes.set(item.technology, { technology: item.technology, finding: fromCatalog(item.technology, known) });
    else rest.push({ ...item, notes: "" });
  }
  if (rest.length > 0) {
    // Reading is free (Wikipedia) and done in parallel.
    await Promise.all(
      rest.map(async (item) => {
        item.notes = await researcher.notes(item.technology, item.hint, signal).catch(() => "");
      }),
    );
    try {
      const answer = await researcher.complete(BATCH_SYSTEM, batchPrompt(rest), signal);
      let results: unknown[] = [];
      try {
        const parsed = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1)) as { results?: unknown };
        results = Array.isArray(parsed.results) ? parsed.results : [];
      } catch {
        results = [];
      }
      for (const [index, item] of rest.entries()) {
        const raw =
          results.find((result) => squash(String((result as { technology?: unknown })?.technology ?? "")) === squash(item.technology)) ?? results[index];
        const finding = checkResult(item.technology, raw, item.notes);
        outcomes.set(item.technology, { technology: item.technology, finding, ...(finding ? {} : { error: "Nothing usable came back." }) });
      }
    } catch (error) {
      if (error instanceof ModelBusyError) {
        for (const item of rest) outcomes.set(item.technology, { technology: item.technology, finding: null, error: `Groq is busy (its free-plan limit); try again in ${error.retryAfterSeconds} seconds.` });
        return { outcomes: items.map((item) => outcomes.get(item.technology)!), busy: error };
      }
      const message = error instanceof ResearchProviderError ? error.message : "The lookup failed.";
      for (const item of rest) outcomes.set(item.technology, { technology: item.technology, finding: null, error: message });
    }
  }
  return { outcomes: items.map((item) => outcomes.get(item.technology)!) };
}

// ---- The compose file ----

export type Researchable = { technology: string; hint: string };

const SETTING_KEYS = ["capacity", "latencyMs", "costPerInstance", "availability"] as const;

function parseCompose(yaml: string): Document | null {
  const document = parseDocument(yaml, { merge: true });
  return document.errors.length > 0 ? null : document;
}

// x-architech blocks of custom components in an ARCHITECH compose file: [path, block].
function customBlocks(document: Document): [readonly (string | number)[], Record<string, unknown>][] {
  const blocks: [readonly (string | number)[], Record<string, unknown>][] = [];
  const services = document.get("services");
  if (isMap(services)) {
    for (const item of services.items) {
      const path = ["services", String(item.key), "x-architech"];
      const block = document.getIn(path);
      if (isMap(block) && block.get("type") === "custom") blocks.push([path, block.toJSON() as Record<string, unknown>]);
    }
  }
  const components = document.getIn(["x-architech", "components"]);
  if (isMap(components)) {
    for (const item of components.items) {
      const path = ["x-architech", "components", String(item.key)];
      const block = document.getIn(path);
      if (isMap(block) && block.get("type") === "custom") blocks.push([path, block.toJSON() as Record<string, unknown>]);
    }
  }
  return blocks;
}

const KNOWN_PRODUCTS = new Set(Object.values(KNOWN_NAMES).map(squash));

// Whether a custom component is a product worth looking up, rather than the project's own code
// (PetClinic's "Config Server" image, a ".NET worker" built from a folder, Sentry's own web app).
function isProduct(block: Record<string, unknown>, settings: Record<string, unknown>, technology: string): boolean {
  const key = squash(technology);
  if (KNOWN_PRODUCTS.has(key)) return true;
  // Built from the repository, or named after its language or group of workers.
  if (typeof settings.build === "string" || / worker$/i.test(technology)) return false;
  const image = typeof settings.image === "string" ? settings.image : "";
  // A published image given by a variable ($SNUBA_IMAGE), or named after the product (edoburu/pgbouncer).
  if (image.startsWith("$")) return true;
  const imageName = image.split("@")[0]!.replace(/:[^/]*$/, "").split("/").pop() ?? "";
  if (imageName && squash(imageName) === key) return true;
  // Named after something other than the service itself (e.g. "Tracing Server" runs Zipkin).
  return typeof block.label === "string" && squash(block.label) !== key;
}

// The distinct custom technologies in an ARCHITECH compose file that are worth looking up, with
// the image as a hint. The project's own services are skipped.
export function researchableTechnologies(yaml: string): Researchable[] {
  const document = parseCompose(yaml);
  if (!document) return [];
  const found = new Map<string, Researchable>();
  for (const [, block] of customBlocks(document)) {
    const settings = (block.settings ?? {}) as Record<string, unknown>;
    const technology = typeof settings.technology === "string" ? settings.technology.trim() : "";
    if (!technology || found.has(technology.toLowerCase()) || !isProduct(block, settings, technology)) continue;
    const hint = typeof settings.image === "string" ? `docker image ${settings.image}` : "";
    found.set(technology.toLowerCase(), { technology, hint });
  }
  return [...found.values()];
}

const percent = (value: number) => `${Math.round(value * 100_000) / 1000}%`;

const nameOf = (id: string | undefined) => COMPONENT_IMPLEMENTATIONS.find((item) => item.id === id)?.name ?? id ?? "";

// Writes findings into the file, keeping everything else (including the user's comments and
// edits). A technology the catalog knows becomes that component (its image or build folder is
// kept); any other one gets its role and the similar technology's numbers in its settings, with
// a comment saying where they came from. Returns null if the file is not valid YAML.
export function applyFindings(yaml: string, findings: readonly Finding[]): string | null {
  const document = parseCompose(yaml);
  if (!document) return null;
  const byName = new Map(findings.map((finding) => [finding.technology.toLowerCase(), finding]));
  for (const [path, block] of customBlocks(document)) {
    const settings = (block.settings ?? {}) as Record<string, unknown>;
    const finding = typeof settings.technology === "string" ? byName.get(settings.technology.trim().toLowerCase()) : undefined;
    if (!finding) continue;
    const node = document.getIn(path, true) as { commentBefore?: string | null } | undefined;

    if (finding.implementation) {
      const implementation = COMPONENT_IMPLEMENTATIONS.find((item) => item.id === finding.implementation)!;
      document.setIn([...path, "type"], implementation.componentType);
      document.setIn([...path, "implementation"], implementation.id);
      // Only where it runs from and how many instances carry over.
      for (const key of Object.keys(settings)) {
        if (!["image", "build", "replicas"].includes(key)) document.deleteIn([...path, "settings", key]);
      }
      if (Object.keys(settings).every((key) => !["image", "build", "replicas"].includes(key))) document.deleteIn([...path, "settings"]);
      if (node) node.commentBefore = ` Recognized: ${implementation.name}, a ${ACTS_AS_LABELS[finding.actsAs].toLowerCase()} in ARCHITECH's technology catalog.`;
      continue;
    }

    document.setIn([...path, "settings", "actsAs"], finding.actsAs);
    for (const key of SETTING_KEYS) {
      if (finding[key] !== undefined) document.setIn([...path, "settings", key], finding[key]);
      else document.deleteIn([...path, "settings", key]);
    }
    if (node) {
      const numbers = [
        finding.capacity !== undefined ? `${finding.capacity} req/s per instance` : null,
        finding.latencyMs !== undefined ? `${finding.latencyMs} ms` : null,
        finding.costPerInstance !== undefined ? `$${finding.costPerInstance}/month per instance` : null,
        finding.availability !== undefined ? `${percent(finding.availability)} uptime` : null,
      ].filter(Boolean);
      node.commentBefore = [
        ` Looked up: ${finding.technology} acts like a ${ACTS_AS_LABELS[finding.actsAs].toLowerCase()}.${finding.similarTo ? ` Numbers are estimates from a similar technology, ${nameOf(finding.similarTo)}: ${numbers.join(", ")}.` : ""}`,
        ...(finding.summary ? [` ${finding.summary}`] : []),
        ...finding.sources.map((source) => ` Source: ${source.url}`),
      ].join("\n");
    }
  }
  return document.toString({ lineWidth: 0 });
}

export type { ActsAsType };
