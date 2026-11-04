import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { NETFLIX_COMPONENTS, NETFLIX_CONNECTIONS, NETFLIX_NODES } from "../breakdowns/netflix";
import { UBER_PREVIEW, YOUTUBE_PREVIEW } from "../breakdowns/upcoming";
import TopologyPreview from "../projects/TopologyPreview";
import ArchitectureTile from "../projects/ArchitectureTile";
import { NETFLIX_BREAKDOWN_ROUTE } from "../../lib/routes";
import "../workspace/architecture-workspace.css";

// Brand colors for each card: the logo's surface, and the border shown on hover.
const NETFLIX_BRAND = { "--breakdown-surface": "#000000", "--breakdown-accent": "#e50914" } as CSSProperties;

const UPCOMING = [
  {
    company: "Uber",
    topic: "Real-time systems",
    logo: "/tutorial-logos/uber.svg",
    graph: UBER_PREVIEW,
    // The artwork is black, so it inverts to white on Uber's black surface.
    brand: { "--breakdown-surface": "#000000", "--breakdown-accent": "#06c167", "--breakdown-logo-filter": "invert(1)" } as CSSProperties,
  },
  {
    company: "YouTube",
    topic: "Video infrastructure",
    logo: "/tutorial-logos/youtube.svg",
    graph: YOUTUBE_PREVIEW,
    brand: { "--breakdown-surface": "#ffffff", "--breakdown-accent": "#ff0000" } as CSSProperties,
  },
] as const;

// The logo by default; the system behind it on hover or keyboard focus.
function BreakdownFace({ logo, children }: { logo: string; children: ReactNode }) {
  return (
    <>
      <div className="ax-breakdown-topology">{children}</div>
      <div className="ax-breakdown-brand">
        <Image src={logo} alt="" width={188} height={100} className="ax-breakdown-catalog-logo" />
      </div>
    </>
  );
}

export default function SystemTutorials() {
  return (
    <section className="ax-dashboard-tutorials px-4 md:px-6">
      <div className="ax-dashboard-tutorial-heading">
        <h2 className="ax-dashboard-section-title">System breakdowns</h2>
      </div>
      <div className="ax-dashboard-learning-content">
        <ul className="ax-workspace ax-dashboard-project-grid ax-breakdown-catalog" aria-label="System breakdowns">
          <ArchitectureTile
            href={NETFLIX_BREAKDOWN_ROUTE}
            label="Explore Netflix system breakdown"
            style={NETFLIX_BRAND}
            preview={<BreakdownFace logo="/tutorial-logos/netflix.svg"><TopologyPreview nodes={NETFLIX_NODES} edges={[...NETFLIX_CONNECTIONS]} /></BreakdownFace>}
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link href={NETFLIX_BREAKDOWN_ROUTE} className="min-w-0 truncate text-[17px] font-semibold tracking-tight focus-visible:underline">Netflix</Link>
              <span className="shrink-0 text-[13px] text-neutral-500">Guided</span>
            </div>
            <p className="mt-1 text-[13px] text-neutral-500">Video delivery &middot; {NETFLIX_COMPONENTS.length} components</p>
          </ArchitectureTile>
          {UPCOMING.map(item => (
            <ArchitectureTile
              key={item.company}
              style={item.brand}
              preview={<BreakdownFace logo={item.logo}><TopologyPreview nodes={item.graph.nodes} edges={item.graph.edges} /></BreakdownFace>}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-semibold tracking-tight">{item.company}</span>
                <span className="shrink-0 text-[13px] text-neutral-500">Coming soon</span>
              </div>
              <p className="mt-1 text-[13px] text-neutral-500">{item.topic}</p>
            </ArchitectureTile>
          ))}
        </ul>
      </div>
    </section>
  );
}
