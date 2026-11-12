import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ARCHITECH_CONNECTIONS, ARCHITECH_NODES } from "../breakdowns/architech";
import { NETFLIX_CONNECTIONS, NETFLIX_NODES } from "../breakdowns/netflix";
import { DISCORD_PREVIEW, SPOTIFY_PREVIEW, UBER_PREVIEW, YOUTUBE_PREVIEW } from "../breakdowns/upcoming";
import TopologyPreview from "../projects/TopologyPreview";
import ArchitectureTile from "../projects/ArchitectureTile";
import type { ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";
import { ARCHITECH_BREAKDOWN_ROUTE, NETFLIX_BREAKDOWN_ROUTE } from "../../lib/routes";
import "../workspace/architecture-workspace.css";

type BreakdownEntry = {
  company: string;
  logo: string;
  graph: { nodes: ArchitectureFlowNode[]; edges: readonly { id: string; source: string; target: string }[] };
  // Each card's brand color, shown on its border on hover.
  brand: CSSProperties;
  // Breakdowns without a route are not written yet.
  href?: string;
};

const brand = (color: string) => ({ "--breakdown-accent": color }) as CSSProperties;

const BREAKDOWNS: readonly BreakdownEntry[] = [
  { company: "Netflix", logo: "/tutorial-logos/netflix.svg", graph: { nodes: NETFLIX_NODES, edges: NETFLIX_CONNECTIONS }, brand: brand("#e50914"), href: NETFLIX_BREAKDOWN_ROUTE },
  { company: "Architech", logo: "/archie.svg", graph: { nodes: ARCHITECH_NODES, edges: ARCHITECH_CONNECTIONS }, brand: brand("#0091ff"), href: ARCHITECH_BREAKDOWN_ROUTE },
  { company: "Uber", logo: "/tutorial-logos/uber.svg", graph: UBER_PREVIEW, brand: brand("#06c167") },
  { company: "YouTube", logo: "/tutorial-logos/youtube.svg", graph: YOUTUBE_PREVIEW, brand: brand("#ff0000") },
  { company: "Spotify", logo: "/tutorial-logos/spotify.svg", graph: SPOTIFY_PREVIEW, brand: brand("#1ed760") },
  { company: "Discord", logo: "/tutorial-logos/discord.svg", graph: DISCORD_PREVIEW, brand: brand("#5865f2") },
];

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
          {BREAKDOWNS.map(item => (
            <ArchitectureTile
              key={item.company}
              href={item.href}
              label={item.href ? `Explore ${item.company} system breakdown` : undefined}
              style={item.brand}
              preview={<BreakdownFace logo={item.logo}><TopologyPreview nodes={item.graph.nodes} edges={[...item.graph.edges]} /></BreakdownFace>}
            >
              {item.href
                ? <Link href={item.href} className="block truncate text-[15px] font-semibold tracking-tight focus-visible:underline">{item.company}</Link>
                : <span className="block text-[15px] font-semibold tracking-tight">{item.company}</span>}
            </ArchitectureTile>
          ))}
        </ul>
      </div>
    </section>
  );
}
