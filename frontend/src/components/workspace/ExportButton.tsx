"use client";

import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { Download } from "lucide-react";

import { toDockerCompose } from "../../lib/architecture/export/dockerCompose";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// Downloads the design on the canvas as a starter docker-compose.yml (generated in the browser,
// so it works offline and includes unsaved changes).
export function ExportButton({ title, popoverTarget }: { title: string; popoverTarget?: string }) {
  const { getNodes, getEdges } = useReactFlow<ArchitectureFlowNode, Edge>();
  const download = () => {
    const { yaml } = toDockerCompose({ title, nodes: getNodes(), edges: getEdges() });
    const url = URL.createObjectURL(new Blob([yaml], { type: "text/yaml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "docker-compose.yml";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <button type="button" className="ax-ai-toggle" onClick={download} popoverTarget={popoverTarget} popoverTargetAction="hide" title="Download a starter docker-compose.yml for this design">
      <Download size={15} aria-hidden="true" />
      Export
    </button>
  );
}
