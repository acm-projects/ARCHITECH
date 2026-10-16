import type { Edge } from "@xyflow/react";

import type { ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";

// Client -> API Server -> Database, laid out left to right. Shared by the free workspace
// and by newly created projects.
export const STARTER_NODES: readonly ArchitectureFlowNode[] = [
  {
    id: "client-1",
    type: "architecture",
    position: { x: 140, y: 80 },
    data: { type: "client", label: "Client" },
  },
  {
    id: "server-1",
    type: "architecture",
    position: { x: 320, y: 80 },
    data: { type: "server", label: "API Server" },
  },
  {
    id: "database-1",
    type: "architecture",
    position: { x: 500, y: 80 },
    data: { type: "database", label: "Database" },
  },
];

export const STARTER_EDGES: readonly Edge[] = [
  { id: "client-1->server-1", source: "client-1", target: "server-1" },
  { id: "server-1->database-1", source: "server-1", target: "database-1" },
];
