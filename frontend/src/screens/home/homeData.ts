import type { Mode } from "../../types";

export type ProjectTone = "purple" | "yellow" | "pink" | "blue";

export interface ProjectSummary {
  name: string;
  mode: Mode;
  meta: string;
  tone: ProjectTone;
}

export interface ChallengeSummary {
  name: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  scale: string;
  time: string;
}

export interface TutorialCompany {
  company: string;
  title: string;
  className: string;
}

export interface DashboardSearchItem {
  name: string;
  meta: string;
  mode: Mode;
}

export const PROJECTS: ProjectSummary[] = [
  { name: "E-commerce checkout", mode: "learn", meta: "Payments · inventory · idempotency", tone: "purple" },
  { name: "Global URL shortener", mode: "challenge", meta: "Partitioning · caching · redirects", tone: "yellow" },
  { name: "Netflix streaming", mode: "learn", meta: "CDN · encoding · playback", tone: "pink" },
  { name: "Realtime chat", mode: "learn", meta: "WebSockets · presence · fan-out", tone: "blue" },
  { name: "Payment processor", mode: "challenge", meta: "Ledger · retries · idempotency", tone: "yellow" },
  { name: "Photo feed", mode: "learn", meta: "Fan-out · media · ranking", tone: "purple" },
  { name: "Search autocomplete", mode: "learn", meta: "Prefix index · caching · latency", tone: "blue" },
  { name: "Event ticketing", mode: "learn", meta: "Contention · queues · consistency", tone: "pink" },
  { name: "Analytics pipeline", mode: "learn", meta: "Ingestion · streams · storage", tone: "purple" },
];

export const CHALLENGES: ChallengeSummary[] = [
  { name: "Design a URL Shortener", difficulty: "Intermediate", scale: "10k redirects/sec", time: "24 min" },
  { name: "Design Instagram Feed", difficulty: "Advanced", scale: "500M daily users", time: "45 min" },
  { name: "Design a Rate Limiter", difficulty: "Beginner", scale: "1M rules/sec", time: "20 min" },
  { name: "Design a Chat System", difficulty: "Intermediate", scale: "Realtime delivery", time: "35 min" },
  { name: "Design YouTube", difficulty: "Advanced", scale: "Global video delivery", time: "50 min" },
  { name: "Design a Web Crawler", difficulty: "Intermediate", scale: "10B pages", time: "40 min" },
];

export const TUTORIAL_COMPANIES: TutorialCompany[] = [
  { company: "Google", title: "Search at global scale", className: "google" },
  { company: "Netflix", title: "Video streaming", className: "netflix" },
  { company: "Uber", title: "Realtime dispatch", className: "uber" },
  { company: "Discord", title: "Realtime communities", className: "discord" },
  { company: "Airbnb", title: "Global marketplace", className: "airbnb" },
  { company: "Spotify", title: "Music streaming", className: "spotify" },
];


export const DASHBOARD_TOUR = [
  ["Welcome to your studio", "This is your home for projects, practice, and guided architecture lessons."],
  ["Saved locally", "Projects are stored in this browser and reopen with their latest canvas state."],
  ["Continue recent work", "Open any project card to return to its latest architecture snapshot."],
  ["Start a new architecture", "Create a blank canvas whenever you want to explore a new system."],
  ["Learn from real systems", "Construct Google, Netflix, and Uber node-by-node with WHY explanations."],
  ["Challenge yourself", "Solve measurable prompts and earn a score based on correctness and time."],
  ["Your intelligent canvas", "Zoom, pan, multi-select, annotate, and test architecture behavior."],
  ["AI Architect is ready", "Ask for explanations or start a guided build whenever you need help."],
] as const;

export const BEGINNER_DASHBOARD_TOUR = [
  "This is your home. Think of it like a folder where all your drawings and lessons live.",
  "Your projects are saved in this browser so you can leave and reopen the latest canvas state.",
  "Click any card to reopen a design you already started. Nothing is lost.",
  "Use New project when you want a fresh drawing canvas. You can always change it later.",
  "These lessons build famous systems one small piece at a time and explain every new box.",
  "Challenges are practice puzzles. Meet the numbers on the right to finish them.",
  "Drag boxes, connect them, then press Run Test to watch a request move through your system.",
  "If you get stuck, ask AI Architect. It will explain what happened using simple steps.",
] as const;

export const ADVANCED_DASHBOARD_TOUR = [
  "Review active architectures, simulations, and constraint-driven exercises.",
  "Project state is versioned locally and restored when you reopen an architecture.",
  "Resume from the latest saved topology and performance baseline.",
  "Start a new topology and model its capacity assumptions.",
  "Deconstruct production systems and evaluate their architectural tradeoffs.",
  "Practice against latency, availability, throughput, and budget constraints.",
  "Use layer filters, failure injection, and live metrics to validate the design.",
  "Use AI Architect for bottleneck analysis, failure replication, and alternatives.",
] as const;


export function getDashboardSearchItems(query: string): DashboardSearchItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const items: DashboardSearchItem[] = [
    ...PROJECTS.map(({ name, mode, meta }) => ({
      name,
      meta: `${mode === "challenge" ? "Challenge" : "Learn"} · ${meta}`,
      mode,
    })),
    ...CHALLENGES.map(({ name, difficulty, scale }) => ({
      name,
      meta: `${difficulty} · ${scale}`,
      mode: "challenge" as const,
    })),
  ];

  if (!normalizedQuery) return items.slice(0, 8);

  return items
    .filter(
      ({ name, meta }) =>
        name.toLowerCase().includes(normalizedQuery) ||
        meta.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 8);
}
