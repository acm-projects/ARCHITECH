import { createContext } from "react";

// Canvas actions change the inspector's presentation, never the design itself.
export const InspectorContext = createContext<{
  activePanel: "ai" | "configure" | "none";
  inspectComponent: () => void;
  askArchie: () => void;
} | null>(null);
