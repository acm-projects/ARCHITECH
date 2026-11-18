"use client";

import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { Download, ExternalLink, FileCode2, Play } from "lucide-react";

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
    <button type="button" className="ax-project-menu-item" onClick={download} popoverTarget={popoverTarget} popoverTargetAction="hide" title="Download a starter docker-compose.yml for this design">
      <FileCode2 size={15} aria-hidden="true" />
      <span>Export compose file<small>docker-compose.yml, with unsaved edits</small></span>
    </button>
  );
}

// The design as an app you can use, with Archie showing what each part of the design does:
//   Run as app            opens it inside ARCHITECH (/workspace/[id]/run), nothing to install;
//   Download app (Docker) a .zip with a docker-compose project, every part of the design as its
//                         own container.
// Both are built on the server from the saved project, so they reflect the last saved version.
export function RunnableAppButton({ projectId, popoverTarget }: { projectId: string; popoverTarget?: string }) {
  const closeMenu = (element: HTMLElement) => {
    const target = element.ownerDocument.getElementById(popoverTarget ?? "");
    if (target && "hidePopover" in target) (target as HTMLElement & { hidePopover: () => void }).hidePopover();
  };
  const id = encodeURIComponent(projectId);
  return (
    <>
      <a
        className="ax-project-menu-item"
        href={`/workspace/${id}/run`}
        target="_blank"
        rel="noopener"
        onClick={(event) => closeMenu(event.currentTarget)}
        title="Use this design as a working app, while Archie shows what each part does"
      >
        <Play size={15} aria-hidden="true" />
        <span>Run as app<small>The saved design, live, in a new tab</small></span>
        <ExternalLink size={13} aria-hidden="true" className="ax-project-menu-trail" />
      </a>
      <a
        className="ax-project-menu-item"
        href={`/api/projects/${id}/export/runnable-app`}
        download
        onClick={(event) => closeMenu(event.currentTarget)}
        title="Download this design as an app that runs every part in its own container (docker compose)"
      >
        <Download size={15} aria-hidden="true" />
        <span>Download app<small>.zip · runs with docker compose up</small></span>
      </a>
    </>
  );
}
