# Architecture graph format (v1)

This is the JSON we save for a single architecture: the components on the canvas and the
connections between them. The project API stores and returns it, the metrics engine reads it,
and it's what gets sent to the AI review.

We kept it as a subset of React Flow's own save format
([`ReactFlowJsonObject`](https://reactflow.dev/api-reference/types/react-flow-json-object),
i.e. `{ nodes, edges, viewport }`) and reused its
[`Node`](https://reactflow.dev/api-reference/types/node) and
[`Edge`](https://reactflow.dev/api-reference/types/edge) types from `@xyflow/react` 12.12.
That way the canvas can save nodes and edges as-is and load them back without any mapping.

The JSON Schema version lives in [`graph.schema.json`](./graph.schema.json) (draft 2020-12).
If you want to see the format enforced in code, look at:

- `sanitizeNodes` / `sanitizeEdges` in `src/components/projects/projectStore.ts`
- `sanitizeNodeProperties` in `src/lib/architecture/nodeProperties.ts`
- `validateConnection` in `src/lib/architecture/connections.ts`

Almost everything here matches what the canvas already saves. The two exceptions are
`schemaVersion` and `data.implementation`, which are new and marked as such below.

## Top level

```jsonc
{
  "schemaVersion": 1,   // new, always 1 for now
  "nodes": [ /* see Node */ ],
  "edges": [ /* see Edge */ ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | `1` | yes | New. Gives the server a way to migrate old graphs later. Graphs saved by the current frontend don't have it yet; treat those as version 1. |
| `nodes` | `Node[]` | yes | Can be empty. |
| `edges` | `Edge[]` | yes | Can be empty. |

We don't store `viewport`. React Flow includes pan/zoom in its save format, but that's view
state, not architecture, so we leave it out. When a project opens, the canvas just fits the
view to the nodes.

## Node

One component on the canvas.

```json
{
  "id": "database-1",
  "type": "architecture",
  "position": { "x": 500, "y": 80 },
  "data": {
    "type": "database",
    "label": "Orders DB",
    "implementation": "postgresql",
    "properties": { "replicas": 2 }
  }
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Non-empty, unique in the graph, and never reused for a different node. The canvas generates ids like `database-1`, but don't parse them. |
| `type` | `"architecture"` | yes | React Flow's node type, i.e. which component renders it. It's always `"architecture"`. The actual kind of component is in `data.type`. |
| `position` | `{ x: number, y: number }` | yes | Top-left corner in canvas coordinates. Must be finite; negative is fine. Doesn't affect metrics. |
| `data` | `NodeData` | yes | See below. |

### NodeData

| Field | Type | Required | Rules |
|---|---|---|---|
| `type` | `ComponentTypeId` | yes | One of the 15 ids in the table below. Same value as `component_types.name` in the database. |
| `label` | string | yes | The user's name for it. 1–60 characters and not just whitespace. Doesn't affect metrics. |
| `implementation` | string | no | New. The chosen technology, as a `component_implementations.id` (e.g. `"postgresql"`). Its component type's `name` has to match `data.type`. If it's missing, the type's default implementation (`is_default = true`) is used. |
| `properties` | object | no | The user's config overrides, described under Node properties. Leave it out rather than writing `{}` when nothing is set. |

### Component types

These line up with `ArchitectureNodeType` in `src/lib/architecture/types.ts` and the seeded
`component_types` table.

| `data.type` | Label | Family | Default implementation |
|---|---|---|---|
| `client` | Client | frontend | `web-browser` |
| `web-app` | Web App | frontend | `nextjs` |
| `mobile-app` | Mobile App | frontend | `react-native` |
| `cdn` | CDN | infrastructure | `cloudflare-cdn` |
| `dns` | DNS | infrastructure | `amazon-route-53` |
| `server` | API Server | backend | `nodejs-express` |
| `api-gateway` | API Gateway | backend | `amazon-api-gateway` |
| `api` | API | backend | `rest-api` (also `graphql-api`, `grpc-api`, `websocket-api`) |
| `custom` | Custom | general | `custom-technology`: a technology the app does not model (from an imported repository). Its name is in `data.properties.technology`. Not shown in the library; Run Design passes traffic through it unmeasured. |
| `load-balancer` | Load Balancer | infrastructure | `nginx` |
| `database` | Database | data | `postgresql` |
| `cache` | Cache | data | `redis` |
| `queue` | Message Queue | data | `rabbitmq` |
| `worker` | Worker | backend | `nodejs-worker` |
| `object-storage` | Object Storage | data | `amazon-s3` |
| `search` | Search | data | `elasticsearch` |
| `auth` | Authentication | backend | `authjs` |

All the implementations are listed in `src/lib/architecture/componentLibrary.ts` (the seed and the metrics engine both read it).

### Fields we don't save

React Flow adds a bunch of runtime fields to nodes. We strip these on save and ignore them on
load: `selected`, `dragging`, `measured`, `width`, `height`, `resizing`, `hidden`, `zIndex`,
`style`, `className`, `parentId`, `extent`, `sourcePosition`, `targetPosition`, and the
interaction flags (`draggable`, `selectable`, `connectable`, `deletable`, `focusable`).

## Edge

One connection.

```json
{ "id": "server-1->database-1", "source": "server-1", "target": "database-1" }
```

Edges point the way requests flow: from the caller to whatever handles the request
(client → load balancer → server → database). The metrics engine walks them in that direction.

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Non-empty and unique. The canvas uses `"<source>-><target>"`, plus `":<sourceHandle>:<targetHandle>"` if handles are set (see `connectionId` in `connections.ts`). Don't parse it. |
| `source` | string | yes | The `id` of an existing node. |
| `target` | string | yes | The `id` of an existing node other than `source`. |
| `sourceHandle` | string | no | Not used right now, since every node has exactly one output (right) and one input (left). Kept in case we add more handles later. |
| `targetHandle` | string | no | Same as `sourceHandle`. |

Not saved on edges: `selected`, `animated`, `hidden`, `style`, `className`, `label`,
`markerStart`, `markerEnd` (the arrowhead comes from the canvas's `defaultEdgeOptions`), `type`
(we use React Flow's default edge), `zIndex`, `interactionWidth`. Edges have no `data` in v1.

## Node properties

`data.properties` is a flat object holding only what the user explicitly changed. Anything
they didn't touch isn't stored, and the component default applies.

Storage limits, for any key:

- Keys start with a letter, followed by letters, digits, `_` or `-`. Max 40 characters.
- Values are a string (max 200 characters), a finite number, or a boolean. No nested objects, arrays, or `null`.
- Max 32 entries.

The metrics engine only reads four keys. Anything else is kept but ignored.

| Key | Meaning |
|---|---|
| `replicas` | Number of instances running in parallel. On a `database` this means read replicas (in addition to the primary), which is why it can be 0. |
| `capacity` | Requests/s a single instance can handle (operations/s for a database). Overrides the default. Raising it also raises cost proportionally. |
| `cacheHitRate` | Fraction of reads served without going further downstream (0.7 = 70%). On a `cdn`, the fraction of static-file requests answered at the edge (API requests always pass through). |
| `authCheckRate` | `auth` only. Fraction of requests that call the auth service (0.05 = JWT: only sign-ins and token refreshes; 1 = session lookup on every request). |

Which properties each type accepts comes from `getPropertyDefinitions` in
`src/lib/architecture/componentProperties.ts`. These are the same limits the property panel
enforces.

| `data.type` | Properties (min–max, default) |
|---|---|
| `client`, `web-app`, `mobile-app` | none |
| `cdn` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (50,000); `cacheHitRate` 0–1 (0.95) |
| `dns` | `replicas` 1–1000 (1) |
| `server` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (2,500) |
| `api-gateway` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (10,000) |
| `api` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (8,000) |
| `load-balancer` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (12,000) |
| `database` | `replicas` 0–50 (0); `capacity` 1–10,000,000 (5,000) |
| `cache` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (40,000); `cacheHitRate` 0–1 (0.7) |
| `queue` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (8,000) |
| `worker` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (1,500) |
| `object-storage` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (12,000) |
| `search` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (1,500) |
| `auth` | `replicas` 1–1000 (1); `capacity` 1–10,000,000 (4,000); `authCheckRate` 0–1 (0.05) |

`replicas` has to be an integer. Note the database range is 0–50, not 1–1000 like the rest.
Defaults are taken from each type's default implementation.

How `data.implementation` (new) fits in: picking a non-default implementation changes the
baseline, not the user's overrides. The implementation's `capacity_per_instance`,
`latency_ms`, `monthly_cost_per_instance`, `availability` and `hit_rate` replace the type
defaults, but a stored `capacity` or `cacheHitRate` still takes priority. An unknown id, or one
belonging to another type, is treated as the type's default.

## Validation

Rules for a whole graph. The JSON Schema covers 1–4. Rules 5–9 compare values across the
graph or against the database, so they have to be checked in code.

1. `nodes` and `edges` are arrays, and `schemaVersion` is `1`.
2. Each node has an `id`, `type: "architecture"`, a finite `position`, and `data` with a known `data.type` and a 1–60 character `label`.
3. Each edge has string `id`, `source` and `target`.
4. `data.properties` follows the storage limits above.
5. Node ids are unique.
6. Edge ids are unique, and no two edges share the same `source`, `target`, `sourceHandle` and `targetHandle`.
7. Every edge's `source` and `target` exist in the graph and aren't the same node.
8. Known property keys on a type that supports them are within that type's range.
9. If `data.implementation` is set, it exists and belongs to `data.type`.

Right now the frontend is forgiving on load: instead of failing, it drops whatever is invalid.
Bad nodes go first, then edges pointing at missing nodes, duplicate ids, repeated
connections, and bad property entries.

The server should be stricter. Reject the save with a `400` and the path of the first problem,
e.g. `{ "error": "nodes[3].data.label must be 1-60 characters." }`, so bad data never gets
stored. Rules 1–4 can go through any JSON Schema validator (Ajv works) against
`graph.schema.json`, and 5–9 fit in a small function.

Cycles, disconnected pieces, and odd wiring like a client connected straight to a database
are not validation errors. They're legitimate designs. The metrics engine and the review flag
them as findings instead.

## Examples

The starter architecture every new project opens with (`starterArchitecture.ts`):

```json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "client-1", "type": "architecture", "position": { "x": 140, "y": 80 }, "data": { "type": "client", "label": "Client" } },
    { "id": "server-1", "type": "architecture", "position": { "x": 320, "y": 80 }, "data": { "type": "server", "label": "API Server" } },
    { "id": "database-1", "type": "architecture", "position": { "x": 500, "y": 80 }, "data": { "type": "database", "label": "Database" } }
  ],
  "edges": [
    { "id": "client-1->server-1", "source": "client-1", "target": "server-1" },
    { "id": "server-1->database-1", "source": "server-1", "target": "database-1" }
  ]
}
```

A bigger one: load balancer, three API servers, Redis cache, PostgreSQL primary with two read
replicas, and a Kafka queue feeding workers.

```json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "client-1", "type": "architecture", "position": { "x": 0, "y": 120 }, "data": { "type": "client", "label": "Client" } },
    { "id": "load-balancer-1", "type": "architecture", "position": { "x": 180, "y": 120 }, "data": { "type": "load-balancer", "label": "Load Balancer", "implementation": "aws-alb" } },
    { "id": "server-1", "type": "architecture", "position": { "x": 360, "y": 120 }, "data": { "type": "server", "label": "API Server", "properties": { "replicas": 3 } } },
    { "id": "cache-1", "type": "architecture", "position": { "x": 540, "y": 40 }, "data": { "type": "cache", "label": "Session Cache", "implementation": "redis", "properties": { "cacheHitRate": 0.85 } } },
    { "id": "database-1", "type": "architecture", "position": { "x": 720, "y": 120 }, "data": { "type": "database", "label": "Orders DB", "implementation": "postgresql", "properties": { "replicas": 2 } } },
    { "id": "queue-1", "type": "architecture", "position": { "x": 540, "y": 220 }, "data": { "type": "queue", "label": "Order Events", "implementation": "apache-kafka" } },
    { "id": "worker-1", "type": "architecture", "position": { "x": 720, "y": 260 }, "data": { "type": "worker", "label": "Email Worker", "properties": { "replicas": 2 } } }
  ],
  "edges": [
    { "id": "client-1->load-balancer-1", "source": "client-1", "target": "load-balancer-1" },
    { "id": "load-balancer-1->server-1", "source": "load-balancer-1", "target": "server-1" },
    { "id": "server-1->cache-1", "source": "server-1", "target": "cache-1" },
    { "id": "cache-1->database-1", "source": "cache-1", "target": "database-1" },
    { "id": "server-1->queue-1", "source": "server-1", "target": "queue-1" },
    { "id": "queue-1->worker-1", "source": "queue-1", "target": "worker-1" }
  ]
}
```

## Where it's used

- **Saving (frontend → API):** `{ schemaVersion: 1, nodes: sanitizeNodes(nodes), edges: sanitizeEdges(edges, cleanNodes) }`. The sanitizers already strip runtime fields like `selected` and `measured`.
- **Loading (API → frontend):** hand `nodes` and `edges` to `<ReactFlow>` directly, but run them through the same sanitizers first. Don't trust what comes back from the server either.
- **Database:** stored whole in the `projects.graph` `jsonb` column (one row per project) instead of a row per node. We always load and save the full graph, so one read and one write is all we need. The projects API (`/api/projects`) checks every save against section 5.
- **Metrics engine:** only looks at `nodes[].id`, `nodes[].data.type`, `nodes[].data.properties` (and `data.implementation` eventually), plus `edges[].source` / `edges[].target`. Labels and positions never matter.
- **AI review:** strip positions before sending the graph, and swap in each node's implementation name from the database so the prompt says "PostgreSQL" and not an id.

### Changing the format

Adding an optional field is backward compatible, so `schemaVersion` stays at 1. Renaming or
removing a field, or changing what a value means, needs `schemaVersion: 2` and a migration for
graphs that are already stored.

Adding a new component type touches four places: `ArchitectureNodeType` (`types.ts`), the
canvas catalog (`componentCatalog.ts`), `SIMULATION_PROFILES` (`capabilities.ts`), and the seed
(`prisma/seed/componentLibrary.ts`). Don't forget to add it to the `enum` in
`graph.schema.json` too.

## Custom technologies (imported repositories)

A graph may carry an optional `customTechnologies` array: technologies an imported repository
uses that ARCHITECH does not model, such as an unknown docker-compose service or a .NET worker.
Each entry is `{ "id": "traefik", "name": "Traefik", "evidence": ["docker-compose.yml runs the \"traefik\" image"] }`
(id: lowercase letters, digits and `-`; name 1-60 characters; at most 5 evidence lines; at most
30 entries). They are listed in the project's sidebar under "From your repo"; dragging one adds a
`custom` node with `data.properties.technology` set to its name.
