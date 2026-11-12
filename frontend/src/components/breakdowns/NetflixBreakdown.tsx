"use client";

import type { EdgeProps } from "@xyflow/react";

import SystemBreakdown, { type SystemBreakdownDefinition } from "./SystemBreakdown";
import { NETFLIX_COMPONENTS, NETFLIX_NOTES, NETFLIX_REVIEW, NETFLIX_SOURCES, NETFLIX_WALKTHROUGH } from "./netflix";
import { NETFLIX_PREVIEWS } from "./netflixPreviews";
import { NETFLIX_SCENES } from "./NetflixPreviewScenes";
import { netflixStreamingChallenge } from "../challenge/challenges";

// Reserve a lane below the preparation row so video delivery bypasses the API
// tier visually as well as in the topology.
const VIDEO_RETURN_ROUTE = { laneY: 620, leftClearance: 30, labelX: 280 } as const;

function videoReturnPath({ sourceX, sourceY, targetX, targetY }: Pick<EdgeProps, "sourceX" | "sourceY" | "targetX" | "targetY">): string {
  const { laneY, leftClearance } = VIDEO_RETURN_ROUTE;
  const returnX = targetX - leftClearance;
  return `M ${sourceX} ${sourceY} V ${laneY} H ${returnX} V ${targetY} H ${targetX}`;
}

const NETFLIX_BREAKDOWN: SystemBreakdownDefinition = {
  id: "netflix",
  title: "Netflix System breakdown",
  diagramLabel: "Netflix example architecture",
  accent: "#e50914",
  components: NETFLIX_COMPONENTS,
  walkthrough: NETFLIX_WALKTHROUGH,
  sources: NETFLIX_SOURCES,
  review: NETFLIX_REVIEW,
  notes: NETFLIX_NOTES,
  previews: NETFLIX_PREVIEWS,
  scenes: NETFLIX_SCENES,
  challenge: netflixStreamingChallenge,
  route: props => props.id === "cdn-viewer"
    ? [videoReturnPath(props), VIDEO_RETURN_ROUTE.labelX, VIDEO_RETURN_ROUTE.laneY]
    : undefined,
};

export default function NetflixBreakdown() {
  return <SystemBreakdown definition={NETFLIX_BREAKDOWN} />;
}
