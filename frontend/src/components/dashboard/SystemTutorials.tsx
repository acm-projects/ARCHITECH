import Image from "next/image";
import Link from "next/link";

import DailyChallenge from "./DailyChallenge";
import { urlShortenerChallenge } from "../challenge/challenges";
import { NETFLIX_COMPONENTS, NETFLIX_CONNECTIONS, NETFLIX_NODES } from "../breakdowns/netflix";
import TopologyPreview from "../projects/TopologyPreview";
import ArchitectureTile from "../projects/ArchitectureTile";
import { NETFLIX_BREAKDOWN_ROUTE } from "../../lib/routes";

const UPCOMING = [
  { company: "Uber", topic: "Real-time systems", logo: "/tutorial-logos/uber.svg" },
  { company: "YouTube", topic: "Video infrastructure", logo: "/tutorial-logos/youtube.svg" },
] as const;

export default function SystemTutorials() {
  return (
    <section className="ax-dashboard-tutorials bg-white px-5 sm:px-8 lg:px-14">
      <div className="ax-dashboard-project-heading mb-5">
        <div>
          <h2 className="ax-dashboard-section-title">System breakdowns</h2>
          <p className="mt-1 text-xs text-[#737373]">Explore the architecture behind real-world systems.</p>
        </div>
      </div>
      <div className="ax-dashboard-learning-content">
        <ul className="ax-dashboard-project-grid ax-breakdown-catalog" aria-label="System breakdowns">
          <ArchitectureTile
            href={NETFLIX_BREAKDOWN_ROUTE}
            label="Explore Netflix system breakdown"
            preview={<TopologyPreview nodes={NETFLIX_NODES} edges={[...NETFLIX_CONNECTIONS]} />}
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link href={NETFLIX_BREAKDOWN_ROUTE} className="min-w-0 truncate text-sm font-medium tracking-tight focus-visible:underline">Netflix</Link>
              <span className="shrink-0 text-[11px] text-neutral-500">Guided</span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Video delivery &middot; {NETFLIX_COMPONENTS.length} components</p>
          </ArchitectureTile>
          {UPCOMING.map(item => (
            <ArchitectureTile key={item.company} preview={<Image src={item.logo} alt="" width={120} height={64} className="ax-breakdown-catalog-logo" />}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium tracking-tight">{item.company}</span>
                <span className="shrink-0 text-[11px] text-neutral-500">Coming soon</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">{item.topic}</p>
            </ArchitectureTile>
          ))}
        </ul>
        <DailyChallenge
          compact
          title={urlShortenerChallenge.title}
          difficulty={urlShortenerChallenge.difficulty}
          requirement={urlShortenerChallenge.summary[0]}
        />
      </div>
    </section>
  );
}
