"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  BASELINE_REQUESTS_PER_SECOND,
  STRESS_MULTIPLIERS,
  parseRequestRate,
  stressRate,
  type TrafficProfile,
} from "../../lib/architecture/evaluation/traffic";
import { PanelAction, PanelActions, PanelField, PanelGroup, PanelText } from "./panel/Panel";

type StressTestPanelProps = {
  // The load the next run will use.
  traffic: TrafficProfile;
  runLabel?: string;
  running: boolean;
  // Changes the load without running (the result on screen then reads as out of date).
  onRateChange: (requestsPerSecond: number) => void;
  // Runs the design at the current load.
  onRun: () => void;
  // Sets the load and runs the design at it.
  onRunAtRate: (requestsPerSecond: number) => void;
};

const format = (value: number) => Math.round(value).toLocaleString("en-US");

// Request rate control for Run Design. It only changes the load handed to the shared
// evaluation; what it finds (demand against capacity, bottlenecks, health) is reported by the
// system review.
export default function StressTestPanel({
  traffic,
  runLabel,
  running,
  onRateChange,
  onRun,
  onRunAtRate,
}: StressTestPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const rate = traffic.requestsPerSecond;

  const commit = (text: string) => {
    const parsed = parseRequestRate(text);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (parsed.value !== rate) onRateChange(parsed.value);
  };

  return (
    <section aria-label="Traffic" data-stress-panel>
      <PanelGroup>
        <PanelField
          label="Request rate"
          htmlFor="ax-request-rate"
          title={`Baseline ${format(BASELINE_REQUESTS_PER_SECOND)} req/s`}
          control={
            <>
              <input
                // Remounted when the rate changes elsewhere (a preset, Reset), so it never shows a stale value.
                key={rate}
                id="ax-request-rate"
                defaultValue={format(rate)}
                inputMode="numeric"
                aria-label="Request rate (req/s)"
                aria-invalid={error !== null}
                onBlur={(event) => commit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = format(rate);
                    setError(null);
                    event.currentTarget.blur();
                  }
                }}
                className="axp-input axp-input-number axp-input-end"
              />
              <span className="axp-unit">req/s</span>
            </>
          }
        />
        {error && <PanelText role="alert" tone="danger">{error}</PanelText>}
        <PanelActions>
          <div className="axp-segments" role="group" aria-label="Traffic multiples of the baseline load">
            {STRESS_MULTIPLIERS.map((multiplier) => {
              const target = stressRate(multiplier);
              return (
                <button
                  key={multiplier}
                  type="button"
                  aria-label={`Run ${multiplier}× traffic test`}
                  aria-pressed={rate === target}
                  aria-disabled={running}
                  title={`${format(target)} req/s`}
                  onClick={() => {
                    if (running) return;
                    setError(null);
                    onRunAtRate(target);
                  }}
                >
                  {multiplier}×
                </button>
              );
            })}
          </div>
          <PanelAction
            variant="primary"
            aria-disabled={running}
            onClick={() => {
              if (!running) onRun();
            }}
          >
            {runLabel ?? `Run at ${format(rate)} req/s`}
          </PanelAction>
        </PanelActions>
      </PanelGroup>
    </section>
  );
}

// The header opens the Run inspector; testing stays in the existing run session.
export function RunControl({ open, running, onToggle }: {
  open: boolean;
  running: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-controls="ax-run-panel"
      aria-expanded={open}
      aria-busy={running}
      disabled={running}
      className="ax-action ax-action-primary ax-run-trigger"
    >
      Run <ChevronDown size={12} aria-hidden="true" />
    </button>
  );
}
