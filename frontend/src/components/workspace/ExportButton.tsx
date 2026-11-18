"use client";

import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { Download, ExternalLink, FileCode2, Play } from "lucide-react";

import { toDockerCompose } from "../../lib/architecture/export/dockerCompose";
import { waitForProjectSaved } from "../projects/projectSaved";
import { projectStore } from "../projects/projectStore";
import { readSyncState } from "../projects/projectSyncEngine";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

// Downloads the design on the canvas as a starter docker-compose.yml (generated in the browser,
// so it works offline and includes unsaved changes).
export function ExportButton({ title, onDone }: { title: string; onDone?: () => void }) {
  const { getNodes, getEdges } = useReactFlow<ArchitectureFlowNode, Edge>();
  const download = () => {
    onDone?.();
    const { yaml } = toDockerCompose({ title, nodes: getNodes(), edges: getEdges() });
    const url = URL.createObjectURL(new Blob([yaml], { type: "text/yaml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "docker-compose.yml";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <button type="button" className="ax-project-menu-item" onClick={download} title="Download a starter docker-compose.yml for this design">
      <FileCode2 size={15} aria-hidden="true" />
      <span>Export compose file<small>docker-compose.yml, with unsaved edits</small></span>
    </button>
  );
}

// The design as an app you can use, with Archie showing what each part of the design does:
//   Run as app            opens it inside ARCHITECH (/workspace/[id]/run), nothing to install;
//   Download app (Docker) a .zip with a docker-compose project, every part of the design as its
//                         own container.
// Both are built on the server from the saved project. Run as app first saves the design and
// waits for the server to have it, so it opens what is on the canvas; if the save does not get
// through in time, it opens the last saved version and the page says so.
export function RunnableAppButton({ projectId, onDone, onBeforeOpen }: {
  projectId: string;
  // Closes the menu these rows sit in.
  onDone?: () => void;
  // Writes any edit still waiting for autosave.
  onBeforeOpen?: () => void;
}) {
  const id = encodeURIComponent(projectId);
  const runUrl = `/workspace/${id}/run`;
  const runLatest = () => {
    onBeforeOpen?.();
    // Opened now, while the click still counts, so the browser does not block it.
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.title = "Saving your design…";
      tab.document.body.style.font = "15px system-ui, sans-serif";
      tab.document.body.style.padding = "32px";
      tab.document.body.textContent = "Saving your latest changes, then starting the app…";
    }
    void waitForProjectSaved(() => {
      let synced: Record<string, string> | undefined;
      try {
        synced = readSyncState(window.localStorage)?.synced;
      } catch {
        synced = undefined;
      }
      return { project: projectStore.getProject(projectId), synced };
    }).then((saved) => {
      const url = saved ? runUrl : `${runUrl}?unsaved=1`;
      if (tab && !tab.closed) tab.location.replace(url);
      else if (!tab) window.location.assign(url);
    });
  };
  return (
    <>
      <a
        className="ax-project-menu-item"
        href={runUrl}
        target="_blank"
        rel="noopener"
        onClick={(event) => {
          // A plain click saves first; Ctrl/Cmd/middle-click keep the browser's own behavior.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onDone?.();
          runLatest();
        }}
        title="Use this design as a working app, while Archie shows what each part does"
      >
        <Play size={15} aria-hidden="true" />
        <span>Run as app<small>Saves, then runs the design in a new tab</small></span>
        <ExternalLink size={13} aria-hidden="true" className="ax-project-menu-trail" />
      </a>
      <a
        className="ax-project-menu-item"
        href={`/api/projects/${id}/export/runnable-app`}
        download
        onClick={() => onDone?.()}
        title="Download this design as an app that runs every part in its own container (docker compose)"
      >
        <Download size={15} aria-hidden="true" />
        <span>Download app<small>.zip · runs with docker compose up</small></span>
      </a>
    </>
  );
}
