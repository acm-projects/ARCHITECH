import type { ArchitectureNodeType } from "../../lib/architecture/types.ts";
import { createWalkthrough, type BreakdownConnection } from "./walkthrough.ts";

const REPO = "https://github.com/acm-projects/ARCHITECH/blob/main";

export const ARCHITECH_SOURCES = {
  evaluation: { title: "ARCHITECH · Metrics model", href: `${REPO}/docs/metrics-model.md` },
  nextjs: { title: "Next.js · Route handlers", href: "https://nextjs.org/docs/app/building-your-application/routing/route-handlers" },
  vercel: { title: "Vercel · Edge network", href: "https://vercel.com/docs/edge-network/overview" },
  auth: { title: "NextAuth.js · Providers and sessions", href: "https://next-auth.js.org/configuration/options" },
  schema: { title: "ARCHITECH · Prisma schema", href: `${REPO}/frontend/prisma/schema.prisma` },
  prisma: { title: "Prisma · PostgreSQL", href: "https://www.prisma.io/docs/orm/overview/databases/postgresql" },
  usage: { title: "ARCHITECH · AI limits and reply cache", href: `${REPO}/frontend/src/lib/ai/usage.ts` },
  anthropic: { title: "Anthropic · Streaming messages", href: "https://docs.anthropic.com/en/docs/build-with-claude/streaming" },
  compose: { title: "ARCHITECH · Compose export", href: `${REPO}/frontend/src/lib/architecture/export/dockerCompose.ts` },
  docker: { title: "Docker · Compose file reference", href: "https://docs.docker.com/reference/compose-file/" },
  ci: { title: "ARCHITECH · CI workflow", href: `${REPO}/.github/workflows/ci.yml` },
  actions: { title: "GitHub Actions · Workflow syntax", href: "https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions" },
} as const;

type SourceId = keyof typeof ARCHITECH_SOURCES;
export const ARCHITECH_CHAPTERS = ["Editing", "Review", "Shipping"] as const;

type ArchitechComponent = {
  id: string;
  label: string;
  role: string;
  type: ArchitectureNodeType;
  chapter: typeof ARCHITECH_CHAPTERS[number];
  position: { x: number; y: number };
  explanation: string;
  why: string;
  flow: string;
  tradeoff: string;
  sources: readonly SourceId[];
};

// The app this breakdown runs in. Route handlers that share one deployment are split by
// responsibility so each connection stays readable.
export const ARCHITECH_COMPONENTS = [
  {
    chapter: "Editing",
    id: "designer", label: "Designer", role: "Browser · React canvas", type: "client",
    position: { x: 0, y: 200 },
    explanation: "This is ARCHITECH in your browser. The canvas, the component library and the metrics all run here in React and TypeScript. Moving a component or swapping a technology recalculates cost, latency and availability without asking the server.",
    why: "Metrics change on every edit. A server round trip per drag would make the canvas lag and spend requests on nothing.",
    flow: "The browser loads the app through Vercel. It calls the API to sign in and save projects, and Archie to review a design.",
    tradeoff: "Anything computed in the browser can be changed by the person using it. Results that count, such as challenge scores, are graded again on the server.",
    sources: ["evaluation", "nextjs"],
  },
  {
    chapter: "Editing",
    id: "edge", label: "Vercel", role: "Edge · static assets", type: "cdn",
    position: { x: 240, y: 200 },
    explanation: "Vercel hosts the Next.js app. Its edge network serves the built pages, scripts and images from a location near you, and forwards /api requests to server functions.",
    why: "Built files do not change between deploys, so they can be cached close to the designer. Only API calls need a server.",
    flow: "Designer → Vercel. Static files return from the edge; /api requests go on to the route handlers.",
    tradeoff: "Server functions start on demand. A cold start delays the first request, and long work has to finish inside the function's time limit.",
    sources: ["vercel", "nextjs"],
  },
  {
    chapter: "Editing",
    id: "api", label: "Next.js API", role: "Route handlers · Node.js", type: "server",
    position: { x: 480, y: 280 },
    explanation: "The API is a set of Next.js route handlers on Node.js. It saves projects and their versions, imports GitHub repositories, records practice attempts and grades challenge submissions.",
    why: "One codebase serves the pages and the API, so the browser and the server share TypeScript types and the same evaluation code.",
    flow: "Vercel → API. The API checks the session with NextAuth, then reads or writes PostgreSQL through Prisma.",
    tradeoff: "An API inside the web app is simple to deploy, but it scales with the app. One heavy endpoint cannot be scaled on its own without splitting it out.",
    sources: ["nextjs", "schema"],
  },
  {
    chapter: "Editing",
    id: "auth", label: "NextAuth", role: "GitHub, Google, email", type: "auth",
    position: { x: 720, y: 280 },
    explanation: "NextAuth signs people in with GitHub, Google, or an email and password. It issues a signed session token that the API checks on every request.",
    why: "Every project belongs to someone. The API has to know who is asking before it returns or changes a design.",
    flow: "The API asks NextAuth for the session. NextAuth keeps accounts in PostgreSQL. Sign-in attempts are counted there too: five failures in 15 minutes lock that email for a while.",
    tradeoff: "A signed token saves a database lookup on each request, but it cannot be withdrawn early. It stays valid until it expires.",
    sources: ["auth", "schema"],
  },
  {
    chapter: "Editing",
    id: "db", label: "PostgreSQL", role: "Prisma · projects & users", type: "database",
    position: { x: 720, y: 160 },
    explanation: "PostgreSQL holds users, projects, saved versions, challenge submissions, and Archie's usage records and reply cache. Prisma maps the tables to TypeScript and ships schema changes as migrations.",
    why: "Designs must survive a refresh, another device and a redeploy. Server functions keep nothing between requests, so state lives here.",
    flow: "The API, NextAuth and Archie all read and write through Prisma. A project is stored as its graph, not as a drawing.",
    tradeoff: "Server functions open many short-lived connections. Without pooling, a traffic spike can use up PostgreSQL's connection limit before the CPU is busy.",
    sources: ["schema", "prisma"],
  },
  {
    chapter: "Review",
    id: "archie", label: "Archie", role: "Design review · limits", type: "server",
    position: { x: 480, y: 40 },
    explanation: "Archie reviews the design on the canvas. The browser sends the graph and traffic profile; this route checks the person's limits, asks a model, and streams the answer back as it is written.",
    why: "Model calls are slow and cost money. Per-person and global limits stop one person, or everyone together, from using up the provider quota.",
    flow: "Vercel → Archie → model provider. Archie first reserves a request in PostgreSQL; the same question about the same design is answered from the cache.",
    tradeoff: "A cached reply is instant and free, but it only matches an identical design and question. A small edit means a new model call.",
    sources: ["usage", "anthropic"],
  },
  {
    chapter: "Review",
    id: "model", label: "Model provider", role: "Claude, Groq or Gemini", type: "api",
    position: { x: 720, y: 40 },
    explanation: "The model is an external API. The server picks Claude, Groq or Gemini from its environment, so the key never reaches the browser.",
    why: "With the provider behind one route, it can be changed without touching the canvas.",
    flow: "Archie sends the design and the conversation. The provider streams text and proposed changes back; each change is checked before the canvas offers it.",
    tradeoff: "An external API can be slow, busy or down. Archie reports the error, says when to retry, and refunds the question.",
    sources: ["usage", "anthropic"],
  },
  {
    chapter: "Shipping",
    id: "export", label: "Docker export", role: "Compose & runnable app", type: "worker",
    position: { x: 480, y: 520 },
    explanation: "A design can leave ARCHITECH as files. The export turns a saved graph into a docker-compose.yml, or a zip with a small app you can run, so its services start on your machine.",
    why: "A design that runs is easier to check than one that only looks right. The same file imports back without loss.",
    flow: "API → export. The route reads the saved project, builds the files and returns them as a download.",
    tradeoff: "Generated services are a starting point. A managed product, such as a hosted queue, becomes a local stand-in that behaves differently under real load.",
    sources: ["compose", "docker"],
  },
  {
    chapter: "Shipping",
    id: "ci", label: "GitHub Actions", role: "Test · typecheck · build", type: "worker",
    position: { x: 240, y: 520 },
    explanation: "Every push runs the checks: unit tests, TypeScript, a production build, and API tests against a fresh PostgreSQL. A change that fails is flagged before it reaches main.",
    why: "The canvas, the metrics and challenge grading share code. A change in one place can break another, and the checks catch it before designers do.",
    flow: "Git → GitHub Actions → Vercel. Checks run on pull requests and on main; main is what gets deployed.",
    tradeoff: "Thorough checks slow down every push. Cancelling runs for commits that were already replaced keeps the queue short.",
    sources: ["ci", "actions"],
  },
  {
    chapter: "Shipping",
    id: "git", label: "Git", role: "Source · main branch", type: "custom",
    position: { x: 0, y: 520 },
    explanation: "The source lives in a Git repository on GitHub. A change is a commit on a branch and reaches main through a pull request.",
    why: "History ties every deploy to a change, and a bad change can be reverted.",
    flow: "A push or pull request starts GitHub Actions.",
    tradeoff: "Small, frequent merges keep conflicts small but run CI more often. Large batches save runs but are harder to review and to revert.",
    sources: ["ci", "actions"],
  },
] as const satisfies readonly ArchitechComponent[];

export type ArchitechComponentId = typeof ARCHITECH_COMPONENTS[number]["id"];

export type ArchitechConnection = BreakdownConnection<ArchitechComponentId> & { kind: "request" | "data" | "delivery" };

export const ARCHITECH_CONNECTIONS: readonly ArchitechConnection[] = [
  { id: "designer-edge", source: "designer", target: "edge", kind: "request", purpose: "Load the app and send API requests" },
  { id: "edge-api", source: "edge", target: "api", label: "/api", kind: "request", purpose: "Forward API requests to route handlers" },
  { id: "api-auth", source: "api", target: "auth", label: "session", kind: "request", purpose: "Check who is signed in" },
  { id: "api-db", source: "api", target: "db", kind: "data", purpose: "Read and write projects and versions" },
  {
    id: "auth-db", source: "auth", target: "db", kind: "data", purpose: "Store accounts and count sign-in attempts",
    sourcePort: { id: "accounts-out", side: "top" }, targetPort: { id: "accounts-in", side: "bottom" },
  },
  { id: "edge-archie", source: "edge", target: "archie", label: "review", kind: "request", purpose: "Send the design for review" },
  { id: "archie-db", source: "archie", target: "db", kind: "data", purpose: "Reserve a request and look up cached replies" },
  { id: "archie-model", source: "archie", target: "model", kind: "request", purpose: "Ask the model about the design" },
  {
    id: "api-export", source: "api", target: "export", label: "saved graph", kind: "data", purpose: "Build compose and app files from a saved project",
    sourcePort: { id: "export-out", side: "bottom" }, targetPort: { id: "export-in", side: "top" },
  },
  {
    id: "ci-edge", source: "ci", target: "edge", label: "deploy", kind: "delivery", purpose: "Publish a build that passed",
    sourcePort: { id: "deploy-out", side: "top" }, targetPort: { id: "deploy-in", side: "bottom" },
  },
  { id: "git-ci", source: "git", target: "ci", label: "push", kind: "delivery", purpose: "Start checks on each push and pull request", labelBelow: true },
];

export const ARCHITECH_REVIEW = "That's ARCHITECH itself. The canvas and its metrics run in your browser. Next.js route handlers save projects to PostgreSQL behind NextAuth, and Archie reviews designs through an external model with limits and a cache. Git and GitHub Actions check every change before it ships. Select a component to go over its connections again.";

export const ARCHITECH_NOTES = {
  scope: "This is the app you are using, grouped by responsibility. Archie, the API, sign-in and exports are route handlers in one Next.js deployment, drawn apart so their connections stay readable. Logging, health checks and GitHub import are not drawn. Live previews are simulations.",
  caveat: "Hosting is shown as Vercel. Links to ARCHITECH files point at the main branch.",
} as const;

const walkthrough = createWalkthrough(ARCHITECH_COMPONENTS, ARCHITECH_CONNECTIONS);

export const ARCHITECH_NODES = walkthrough.nodes;
export const ARCHITECH_STEPS = walkthrough.steps;
export { walkthrough as ARCHITECH_WALKTHROUGH };
