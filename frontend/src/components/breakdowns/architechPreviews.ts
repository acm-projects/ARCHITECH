import type { PreviewFrame } from "./livePreview.ts";
import type { ARCHITECH_STEPS } from "./architech.ts";

export type ArchitechStepId = typeof ARCHITECH_STEPS[number];

// What a designer would notice, in everyday words. Archie's panel carries the system terms.
// Simulated: no real accounts, projects or measurements.
export const ARCHITECH_PREVIEWS: Record<ArchitechStepId, readonly PreviewFrame[]> = {
  designer: [
    { caption: "You add a server", ms: 1_000, connections: ["designer-edge"] },
    { caption: "You connect a database", ms: 1_100, connections: ["designer-edge"] },
    { caption: "The numbers update at once", ms: 1_200, connections: ["designer-edge"] },
    { caption: "Saved when you pause", ms: 1_300, connections: ["designer-edge", "edge-api"] },
  ],
  edge: [
    { caption: "You open ARCHITECH", ms: 1_000, connections: ["designer-edge"] },
    { caption: "The page comes from nearby", ms: 1_200, connections: ["designer-edge"] },
    { caption: "Saving goes to the server", ms: 1_200, connections: ["edge-api"] },
    { caption: "Questions go to Archie", ms: 1_200, connections: ["edge-archie"] },
  ],
  api: [
    { caption: "You stop editing", ms: 900, connections: ["edge-api"] },
    { caption: "Is this your project?", ms: 1_200, connections: ["api-auth"] },
    { caption: "Your design is saved", ms: 1_200, connections: ["api-db"] },
    { caption: "An older version is kept", ms: 1_300, connections: ["api-db"] },
  ],
  auth: [
    { caption: "Sign in with GitHub", ms: 1_000, connections: ["api-auth"] },
    { caption: "Or Google, or email", ms: 1_100, connections: ["api-auth"] },
    { caption: "Wrong password, five times", ms: 1_300, connections: ["auth-db"] },
    { caption: "That email waits a while", ms: 1_300, connections: ["auth-db"] },
  ],
  db: [
    { caption: "Your project is saved", ms: 1_100, connections: ["api-db"] },
    { caption: "You close the laptop", ms: 1_100, connections: ["api-db"] },
    { caption: "Later, on another computer", ms: 1_200, connections: ["api-db", "auth-db"] },
    { caption: "Your design is still there", ms: 1_300, connections: ["api-db"] },
  ],
  archie: [
    { caption: "You ask for a review", ms: 1_000, connections: ["edge-archie"] },
    { caption: "Any questions left today?", ms: 1_200, connections: ["archie-db"] },
    { caption: "Archie writes back", ms: 1_300, connections: ["archie-model"] },
    { caption: "Same question: instant", ms: 1_300, connections: ["archie-db"] },
  ],
  model: [
    { caption: "Archie asks the model", ms: 1_000, connections: ["archie-model"] },
    { caption: "The answer streams in", ms: 1_300, connections: ["archie-model"] },
    { caption: "The model is busy", ms: 1_100, connections: ["archie-model"] },
    { caption: "Try again shortly", ms: 1_300, connections: ["archie-model"] },
  ],
  export: [
    { caption: "You export your design", ms: 1_000, connections: ["api-export"] },
    { caption: "Each box becomes a service", ms: 1_300, connections: ["api-export"] },
    { caption: "Packed into one file", ms: 1_100, connections: ["api-export"] },
    { caption: "It runs on your computer", ms: 1_300, connections: ["api-export"] },
  ],
  ci: [
    { caption: "A change arrives", ms: 900, connections: ["git-ci"] },
    { caption: "Tests run", ms: 1_100, connections: ["git-ci"] },
    { caption: "Types and build pass", ms: 1_200, connections: ["git-ci"] },
    { caption: "The site updates", ms: 1_300, connections: ["ci-edge"] },
  ],
  git: [
    { caption: "Someone changes the code", ms: 1_000, connections: ["git-ci"] },
    { caption: "Saved as a commit", ms: 1_100, connections: ["git-ci"] },
    { caption: "Then another", ms: 1_100, connections: ["git-ci"] },
    { caption: "Pushed to GitHub", ms: 1_300, connections: ["git-ci"] },
  ],
  review: [
    { caption: "Code is checked and shipped", ms: 1_100, connections: ["git-ci", "ci-edge"] },
    { caption: "You build on the canvas", ms: 1_100, connections: ["designer-edge"] },
    { caption: "Your work is saved", ms: 1_200, connections: ["edge-api", "api-db"] },
    { caption: "Archie reviews it", ms: 1_400, connections: ["edge-archie", "archie-model"] },
  ],
};
