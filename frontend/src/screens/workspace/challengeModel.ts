export interface ChallengeMetrics {
  hasRun: boolean;
  effectiveTraffic: number;
  p95Latency: number;
  availability: number;
  monthlyCost: number;
}

export interface ChallengeRequirement {
  id: "throughput" | "latency" | "availability" | "cost";
  label: string;
  target: string;
  value: string;
  met: boolean;
}

export interface ChallengeEvaluation {
  requirements: ChallengeRequirement[];
  metCount: number;
  complete: boolean;
}

export function evaluateChallenge(metrics: ChallengeMetrics): ChallengeEvaluation {
  const requirements: ChallengeRequirement[] = [
    {
      id: "throughput",
      label: "Throughput",
      target: "Need 10k requests/sec",
      value: metrics.hasRun
        ? `${(metrics.effectiveTraffic / 1000).toFixed(1)}k/s`
        : "Run test",
      met: metrics.hasRun && metrics.effectiveTraffic >= 10_000,
    },
    {
      id: "latency",
      label: "Latency",
      target: "Must be under 100ms",
      value: metrics.hasRun ? `${Math.round(metrics.p95Latency)}ms` : "—",
      met: metrics.hasRun && metrics.p95Latency <= 100,
    },
    {
      id: "availability",
      label: "Availability",
      target: "Need at least 99.99%",
      value: metrics.hasRun ? `${metrics.availability.toFixed(3)}%` : "—",
      met: metrics.hasRun && metrics.availability >= 99.99,
    },
    {
      id: "cost",
      label: "Monthly budget",
      target: "Stay under $800",
      value: `$${Math.round(metrics.monthlyCost)}`,
      met: metrics.hasRun && metrics.monthlyCost <= 800,
    },
  ];

  const metCount = requirements.filter((requirement) => requirement.met).length;

  return {
    requirements,
    metCount,
    complete: metrics.hasRun && metCount === requirements.length,
  };
}
