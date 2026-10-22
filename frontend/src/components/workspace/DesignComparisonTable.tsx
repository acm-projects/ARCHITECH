"use client";

import type { WhatIf, WhatIfOption } from "../../lib/architecture/evaluation/whatIf";
import { formatLatency, formatMonthlyCost } from "../../lib/architecture/implementationStats";

// Inside a component's technology picker: what each technology would do to the whole design
// (score, p95, monthly cost, uptime), coloured better/worse against the current choice.
// Clicking a row switches to that technology.

type Column = { label: string; value: (o: WhatIfOption) => number; format: (n: number) => string; higherIsBetter: boolean };

const COLUMNS: Column[] = [
  { label: "Score", value: (o) => o.summary.score, format: String, higherIsBetter: true },
  { label: "p95", value: (o) => o.summary.p95LatencyMs, format: formatLatency, higherIsBetter: false },
  { label: "Cost", value: (o) => o.summary.monthlyCost, format: (n) => formatMonthlyCost(n).replace("/mo", ""), higherIsBetter: false },
  { label: "Uptime", value: (o) => o.summary.uptimePercent, format: (n) => `${n}%`, higherIsBetter: true },
];

function tone(value: number, current: number, higherIsBetter: boolean): "better" | "worse" | undefined {
  // Ignore differences that would not show after rounding.
  if (Math.abs(value - current) < 1e-6 * Math.max(1, Math.abs(current))) return undefined;
  return (value > current) === higherIsBetter ? "better" : "worse";
}

export function DesignComparisonTable({ whatIf, onChoose }: { whatIf: WhatIf; onChoose: (id: string) => void }) {
  if (!whatIf.ready || whatIf.options.length < 2) return null;
  const current = whatIf.options.find((option) => option.current) ?? whatIf.options[0];
  return (
    <details className="ax-whatif" open>
      <summary>In this design</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Technology</th>
            {COLUMNS.map((column) => (
              <th key={column.label} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {whatIf.options.map((option) => (
            <tr
              key={option.implementation.id}
              aria-current={option.current || undefined}
              onClick={() => !option.current && onChoose(option.implementation.id)}
              title={option.current ? "Current technology" : `Switch to ${option.implementation.name}`}
            >
              <th scope="row">
                {option.current ? (
                  option.implementation.name
                ) : (
                  <button
                    type="button"
                    className="ax-whatif-pick"
                    onClick={(event) => {
                      event.stopPropagation();
                      onChoose(option.implementation.id);
                    }}
                  >
                    {option.implementation.name}
                  </button>
                )}
              </th>
              {COLUMNS.map((column) => {
                const value = column.value(option);
                return (
                  <td key={column.label} data-tone={option.current ? undefined : tone(value, column.value(current), column.higherIsBetter)}>
                    {column.format(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
