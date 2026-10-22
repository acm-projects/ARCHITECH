import type { ArchitectureNodeType } from "../architecture/types.ts";
import { GRAPH_SCHEMA_VERSION, type GraphDocument } from "../projects/projectPayload.ts";
import type { DetectedComponent } from "./detectStack.ts";

// Turns detected components into a canvas design (graph spec format), laid out left to right
// in request order and connected the usual way:
//   client -> web/mobile app -> load balancer -> API -> services
//   services -> auth, search, cache, databases, queue, object storage
//   queue -> worker -> database
// Connections are a best guess from what is typical; the user adjusts them on the canvas.

export const COLUMN_OF: Record<ArchitectureNodeType, number> = {
  client: 0,
  "web-app": 1,
  "mobile-app": 1,
  cdn: 1,
  dns: 1,
  "load-balancer": 2,
  "api-gateway": 2,
  api: 3,
  server: 4,
  auth: 5,
  search: 5,
  cache: 5,
  queue: 5,
  "object-storage": 5,
  database: 6,
  worker: 6,
  custom: 4,
};
export const COLUMN_WIDTH = 240;
export const ROW_HEIGHT = 110;

export function buildDesign(detected: readonly DetectedComponent[]): GraphDocument {
  const items = [{ type: "client" as const, label: "Users", evidence: [] as string[] }, ...detected];

  // Stable ids: type-1, type-2, ... in the order detected.
  const counts = new Map<string, number>();
  const placed = items.map((item) => {
    const count = (counts.get(item.type) ?? 0) + 1;
    counts.set(item.type, count);
    return { ...item, id: `${item.type}-${count}` };
  });

  // Rows centred within each column.
  const columns = new Map<number, typeof placed>();
  for (const item of placed) {
    const column = COLUMN_OF[item.type];
    columns.set(column, [...(columns.get(column) ?? []), item]);
  }
  const tallest = Math.max(...[...columns.values()].map((column) => column.length));
  const position = new Map<string, { x: number; y: number }>();
  for (const [column, members] of columns) {
    const offset = ((tallest - members.length) * ROW_HEIGHT) / 2;
    members.forEach((member, row) => position.set(member.id, { x: column * COLUMN_WIDTH, y: offset + row * ROW_HEIGHT }));
  }

  const ids = (...types: ArchitectureNodeType[]) => placed.filter((item) => types.includes(item.type)).map((item) => item.id);
  const edges: { source: string; target: string }[] = [];
  const connect = (sources: string[], targets: string[]) => {
    for (const source of sources) for (const target of targets) {
      if (source !== target && !edges.some((edge) => edge.source === source && edge.target === target)) edges.push({ source, target });
    }
  };

  const clients = ids("client");
  const apps = ids("web-app", "mobile-app");
  const balancers = ids("load-balancer");
  const apis = ids("api");
  const services = ids("server");
  // The first layer requests reach after the apps.
  const frontDoor = balancers.length > 0 ? balancers : apis.length > 0 ? apis : services;

  if (apps.length > 0) {
    connect(clients, ids("web-app"));
    const mobile = ids("mobile-app");
    if (mobile.length > 0 && ids("web-app").length === 0) connect(clients, mobile);
    connect(apps, frontDoor);
  } else {
    connect(clients, frontDoor);
  }
  if (balancers.length > 0) connect(balancers, apis.length > 0 ? apis : services);
  if (apis.length > 0) connect(apis, services);
  connect(services, ids("auth", "search", "cache", "database", "queue", "object-storage"));
  connect(ids("queue"), ids("worker"));
  connect(ids("worker"), ids("database"));
  // No services at all: the apps talk to their data directly (e.g. a frontend with only a BaaS).
  if (services.length === 0) connect(apps.length > 0 ? apps : clients, ids("auth", "database", "cache", "object-storage", "search"));

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: placed.map((item) => ({
      id: item.id,
      type: "architecture" as const,
      position: position.get(item.id) as { x: number; y: number },
      data: {
        type: item.type,
        label: item.label,
        ...("implementation" in item && item.implementation ? { implementation: item.implementation } : {}),
      },
    })),
    edges: edges.map((edge) => ({ id: `${edge.source}->${edge.target}`, ...edge })),
  };
}
