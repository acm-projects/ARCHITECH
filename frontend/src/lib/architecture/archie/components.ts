import type { ArchitectureEvaluation } from "../evaluation/contract.ts";
import type { ArchitectureNodeType } from "../types.ts";
import type { ComponentRef, ExplanationSource } from "./contract.ts";

// How components are named in sentences, and what each one is for. Plain vocabulary for
// explanations, not display metadata (the visual catalog is separate and untouched).

export const COMPONENT_NOUNS: Record<ArchitectureNodeType, string> = {
  client: "client",
  "web-app": "web app",
  "mobile-app": "mobile app",
  cdn: "CDN",
  dns: "DNS",
  server: "server",
  "api-gateway": "API gateway",
  "load-balancer": "load balancer",
  database: "database",
  cache: "cache",
  queue: "message queue",
  worker: "worker",
  "object-storage": "object storage",
  search: "search service",
  auth: "authentication service",
};

// One plain sentence on what the component does, for a component that has nothing wrong.
export const COMPONENT_ROLES: Record<ArchitectureNodeType, string> = {
  client: "Starts requests: the people or apps that use your system.",
  "web-app": "Starts requests from a browser.",
  "mobile-app": "Starts requests from a phone.",
  cdn: "Serves popular content from locations close to users, so fewer requests reach your servers.",
  dns: "Turns a name like example.com into the address requests are sent to.",
  server: "Runs your application logic and answers requests.",
  "api-gateway": "The front door for requests: routes each one to the right service.",
  "load-balancer": "Spreads requests across several copies of a service so no single copy is overloaded.",
  database: "Stores your data permanently and answers questions about it.",
  cache: "Keeps frequently read data in fast memory so the database is asked less often.",
  queue: "Holds work in line so it can be processed at a steady pace instead of all at once.",
  worker: "Processes work in the background, usually taken from a queue.",
  "object-storage": "Stores large files such as images and videos.",
  search: "Answers search queries quickly over your data.",
  auth: "Checks who is making a request and what they may do.",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const noun = (type: ArchitectureNodeType | null): string =>
  type ? COMPONENT_NOUNS[type] : "component";

// Looks components up by id. Their TYPE comes from the evaluation; their NAME comes from the
// current design when names are given, so a component renamed since the run is described by
// its new name, and one that was deleted is described generically. Nothing is decided by name.
export function createComponentResolver(source: ExplanationSource) {
  const types = new Map(source.evaluation.nodes.map((node) => [node.nodeId, node.type]));

  const ref = (id: string): ComponentRef => {
    const type = types.get(id) ?? null;
    const label = source.labels?.[id];
    if (source.labels === undefined) {
      return { id, type, label: capitalize(noun(type)), present: true };
    }
    if (label === undefined) {
      return { id, type, label: capitalize(noun(type)), present: false };
    }
    return { id, type, label: label.trim() || capitalize(noun(type)), present: true };
  };

  // How to refer to a component in the middle of a sentence.
  const describe = (id: string): string => {
    const component = ref(id);
    const word = noun(component.type);
    if (!component.present) return `a ${word} that is no longer in the design`;
    if (component.label.toLowerCase() === word.toLowerCase()) return `your ${word}`;
    return `${component.label} (${word})`;
  };

  return { ref, describe, type: (id: string) => types.get(id) ?? null };
}

export type ComponentResolver = ReturnType<typeof createComponentResolver>;

export const nodeEvaluation = (evaluation: ArchitectureEvaluation, id: string) =>
  evaluation.nodes.find((node) => node.nodeId === id);

export const upperFirst = capitalize;
