"use client";

import { useContext, useMemo, useState, type CSSProperties } from "react";

import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useSession } from "next-auth/react";

import type { ExperienceLevel } from "../../types";
import { roleOf } from "../../lib/architecture/analysis";
import { setNodeImplementation } from "../../lib/architecture/implementationEditing";
import {
  compareTechnologiesForNode,
  compareTechnologiesForTraffic,
  currentImplementationId,
  formatInstances,
  formatLatency,
  formatMonthlyCost,
  formatRate,
  type TechnologyComparison,
  type TechnologyEstimate,
} from "../../lib/architecture/implementationStats";
import ComponentGlyph from "./ComponentGlyph";
import {
  FAMILY_COLORS,
  writeComponentDragData,
  type ComponentDefinition,
} from "./componentCatalog";
import { DesignTrafficContext } from "./DesignTrafficContext";
import { DesignComparisonTable } from "./DesignComparisonTable";
import { compareTechnologiesInDesign } from "../../lib/architecture/evaluation/whatIf";
import "./live-metrics.css";
import type { ArchitectureFlowNode, ArchitectureNodeType } from "./nodes/ArchitectureNode";
import { setComponentDragImage } from "./toolbox/dragPreview";

// Choosing the technology (implementation) behind a component, with numbers calculated for the
// system being built: instances needed, monthly cost (instances + storage for the data) and
// latency, all from the evaluation engine (lib/architecture/implementationStats.ts).
//   - TechnologyDragList: inside the toolbox. Each technology can be dragged onto the canvas
//     directly, so a component can be configured before it is placed or connected.
//   - TechnologyChooser: inside a component's Configure card. A list of options with their
//     strengths and trade-offs for beginners, a compact dropdown for everyone else.

// ---- Shared text ----

function capacityUnit(type: ArchitectureNodeType): string {
  return roleOf(type) === "database" ? "ops/s" : "req/s";
}

// "5,500 ops/s · 22 ms · $85 each": the technology's own numbers, per instance.
function perInstanceLine(type: ArchitectureNodeType, estimate: TechnologyEstimate): string {
  const { capacityPerInstance, latencyMs, monthlyCostPerInstance } = estimate.implementation;
  return [
    capacityPerInstance === null ? null : `${formatRate(capacityPerInstance)} ${capacityUnit(type)}`,
    formatLatency(latencyMs),
    monthlyCostPerInstance > 0 ? `$${monthlyCostPerInstance} each` : "free",
  ]
    .filter(Boolean)
    .join(" · ");
}

// "3 instances · $260/mo · 22 ms", or why it cannot keep up: the numbers for this system.
function sizedLine(type: ArchitectureNodeType, estimate: TechnologyEstimate): string {
  if (!estimate.enough) {
    return roleOf(type) === "database"
      ? "Can't keep up — too many writes for one primary"
      : `Can't keep up even at ${formatInstances(estimate)}`;
  }
  const instances = formatInstances(estimate);
  return [instances, formatMonthlyCost(estimate.monthlyCost), formatLatency(estimate.latencyMs)]
    .filter(Boolean)
    .join(" · ");
}

function basisLine(comparison: TechnologyComparison, datasetGb: number, storage: boolean): string {
  const data = storage ? ` and ${formatRate(datasetGb)} GB of data` : "";
  return comparison.basis === "design"
    ? `For the ${formatRate(comparison.demandRps)} req/s reaching it in your design${data}`
    : `Estimated for ${formatRate(comparison.demandRps)} req/s${data} — connect it for numbers from your design`;
}

function tradeoffs(estimate: TechnologyEstimate): string {
  const { strengths, tradeoffs: costs } = estimate.implementation;
  return [...strengths.map((s) => `+ ${s}`), ...costs.map((t) => `− ${t}`)].join("\n");
}

const usesStorage = (type: ArchitectureNodeType) => {
  const role = roleOf(type);
  return role === "database" || role === "storage";
};

// ---- Toolbox ----

export function TechnologyDragList({ component, id }: { component: ComponentDefinition; id: string }) {
  const traffic = useContext(DesignTrafficContext);
  const comparison = useMemo(
    () => compareTechnologiesForTraffic(component.type, traffic),
    [component.type, traffic],
  );
  const color = FAMILY_COLORS[component.family];

  return (
    <div id={id} className="ax-tech-list" style={{ "--ax-family": color } as CSSProperties}>
      <p className="ax-tech-basis">{basisLine(comparison, traffic.datasetGb, usesStorage(component.type))}</p>
      <ul>
        {comparison.options.map((estimate) => {
          const { implementation } = estimate;
          return (
            <li key={implementation.id}>
              <div
                draggable
                aria-label={`${component.label}: ${implementation.name}`}
                title={`${implementation.description}\n${tradeoffs(estimate)}`}
                onDragStart={(event) => {
                  writeComponentDragData(event.dataTransfer, {
                    type: component.type,
                    label: component.label,
                    ...(implementation.isDefault ? {} : { implementation: implementation.id }),
                  });
                  setComponentDragImage(
                    event.dataTransfer,
                    implementation.name,
                    event.currentTarget.querySelector("svg"),
                    color,
                  );
                }}
                className="ax-tech-option ax-tech-drag"
              >
                <span className="ax-tech-head">
                  <ComponentGlyph type={component.type} className="ax-item-glyph" />
                  <span className="ax-tech-name">{implementation.name}</span>
                  {implementation.isDefault && <span className="ax-tech-tag">default</span>}
                </span>
                <span className="ax-tech-meta">{perInstanceLine(component.type, estimate)}</span>
                <span className="ax-tech-meta ax-tech-sized" data-short={!estimate.enough || undefined}>
                  {sizedLine(component.type, estimate)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Configure card ----

export function TechnologyChooser({
  nodeId,
  type,
  implementation,
}: {
  nodeId: string;
  type: ArchitectureNodeType;
  implementation: string | undefined;
}) {
  const traffic = useContext(DesignTrafficContext);
  const { data: session } = useSession();
  // Same fallback as the rest of the app when there is no level yet.
  const level: ExperienceLevel = session?.user?.experienceLevel ?? "Intermediate";
  const { getNodes, getEdges, setNodes } = useReactFlow<ArchitectureFlowNode, Edge>();
  const [error, setError] = useState<string | null>(null);

  // Measured in the design as it is now. The card is open only while this component is
  // selected and re-renders when its data changes, so this is the graph on screen. A few
  // small simulations per option; cheap enough to redo on each render.
  const graph = { nodes: getNodes(), edges: getEdges() };
  const comparison = compareTechnologiesForNode(graph, traffic, nodeId);
  // Each technology's effect on the whole design (memoized by fingerprint, so cheap to redo).
  const whatIf = compareTechnologiesInDesign(graph, traffic, nodeId);
  // A custom component has no technologies to choose from.
  if (!comparison || type === "custom") return null;

  const current = currentImplementationId(type, implementation);
  const selected = comparison.options.find((option) => option.implementation.id === current) ?? comparison.options[0];
  const choose = (id: string) => {
    const result = setNodeImplementation(getNodes(), nodeId, id);
    if (!result.ok) return setError(result.message);
    setError(null);
    if (result.changed) setNodes(result.nodes);
  };
  const basis = basisLine(comparison, traffic.datasetGb, usesStorage(type));

  return (
    <div className="ax-card-section ax-configure-technology">
      <p className="ax-card-label">Technology</p>
      <p className="ax-tech-basis">{basis}</p>

      {level === "Beginner" ? (
        <div role="radiogroup" aria-label="Technology" className="ax-tech-list">
          {comparison.options.map((estimate) => {
            const checked = estimate.implementation.id === current;
            return (
              <button
                key={estimate.implementation.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => choose(estimate.implementation.id)}
                className="ax-tech-option"
              >
                <span className="ax-tech-head">
                  <span className="ax-tech-name">{estimate.implementation.name}</span>
                  {estimate.implementation.isDefault && <span className="ax-tech-tag">default</span>}
                </span>
                <span className="ax-tech-meta">{perInstanceLine(type, estimate)}</span>
                <span className="ax-tech-meta ax-tech-sized" data-short={!estimate.enough || undefined}>
                  {sizedLine(type, estimate)}
                </span>
                {checked && (
                  <span className="ax-tech-notes">
                    {estimate.implementation.strengths.map((text) => (
                      <span key={text}>+ {text}</span>
                    ))}
                    {estimate.implementation.tradeoffs.map((text) => (
                      <span key={text}>− {text}</span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <select
            aria-label="Technology"
            value={current}
            onChange={(event) => choose(event.target.value)}
            className="ax-field mt-1"
            disabled={comparison.options.length < 2}
          >
            {comparison.options.map((estimate) => (
              <option key={estimate.implementation.id} value={estimate.implementation.id}>
                {estimate.implementation.name} — {sizedLine(type, estimate)}
              </option>
            ))}
          </select>
          <p className="ax-tech-meta mt-1" title={tradeoffs(selected)}>
            {perInstanceLine(type, selected)}
          </p>
        </>
      )}
      {whatIf && <DesignComparisonTable whatIf={whatIf} onChoose={choose} />}
      {error && (
        <p role="alert" className="ax-card-label mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
