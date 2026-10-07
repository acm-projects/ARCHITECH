import {
  DEFAULT_CHALLENGE_SCORING,
  type ChallengeDefinition,
  type ChallengeDifficulty,
} from "../../lib/architecture/challenge/contract.ts";

export type { ChallengeDifficulty };

export type TrafficStat = {
  label: string;
  value: string;
};

// What a challenge card shows, plus the definition that is actually judged. The text lists
// are for people; the definition's requirements and traffic are what the evaluator checks.
export type Challenge = {
  id: string;
  title: string;
  difficulty: ChallengeDifficulty;
  description: string;
  requirements: string[];
  // Short lines for the floating challenge card.
  summary: string[];
  highlights: string[];
  // Display-only: the load behind the definition's traffic, in everyday terms.
  traffic: TrafficStat[];
  definition: ChallengeDefinition;
};

// 100M redirects a day is about 1,160 a second on average. Traffic is bursty, so the design
// is judged at roughly ten times that, with 10 reads for every write.
export const urlShortenerDefinition: ChallengeDefinition = {
  id: "url-shortener",
  title: "Design a URL Shortener",
  difficulty: "Intermediate",
  description:
    "Design a URL shortening service that can create short URLs and redirect users to their original destination.",
  traffic: {
    requestsPerSecond: 11_500,
    readRatio: 91,
    datasetGb: 200,
    networkLatencyMs: 40,
  },
  requirements: [
    {
      id: "capacity",
      kind: "min-capacity",
      minRps: 11_500,
      label: "Handle peak traffic (about 11,500 requests per second)",
      mandatory: true,
      weight: 3,
    },
    {
      id: "backend",
      kind: "requires-component",
      componentType: "server",
      label: "Run an API server to create and resolve short URLs",
      mandatory: true,
      weight: 1,
    },
    {
      id: "storage",
      kind: "requires-component",
      componentType: "database",
      label: "Store short URLs in a database so they survive restarts",
      mandatory: true,
      weight: 2,
    },
    {
      id: "fast-redirects",
      kind: "max-latency",
      maxP95Ms: 100,
      label: "Redirects are fast (p95 under 100 ms)",
      weight: 2,
    },
    {
      id: "available",
      kind: "min-availability",
      minPercent: 99.9,
      label: "Short URLs stay available (99.9% uptime)",
      weight: 2,
    },
  ],
  constraints: [
    {
      id: "budget",
      kind: "max-cost",
      maxMonthlyCost: 800,
      label: "Stay under $800 a month",
      weight: 1,
    },
    {
      id: "size",
      kind: "max-components",
      max: 12,
      label: "Use no more than 12 components",
      weight: 1,
    },
  ],
  scoring: DEFAULT_CHALLENGE_SCORING,
};

export const urlShortenerChallenge: Challenge = {
  id: urlShortenerDefinition.id,
  title: urlShortenerDefinition.title,
  difficulty: urlShortenerDefinition.difficulty,
  description: urlShortenerDefinition.description,
  requirements: [
    "100M redirects per day",
    "10M new short URLs per day",
    "Redirects should be fast",
    "Shortened URLs must remain available",
    "System should scale as traffic grows",
  ],
  summary: ["100M redirects / day", "10M new URLs / day"],
  highlights: ["Fast redirects", "High availability", "Scales with traffic"],
  traffic: [
    { label: "Daily reads", value: "100M" },
    { label: "Daily writes", value: "10M" },
    { label: "Read / Write", value: "10:1" },
  ],
  definition: urlShortenerDefinition,
};
