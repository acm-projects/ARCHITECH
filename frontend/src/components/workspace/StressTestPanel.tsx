"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";

import {
  BASELINE_REQUESTS_PER_SECOND,
  STRESS_MULTIPLIERS,
  parseRequestRate,
  stressRate,
  type TrafficProfile,
} from "../../lib/architecture/evaluation/traffic";

type StressTestPanelProps = {
  // The load the next run will use.
  traffic: TrafficProfile;
  embedded?: boolean;
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
  embedded = false,
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
    <div className="ax-card ax-learn ax-stress" data-stress-panel data-embedded={embedded || undefined}>
      <span className="ax-panel-title" hidden={embedded}>Stress test</span>

      <label className="ax-stress-rate mt-3 flex items-baseline justify-between gap-3 text-(length:--ax-t-sm)">
        <span>Request rate</span>
        <span className="flex items-baseline gap-1">
          <input
            // Remounted when the rate changes elsewhere (a preset, Reset), so it never shows a stale value.
            key={rate}
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
            className="ax-field ax-stress-input w-20 py-0.5 text-right tabular-nums"
          />
          <span className="ax-card-label">req/s</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="ax-card-label mt-1">
          {error}
        </p>
      )}

      <ul className="ax-stress-presets mt-3 flex gap-1.5" aria-label="Traffic multiples of the baseline load">
        {STRESS_MULTIPLIERS.map((multiplier) => {
          const target = stressRate(multiplier);
          return (
            <li key={multiplier}>
              <button
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
                className="ax-action ax-stress-preset"
              >
                {multiplier}×
              </button>
            </li>
          );
        })}
      </ul>
      <p className="ax-card-label mt-2">Baseline {format(BASELINE_REQUESTS_PER_SECOND)} req/s</p>

      <button
        type="button"
        aria-disabled={running}
        onClick={() => {
          if (!running) onRun();
        }}
        className="ax-card-link ax-stress-run"
      >
        {runLabel ?? `Run at ${format(rate)} req/s \u2192`}
      </button>
    </div>
  );
}

// Keep the existing rate validation and presets mounted while the native popover is closed.
// Only the explicit Run action or a preset calls the shared evaluation session.
export function RunControl({ popoverRef, onHeightChange, onRun, onRunAtRate, ...props }: Omit<StressTestPanelProps, "embedded" | "runLabel"> & {
  popoverRef: RefObject<HTMLDivElement | null>;
  onHeightChange: (height: number) => void;
}) {
  const [open, setOpen] = useState(false);
  // Validation messages and wrapping can change the popup's height while it is open.
  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!open || !element) return;
    const measure = () => onHeightChange(element.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [open, popoverRef, onHeightChange]);
  const run = (action: () => void) => {
    if (props.running) return;
    popoverRef.current?.hidePopover();
    action();
  };

  return (
    <>
      <button
        type="button"
        popoverTarget="ax-run-settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={props.running}
        disabled={props.running}
        className="ax-action ax-action-primary ax-run-trigger"
      >
        Run <ChevronDown size={12} aria-hidden="true" />
      </button>
      <div
        id="ax-run-settings"
        popover="auto"
        role="dialog"
        aria-label="Run settings"
        ref={popoverRef}
        onToggle={(event) => setOpen(event.currentTarget.matches(":popover-open"))}
        className="ax-run-popover"
      >
        <h2>Stress test</h2>
        <StressTestPanel
          {...props}
          embedded
          runLabel="Run"
          onRun={() => run(onRun)}
          onRunAtRate={(rate) => run(() => onRunAtRate(rate))}
        />
      </div>
    </>
  );
}
