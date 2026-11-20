import { parseDocument } from "yaml";

import { classify, composeDesign, readComposeServices } from "../../github/composeDesign.ts";
import { slug } from "../../github/detectStack.ts";
import { sanitizeCustomTechnologies, type CustomTechnology } from "../../projects/customTechnologies.ts";
import { GRAPH_SCHEMA_VERSION, type GraphDocument, validateGraph } from "../../projects/projectPayload.ts";
import { COLUMN_WIDTH, ROW_HEIGHT } from "../../github/buildDesign.ts";
import type { ArchitectureNodeType, NodeProperties } from "../types.ts";
import { ARCHITECH_FORMAT_VERSION } from "./dockerCompose.ts";

// Reads a design back from a docker-compose file: the reverse of dockerCompose.ts.
//
//   - A file ARCHITECH wrote (top-level `x-architech`) is rebuilt exactly: each service's and
//     component's id, type, label, technology, settings and position, and every connection.
//     Services added by hand without `x-architech` are recognized from their image and
//     connected by their depends_on.
//   - Any other compose file is read the way a repository import reads it (composeDesign.ts).
//
// The result is checked with the project graph validator, so whatever the file says, only a
// valid design comes out.

export const MAX_COMPOSE_BYTES = 300_000;

export type ComposeRead =
  | { ok: true; title?: string; graph: GraphDocument; customTechnologies: CustomTechnology[]; warnings: string[] }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Spec = {
  id: string;
  type: string;
  label?: string;
  implementation?: string;
  position?: { x: number; y: number };
  properties?: NodeProperties;
};

// One x-architech component entry, or a message saying what is wrong with it.
function readSpec(raw: unknown, id: string, where: string): Spec | string {
  if (!isRecord(raw)) return `${where} must be a mapping.`;
  if (typeof raw.type !== "string") return `${where} needs a type (e.g. server, database, custom).`;
  const spec: Spec = { id, type: raw.type };
  if (raw.label !== undefined) {
    if (typeof raw.label !== "string") return `${where}.label must be text.`;
    spec.label = raw.label;
  }
  if (raw.implementation !== undefined) {
    if (typeof raw.implementation !== "string") return `${where}.implementation must be text.`;
    spec.implementation = raw.implementation;
  }
  if (raw.position !== undefined) {
    const [x, y] = Array.isArray(raw.position) ? raw.position : [];
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return `${where}.position must be [x, y].`;
    spec.position = { x, y };
  }
  if (raw.settings !== undefined) {
    if (!isRecord(raw.settings)) return `${where}.settings must be a mapping.`;
    const properties: NodeProperties = {};
    for (const [key, item] of Object.entries(raw.settings)) {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") return `${where}.settings.${key} must be text, a number or true/false.`;
      properties[key] = item;
    }
    if (Object.keys(properties).length > 0) spec.properties = properties;
  }
  return spec;
}

function finish(title: string | undefined, graph: GraphDocument, warnings: string[]): ComposeRead {
  const checked = validateGraph(JSON.parse(JSON.stringify(graph)));
  if (!checked.ok) return { ok: false, error: `The design in this file is not valid: ${checked.error}` };
  return {
    ok: true,
    ...(title ? { title } : {}),
    graph: checked.value,
    customTechnologies: checked.value.customTechnologies ?? [],
    warnings,
  };
}

export function designFromCompose(text: string): ComposeRead {
  if (text.length > MAX_COMPOSE_BYTES) return { ok: false, error: `The file is larger than ${MAX_COMPOSE_BYTES / 1000} KB.` };
  let parsed: unknown;
  try {
    const document = parseDocument(text, { merge: true });
    if (document.errors.length > 0) return { ok: false, error: `This is not valid YAML: ${document.errors[0]!.message.split("\n")[0]}` };
    parsed = document.toJS({ maxAliasCount: 10_000 });
  } catch (error) {
    return { ok: false, error: `This is not valid YAML: ${error instanceof Error ? error.message.split("\n")[0] : "unreadable"}` };
  }
  if (!isRecord(parsed)) return { ok: false, error: "The file must be a docker-compose mapping with services." };
  const files = new Map([["docker-compose.yml", text]]);
  const meta = parsed["x-architech"];

  // ---- Any compose file: read it like a repository's ----
  if (meta === undefined) {
    const design = composeDesign(files, [], { requireOwnCode: false });
    if (!design) return { ok: false, error: "No services were found in this file." };
    return finish(undefined, { ...design.graph, ...(design.customTechnologies.length > 0 ? { customTechnologies: design.customTechnologies } : {}) }, []);
  }

  // ---- A file ARCHITECH wrote ----
  if (!isRecord(meta)) return { ok: false, error: "x-architech must be a mapping." };
  if (meta.version !== ARCHITECH_FORMAT_VERSION) return { ok: false, error: `x-architech version ${String(meta.version)} is not supported (expected ${ARCHITECH_FORMAT_VERSION}).` };
  const warnings: string[] = [];
  const specs: Spec[] = [];
  const ids = new Set<string>();
  const add = (spec: Spec | string): string | null => {
    if (typeof spec === "string") return spec;
    if (ids.has(spec.id)) return `The id "${spec.id}" is used twice.`;
    ids.add(spec.id);
    specs.push(spec);
    return null;
  };

  if (meta.components !== undefined) {
    if (!isRecord(meta.components)) return { ok: false, error: "x-architech.components must be a mapping of id to component." };
    for (const [id, raw] of Object.entries(meta.components)) {
      const problem = add(readSpec(raw, id, `x-architech.components.${id}`));
      if (problem) return { ok: false, error: problem };
    }
  }

  // Services: their x-architech, or recognized from the image when added by hand.
  const services = isRecord(parsed.services) ? parsed.services : {};
  const serviceIds = new Map<string, string>();
  const handAdded = readComposeServices(files).filter((service) => !isRecord((services[service.name] as Record<string, unknown> | undefined)?.["x-architech"]));
  for (const [name, raw] of Object.entries(services)) {
    if (!isRecord(raw) || !isRecord(raw["x-architech"])) continue;
    const own = raw["x-architech"];
    const id = typeof own.id === "string" ? own.id : name;
    const problem = add(readSpec(own, id, `services.${name}.x-architech`));
    if (problem) return { ok: false, error: problem };
    serviceIds.set(name, id);
  }
  for (const service of handAdded) {
    const item = classify(service, new Map(), []);
    let id = slug(service.name);
    for (let n = 2; ids.has(id); n++) id = `${slug(service.name)}-${n}`;
    const spec: Spec = {
      id,
      type: item.type,
      label: item.label,
      ...(item.implementation ? { implementation: item.implementation } : {}),
      ...(item.properties ? { properties: item.properties } : {}),
    };
    add(spec);
    serviceIds.set(service.name, id);
    warnings.push(`Service "${service.name}" has no x-architech, so it was recognized as ${item.type === "custom" ? `a custom component (${String(item.properties?.technology)})` : `a ${item.type}`}.`);
  }

  // Connections: the list, plus depends_on for services added by hand.
  const edges: { source: string; target: string }[] = [];
  const connect = (source: string, target: string) => {
    if (source !== target && !edges.some((edge) => edge.source === source && edge.target === target)) edges.push({ source, target });
  };
  if (meta.connections !== undefined) {
    if (!Array.isArray(meta.connections)) return { ok: false, error: 'x-architech.connections must be a list of "source -> target".' };
    for (const raw of meta.connections) {
      const parts = typeof raw === "string" ? raw.split("->").map((part) => part.trim()) : [];
      if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: `Connection ${JSON.stringify(raw)} must look like "source -> target".` };
      const [source, target] = parts as [string, string];
      const missing = [source, target].find((id) => !ids.has(id));
      if (missing) {
        warnings.push(`Connection "${source} -> ${target}" was skipped: there is no component "${missing}".`);
        continue;
      }
      connect(source, target);
    }
  }
  const typeOf = (id: string) => {
    const spec = specs.find((candidate) => candidate.id === id);
    return (spec?.type === "custom" && typeof spec.properties?.actsAs === "string" ? spec.properties.actsAs : spec?.type) as ArchitectureNodeType | undefined;
  };
  for (const service of handAdded) {
    const from = serviceIds.get(service.name)!;
    for (const name of service.dependsOn) {
      const to = serviceIds.get(name);
      if (!to) continue;
      if (typeOf(to) === "queue" && typeOf(from) === "worker") connect(to, from);
      else connect(from, to);
    }
  }

  // Positions: as written; anything without one goes in a row underneath.
  const placedYs = specs.filter((spec) => spec.position).map((spec) => spec.position!.y);
  const bottom = (placedYs.length > 0 ? Math.max(...placedYs) : -ROW_HEIGHT) + ROW_HEIGHT * 1.5;
  let free = 0;

  let technologies: CustomTechnology[] = [];
  if (meta.technologies !== undefined) {
    technologies = sanitizeCustomTechnologies(meta.technologies) ?? [];
    if (!Array.isArray(meta.technologies) || technologies.length < meta.technologies.length) warnings.push("Some x-architech.technologies entries were invalid and were skipped.");
  }

  const graph: GraphDocument = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: specs.map((spec) => ({
      id: spec.id,
      type: "architecture" as const,
      position: spec.position ?? { x: (free++) * COLUMN_WIDTH, y: bottom },
      data: {
        type: spec.type as ArchitectureNodeType,
        label: spec.label ?? spec.id,
        ...(spec.implementation ? { implementation: spec.implementation } : {}),
        ...(spec.properties ? { properties: spec.properties } : {}),
      },
    })),
    edges: edges.map((edge) => ({ id: `${edge.source}->${edge.target}`, ...edge })),
    ...(technologies.length > 0 ? { customTechnologies: technologies } : {}),
  };
  return finish(typeof meta.title === "string" ? meta.title : undefined, graph, warnings);
}
