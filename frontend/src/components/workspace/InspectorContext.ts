import { createContext } from "react";

// Canvas actions change the inspector's presentation, never the design itself.
export const InspectorContext = createContext<{
  archieOpen: boolean;
  configuring: boolean;
  inspectComponent: () => void;
  askArchie: () => void;
} | null>(null);
