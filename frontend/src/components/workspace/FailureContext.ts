import { createContext } from "react";

// The component a failure test has taken down, and the switch for it. Null where failure tests
// are not offered (the guided tutorial, read-only canvases).
export const FailureContext = createContext<{
  downId: string | null;
  toggle: (nodeId: string) => void;
} | null>(null);
