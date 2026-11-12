import type { Edge } from "@xyflow/react";

import type { ArchitectureNodeType } from "../../lib/architecture/types";
import type { ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";

type NodeSpec = readonly [id: string, type: ArchitectureNodeType, label: string, x: number, y: number];
type UpcomingGraph = { nodes: ArchitectureFlowNode[]; edges: Edge[] };

function graph(nodes: readonly NodeSpec[], connections: readonly (readonly [string, string])[]): UpcomingGraph {
  return {
    nodes: nodes.map(([id, type, label, x, y]) => ({
      id,
      type: "architecture",
      position: { x, y },
      data: { label, type },
    })),
    edges: connections.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
  };
}

// Simplified shapes for the dashboard cards of breakdowns that are not written yet. They show
// the general kind of system, not either company's actual deployment.
export const UBER_PREVIEW = graph([
  ["rider", "mobile-app", "Rider app", 0, 0],
  ["driver", "mobile-app", "Driver app", 0, 120],
  ["gateway", "api-gateway", "API gateway", 180, 60],
  ["dispatch", "server", "Dispatch", 360, 60],
  ["location", "cache", "Live locations", 540, 0],
  ["trips", "database", "Trips", 540, 120],
  ["events", "queue", "Trip events", 720, 60],
], [
  ["rider", "gateway"],
  ["driver", "gateway"],
  ["gateway", "dispatch"],
  ["dispatch", "location"],
  ["dispatch", "trips"],
  ["trips", "events"],
]);

export const YOUTUBE_PREVIEW = graph([
  ["creator", "client", "Creator", 0, 0],
  ["upload", "server", "Upload", 150, 0],
  ["queue", "queue", "Transcode queue", 300, 0],
  ["encoders", "worker", "Encoders", 450, 0],
  ["storage", "object-storage", "Video storage", 600, 0],
  ["cdn", "cdn", "CDN", 600, 120],
  ["viewer", "client", "Viewer", 450, 120],
  ["api", "api", "Watch API", 300, 120],
  ["metadata", "database", "Metadata", 150, 120],
], [
  ["creator", "upload"],
  ["upload", "queue"],
  ["queue", "encoders"],
  ["encoders", "storage"],
  ["storage", "cdn"],
  ["cdn", "viewer"],
  ["viewer", "api"],
  ["api", "metadata"],
  ["upload", "metadata"],
]);
