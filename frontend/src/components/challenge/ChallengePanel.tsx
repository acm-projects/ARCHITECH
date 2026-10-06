"use client";

import { useState } from "react";

import type { Challenge } from "./challenges";

const labelClass =
  "text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500";

// Placeholder rows until a scoring engine exists; no values are computed.
const DESIGN_CHECK_CATEGORIES = [
  "Scalability",
  "Reliability",
  "Cost Efficiency",
  "Latency",
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-200 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ChallengePanel({ challenge }: { challenge: Challenge }) {
  const [showCheck, setShowCheck] = useState(false);

  return (
    <aside className="flex max-h-72 shrink-0 flex-col overflow-y-auto border-t border-neutral-200 md:max-h-none md:w-72 md:border-l md:border-t-0">
      <h2 className={`border-b border-neutral-200 px-4 py-3 ${labelClass}`}>
        Challenge
      </h2>

      <div className="flex-1 space-y-4 px-4 py-3 text-sm">
        {showCheck ? (
          <section>
            <h3 className={labelClass}>Design check</h3>
            <dl className="mt-2">
              {DESIGN_CHECK_CATEGORIES.map((category) => (
                <Row key={category} label={category} value="—" />
              ))}
            </dl>
            <p className="mt-3 text-neutral-500">
              Scoring engine will evaluate your architecture here.
            </p>
          </section>
        ) : (
          <>
            <div>
              <h3 className="text-base font-semibold">{challenge.title}</h3>
              <p className={`mt-1 ${labelClass}`}>{challenge.difficulty}</p>
            </div>
            <p>{challenge.description}</p>

            <section>
              <h3 className={labelClass}>Requirements</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {challenge.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className={labelClass}>Traffic</h3>
              <dl className="mt-2">
                {challenge.traffic.map((stat) => (
                  <Row key={stat.label} label={stat.label} value={stat.value} />
                ))}
              </dl>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-neutral-200 px-4 py-3 text-sm">
        {showCheck ? (
          <button
            type="button"
            onClick={() => setShowCheck(false)}
            className="text-neutral-500 transition-colors hover:text-[#0A0A0A] motion-reduce:transition-none"
          >
            ← Back to requirements
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowCheck(true)}
            className="w-full bg-[#0A0A0A] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-80 motion-reduce:transition-none"
          >
            Run design →
          </button>
        )}
      </div>
    </aside>
  );
}
