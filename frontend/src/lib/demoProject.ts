import type { NewProjectInit } from "../components/projects/projectStore.ts";
import { STARTER_EDGES, STARTER_NODES } from "../components/projects/starterArchitecture.ts";

// The landing page's "Explore a system" demo. It needs an account first, so the request is
// remembered through sign-up (and onboarding, or an OAuth round trip) and the demo opens once
// the dashboard is reached. It opens straight into free play, with no tutorial, on the starter
// design (Client → API Server → Database), so there is a system to explore and run at once.
export const PENDING_DEMO_KEY = "architech:pending-demo";

export const DEMO_PROJECT: NewProjectInit = {
  title: "Demo architecture",
  mode: "learn",
  source: "template",
  skipTutorial: true,
  nodes: STARTER_NODES.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } })),
  edges: STARTER_EDGES.map((edge) => ({ ...edge })),
};

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sessionStore = (): SessionStore | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

// Returns false when the browser will not keep it; the visitor still signs up, without the demo.
export function requestDemoAfterSignUp(store: SessionStore | null = sessionStore()): boolean {
  try {
    store?.setItem(PENDING_DEMO_KEY, "1");
    return Boolean(store);
  } catch {
    return false;
  }
}

// True once, for the visit that asked for the demo.
export function takePendingDemo(store: SessionStore | null = sessionStore()): boolean {
  try {
    if (store?.getItem(PENDING_DEMO_KEY) !== "1") return false;
    store.removeItem(PENDING_DEMO_KEY);
    return true;
  } catch {
    return false;
  }
}
