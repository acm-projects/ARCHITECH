"use client";

import { Maximize, Minus, Plus, Workflow } from "lucide-react";
import { useReactFlow, useViewport, type FitViewOptions } from "@xyflow/react";

// The canvas's view, in the top bar: zoom out, the zoom level (click for 100%), zoom in, fit the
// design to the screen, and Auto align. They used to float on the canvas, over the design.
const ZOOM_MS = 160;

export default function CanvasViewControls({ fitViewOptions, minZoom, maxZoom, componentCount, onAutoAlign }: {
  fitViewOptions: FitViewOptions;
  minZoom: number;
  maxZoom: number;
  componentCount: number;
  onAutoAlign: () => void;
}) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const percent = Math.round(zoom * 100);
  return <>
    <div className="ax-view-controls" role="group" aria-label="Canvas view">
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= minZoom + 0.001} onClick={() => void zoomOut({ duration: ZOOM_MS })}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <button type="button" className="ax-zoom-level" aria-label={`Zoom ${percent}%, reset to 100%`} title="Reset to 100%" onClick={() => void zoomTo(1, { duration: ZOOM_MS })}>
        {percent}%
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= maxZoom - 0.001} onClick={() => void zoomIn({ duration: ZOOM_MS })}>
        <Plus size={16} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Fit design to screen" title="Fit design to screen" onClick={() => void fitView({ ...fitViewOptions, duration: ZOOM_MS * 2 })}>
        <Maximize size={15} aria-hidden="true" />
      </button>
    </div>
    <button
      type="button"
      className="ax-header-icon-action"
      disabled={componentCount < 2}
      title={componentCount < 2 ? "Add at least two components to align" : "Line components up in the direction requests travel (undo with Ctrl+Z)"}
      onClick={onAutoAlign}
    >
      <Workflow size={16} aria-hidden="true" />
      <span className="ax-action-label">Auto align</span>
    </button>
  </>;
}
