"use client";

import { createContext } from "react";

import {
  DEFAULT_TRAFFIC,
  type TrafficProfile,
} from "../../lib/architecture/evaluation/traffic";

// The traffic the design is being built for (the same profile Run Design and Stress Test use).
// The technology picker in the toolbox and in a component's Configure card sizes every
// technology for it: instances needed, monthly cost and latency.
export const DesignTrafficContext = createContext<TrafficProfile>(DEFAULT_TRAFFIC);
