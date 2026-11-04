"use client";

import Image from "next/image";
import { useState } from "react";
import { Gauge, Maximize, Minus, MoreHorizontal, Play, Plus, ShieldCheck, X } from "lucide-react";
import { Logo } from "../../components/ui";
import ComponentGlyph from "../../components/workspace/ComponentGlyph";
import { COMPONENT_CATALOG, FAMILY_COLORS, componentGroups, type ComponentFamily } from "../../components/workspace/componentCatalog";
import { CATEGORY_ICONS } from "../../components/workspace/toolbox/categoryIcons";
import { LANDING_GRAPH, LANDING_NODES, type runLandingSimulation } from "./landingSimulation";
import "./landing-workspace-preview.css";

const POSITIONS: Record<string, { x: number; y: number }> = {
  client: { x: 60, y: 235 }, gateway: { x: 310, y: 135 },
  auth: { x: 310, y: 335 }, api: { x: 565, y: 135 }, database: { x: 805, y: 335 },
};
const FLOW_DELAY: Record<string, number> = { client: 0, gateway: 1.3, auth: 1.3, api: 2.6, database: 3.9 };

function connectionPath(source: string, target: string) {
  const from = POSITIONS[source];
  const to = POSITIONS[target];
  const x = from.x + 132, y = from.y + 21, endY = to.y + 21;
  if (y === endY) return `M${x} ${y}H${to.x}`;
  const middle = (x + to.x) / 2, direction = endY > y ? 1 : -1;
  return `M${x} ${y}H${middle - 10}Q${middle} ${y} ${middle} ${y + direction * 10}V${endY - direction * 10}Q${middle} ${endY} ${middle + 10} ${endY}H${to.x}`;
}
function Mascot() {
  return <span className="workspace-preview-portrait"><Image src="/archie.svg" alt="" width={518} height={400} /></span>;
}

export default function LandingWorkspacePreview({ onRun, result, runId, onGetStarted }: {
  onRun: () => void;
  result: ReturnType<typeof runLandingSimulation> | null;
  runId: number;
  onGetStarted: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [archieOpen, setArchieOpen] = useState(false);
  const [category, setCategory] = useState<ComponentFamily | "all" | null>(null);
  const groups = componentGroups("").filter(group => category === "all" || group.family === category);
  return <>
    <div className="workspace-preview-header">
      <Logo variant="by-level" />
      <div className="workspace-preview-project">Commerce platform <span>Example architecture</span></div>
      <button type="button" className="workspace-preview-run" onClick={onRun} aria-controls="landing-simulation-results"><Play size={15} aria-hidden="true" />Run</button>
    </div>
    <div className="workspace-preview-canvas">
      <div className="workspace-preview-zoom" role="group" aria-label="Preview zoom">
        <button type="button" aria-label="Zoom in preview" disabled={zoom >= 1.5} onClick={() => setZoom(value => Math.min(1.5, value + 0.1))}><Plus size={16} /></button>
        <button type="button" aria-label="Zoom out preview" disabled={zoom <= 0.7} onClick={() => setZoom(value => Math.max(0.7, value - 0.1))}><Minus size={16} /></button>
        <button type="button" aria-label="Fit preview" onClick={() => setZoom(1)}><Maximize size={15} /></button>
      </div>
      <div className="workspace-preview-plot"><svg className="workspace-preview-topology" viewBox="0 0 1000 500" role="img" aria-label="Example architecture connecting Web client, API gateway, Auth service, Core API and PostgreSQL">
        <g style={{ transform: `translate(500px, 250px) scale(${zoom}) translate(-500px, -250px)` }}>
          <g className="workspace-preview-edges">{LANDING_GRAPH.edges.map(edge => <path key={edge.source + edge.target} d={connectionPath(edge.source, edge.target)} />)}</g>
          {result && runId > 0 && <g key={`traffic-${runId}`} className="workspace-preview-packets" aria-hidden="true">
            {LANDING_GRAPH.edges.map(edge => <circle
              key={edge.source + edge.target} r="3.5" className="workspace-preview-packet"
              style={{ offsetPath: `path("${connectionPath(edge.source, edge.target)}")`, animationDelay: `${FLOW_DELAY[edge.source]}s` }}
            />)}
          </g>}
          {LANDING_NODES.map(node => {
            const position = POSITIONS[node.id];
            const color = FAMILY_COLORS[COMPONENT_CATALOG[node.type].family];
            return <g key={`${node.id}-${runId}`} transform={`translate(${position.x} ${position.y})`} className={`workspace-preview-node ${result && runId > 0 ? "is-flowing" : ""}`} style={{ animationDelay: `${FLOW_DELAY[node.id]}s` }}>
              <rect width="132" height="42" rx="21" />
              <rect className="workspace-preview-node-icon" x="7" y="9" width="24" height="24" rx="5" fill={color} />
              <foreignObject x="10" y="12" width="18" height="18"><ComponentGlyph type={node.type} style={{ color, display: "block" }} /></foreignObject>
              <text x="38" y="19" className="workspace-preview-node-name">{node.label}</text>
              <text x="38" y="30" className="workspace-preview-node-meta">{node.meta}</text>
              <circle cx="0" cy="21" r="2.8" /><circle cx="132" cy="21" r="2.8" />
            </g>;
          })}
        </g>
      </svg></div>
      <div className="workspace-preview-library" onMouseLeave={() => setCategory(null)} onKeyDown={event => { if (event.key === "Escape") { setCategory(null); event.currentTarget.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus(); } }}>
        {category && <div className="workspace-preview-library-menu">
          <div><strong>{category === "all" ? "Components" : groups[0]?.label}</strong><button type="button" aria-label="Close preview components" onClick={() => setCategory(null)}><X size={15} /></button></div>
          <ul>{groups.flatMap(group => group.components).map(component => <li key={component.type}><ComponentGlyph type={component.type} style={{ color: FAMILY_COLORS[component.family] }} /><span>{component.label}</span></li>)}</ul>
          <button type="button" className="workspace-preview-open" onClick={onGetStarted}>Open workspace</button>
        </div>}
        <div className="workspace-preview-toolbar" role="group" aria-label="Preview components">
          {(["frontend", "backend", "data", "infrastructure"] as const).map(family => {
            const CategoryIcon = CATEGORY_ICONS[family];
            return <button key={family} type="button" aria-label={`Preview ${family} components`} aria-expanded={category === family} style={{ color: FAMILY_COLORS[family] }} onPointerEnter={event => { if (event.pointerType === "mouse") setCategory(family); }} onClick={() => setCategory(family)}><CategoryIcon size={30} /></button>;
          })}
          <button type="button" aria-label="Preview all components" aria-expanded={category === "all"} onPointerEnter={event => { if (event.pointerType === "mouse") setCategory("all"); }} onClick={() => setCategory("all")}><MoreHorizontal size={29} /></button>
          <span className="workspace-preview-separator" />
          <button type="button" aria-label="Run example simulation" onClick={onRun}><Gauge size={28} /></button>
          <button type="button" aria-label="Inspect example architecture" onClick={() => setArchieOpen(true)}><ShieldCheck size={28} /></button>
        </div>
      </div>
      {archieOpen && <aside className="workspace-preview-archie-panel" aria-label="Example architecture review">
        <div><strong>Archie</strong><button type="button" aria-label="Collapse preview Archie" onClick={() => setArchieOpen(false)}><Minus size={17} /></button></div>
        <p>{result ? result.health.reasons[0] ?? "Simulation complete. Review the results below." : "Run this example to inspect throughput and latency. Core API has three replicas; PostgreSQL has a single primary."}</p>
      </aside>}
      {!archieOpen && <button type="button" className="workspace-preview-archie" aria-label="Open preview Archie" aria-expanded={false} onClick={() => setArchieOpen(true)}><Mascot /></button>}
    </div>
  </>;
}
