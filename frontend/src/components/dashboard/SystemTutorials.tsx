import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { NETFLIX_CONNECTIONS, NETFLIX_NODES } from "../breakdowns/netflix";
import { UBER_PREVIEW, YOUTUBE_PREVIEW } from "../breakdowns/upcoming";
import TopologyPreview from "../projects/TopologyPreview";
import ArchitectureTile from "../projects/ArchitectureTile";
import { NETFLIX_BREAKDOWN_ROUTE } from "../../lib/routes";
import "../workspace/architecture-workspace.css";

// Each card's brand color, shown on its border on hover.
const NETFLIX_BRAND = { "--breakdown-accent": "#e50914" } as CSSProperties;

const UPCOMING = [
  {
    company: "Uber",
    logo: "/tutorial-logos/uber.svg",
    graph: UBER_PREVIEW,
    brand: { "--breakdown-accent": "#06c167" } as CSSProperties,
  },
  {
    company: "YouTube",
    logo: "/tutorial-logos/youtube.svg",
    graph: YOUTUBE_PREVIEW,
    brand: { "--breakdown-accent": "#ff0000" } as CSSProperties,
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
    <section className="ax-dashboard-tutorials px-5 sm:px-8 lg:px-14">
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
            <Link href={NETFLIX_BREAKDOWN_ROUTE} className="block truncate text-[15px] font-semibold tracking-tight focus-visible:underline">Netflix</Link>
          </ArchitectureTile>
          {UPCOMING.map(item => (
            <ArchitectureTile
              key={item.company}
              style={item.brand}
              preview={<BreakdownFace logo={item.logo}><TopologyPreview nodes={item.graph.nodes} edges={item.graph.edges} /></BreakdownFace>}
            >
              <span className="block text-[15px] font-semibold tracking-tight">{item.company}</span>
            </ArchitectureTile>
          ))}
        </ul>
      </div>
    </section>
  );
}
