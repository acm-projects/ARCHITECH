"use client";

import { createContext } from "react";

import type { ArchieView } from "../../lib/architecture/archie/view";

// Gives the "Ask AI" card of a component Archie's explanation of the latest Run Design. It is a
// function so the explanation is only built when a card is actually open. null where Run
// Design is not used (Learn, Challenge), which leaves the card as it was.
export const ArchieContext = createContext<(() => ArchieView) | null>(null);
