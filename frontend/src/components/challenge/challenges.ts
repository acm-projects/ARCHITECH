export type ChallengeDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type TrafficStat = {
  label: string;
  value: string;
};

export type Challenge = {
  id: string;
  title: string;
  difficulty: ChallengeDifficulty;
  description: string;
  requirements: string[];
  // Short lines for the floating challenge card.
  summary: string[];
  highlights: string[];
  // Display-only for now; no calculations read these values.
  traffic: TrafficStat[];
};

export const urlShortenerChallenge: Challenge = {
  id: "url-shortener",
  title: "Design a URL Shortener",
  difficulty: "Intermediate",
  description:
    "Design a URL shortening service that can create short URLs and redirect users to their original destination.",
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
};
