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
  // One line stating the task and its scale, for the dashboard announcement.
  announcement: string;
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
    // Redirects are API requests; a URL shortener serves no static files at this scale.
    staticShare: 0,
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
  announcement: "Design a URL shortener for 100M redirects a day",
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

// A streaming service at the scale of a busy evening: 50,000 requests a second, nine in ten
// of them video segments and artwork. The API tier only sees the remaining tenth, so the
// design is judged on keeping video off the servers as much as on the servers themselves.
// The dataset is catalogue and viewing data; video files live in object storage.
export const netflixStreamingDefinition: ChallengeDefinition = {
  id: "netflix-streaming",
  title: "Design a Video Streaming Service",
  difficulty: "Advanced",
  description:
    "Design a service that lets members browse a catalogue and play video, with video delivered close to the viewer.",
  traffic: {
    requestsPerSecond: 50_000,
    concurrentUsers: 200_000,
    readRatio: 98,
    staticShare: 90,
    datasetGb: 500,
    networkLatencyMs: 30,
  },
  requirements: [
    {
      id: "capacity",
      kind: "min-capacity",
      minRps: 50_000,
      label: "Handle peak traffic (about 50,000 requests per second)",
      mandatory: true,
      weight: 3,
    },
    {
      id: "edge-delivery",
      kind: "requires-component",
      componentType: "cdn",
      label: "Deliver video from a CDN close to viewers",
      mandatory: true,
      weight: 2,
    },
    {
      id: "video-storage",
      kind: "requires-component",
      componentType: "object-storage",
      label: "Keep video files in object storage",
      mandatory: true,
      weight: 1,
    },
    {
      id: "backend",
      kind: "requires-component",
      componentType: "server",
      label: "Run an API server for browsing and playback",
      mandatory: true,
      weight: 1,
    },
    {
      id: "catalogue",
      kind: "requires-component",
      componentType: "database",
      label: "Store the catalogue and viewing history in a database",
      weight: 1,
    },
    {
      id: "fast-start",
      kind: "max-latency",
      maxP95Ms: 120,
      label: "Playback starts fast (p95 under 120 ms)",
      weight: 2,
    },
    {
      id: "available",
      kind: "min-availability",
      minPercent: 99.9,
      label: "Streaming stays available (99.9% uptime)",
      weight: 2,
    },
  ],
  constraints: [
    {
      id: "budget",
      kind: "max-cost",
      maxMonthlyCost: 1_500,
      label: "Stay under $1,500 a month",
      weight: 1,
    },
    {
      id: "size",
      kind: "max-components",
      max: 16,
      label: "Use no more than 16 components",
      weight: 1,
    },
  ],
  scoring: DEFAULT_CHALLENGE_SCORING,
};

export const netflixStreamingChallenge: Challenge = {
  id: netflixStreamingDefinition.id,
  title: netflixStreamingDefinition.title,
  difficulty: netflixStreamingDefinition.difficulty,
  description: netflixStreamingDefinition.description,
  announcement: "Design a video streaming service for 50,000 requests a second",
  requirements: [
    "Members browse the catalogue and press play",
    "Video segments make up 90% of requests",
    "Playback should start quickly",
    "Streaming must stay available",
    "Video servers sit close to viewers",
  ],
  summary: ["50,000 requests / second", "90% video segments"],
  highlights: ["Edge delivery", "Fast playback start", "High availability"],
  traffic: [
    { label: "Peak requests", value: "50k/s" },
    { label: "Video share", value: "90%" },
    { label: "Read / Write", value: "49:1" },
  ],
  definition: netflixStreamingDefinition,
};
