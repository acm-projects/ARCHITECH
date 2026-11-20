"use client";

import SystemBreakdown, { type SystemBreakdownDefinition } from "./SystemBreakdown";
import { ARCHITECH_COMPONENTS, ARCHITECH_NOTES, ARCHITECH_REVIEW, ARCHITECH_SOURCES, ARCHITECH_WALKTHROUGH } from "./architech";
import { ARCHITECH_PREVIEWS } from "./architechPreviews";
import { ARCHITECH_SCENES } from "./ArchitechPreviewScenes";
import { diagramEditorChallenge } from "../challenge/challenges";

const ARCHITECH_BREAKDOWN: SystemBreakdownDefinition = {
  id: "architech",
  title: "System breakdown",
  diagramLabel: "ARCHITECH architecture",
  accent: "#0091ff",
  components: ARCHITECH_COMPONENTS,
  walkthrough: ARCHITECH_WALKTHROUGH,
  sources: ARCHITECH_SOURCES,
  review: ARCHITECH_REVIEW,
  notes: ARCHITECH_NOTES,
  previews: ARCHITECH_PREVIEWS,
  scenes: ARCHITECH_SCENES,
  challenge: diagramEditorChallenge,
};

export default function ArchitechBreakdown() {
  return <SystemBreakdown definition={ARCHITECH_BREAKDOWN} />;
}
