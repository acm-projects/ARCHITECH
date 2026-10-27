import Image from "next/image";
import Link from "next/link";

import { NETFLIX_COMPONENTS, NETFLIX_CONNECTIONS, NETFLIX_NODES } from "../breakdowns/netflix";
import TopologyPreview from "../projects/TopologyPreview";
import { NETFLIX_BREAKDOWN_ROUTE } from "../../lib/routes";

const UPCOMING = [
  { company: "Uber", topic: "Real-time systems", logo: "/tutorial-logos/uber.svg" },
  { company: "YouTube", topic: "Video infrastructure", logo: "/tutorial-logos/youtube.svg" },
] as const;

export default function SystemTutorials() {
  return (
    <section className="ax-dashboard-tutorials bg-white px-5 sm:px-8 lg:px-14">
      <div className="ax-dashboard-tutorial-heading">
        <h2 className="ax-dashboard-section-title">System breakdowns</h2>
      </div>
      <div className="ax-dashboard-learning-content">
        <ul className="ax-breakdown-catalog" aria-label="System breakdowns">
          <li className="ax-dashboard-project-card min-w-0">
            <Link href={NETFLIX_BREAKDOWN_ROUTE} className="ax-breakdown-catalog-link" aria-label="Explore Netflix system breakdown">
              <div className="ax-dashboard-project-preview ax-breakdown-catalog-preview">
                <TopologyPreview nodes={NETFLIX_NODES} edges={[...NETFLIX_CONNECTIONS]} />
              </div>
              <div className="ax-dashboard-project-metadata">
                <div className="ax-breakdown-catalog-title">
                  <span>Netflix</span><span aria-hidden="true">&rarr;</span>
                </div>
                <p>Video delivery &middot; {NETFLIX_COMPONENTS.length} components</p>
                <p className="ax-breakdown-catalog-detail">Guided by Archie</p>
              </div>
            </Link>
          </li>
          {UPCOMING.map(item => (
            <li key={item.company} className="ax-dashboard-project-card ax-breakdown-catalog-unavailable min-w-0">
              <div className="ax-dashboard-project-preview ax-breakdown-catalog-preview">
                <Image src={item.logo} alt="" width={120} height={64} className="ax-breakdown-catalog-logo" />
              </div>
              <div className="ax-dashboard-project-metadata">
                <div className="ax-breakdown-catalog-title"><span>{item.company}</span><span>Coming soon</span></div>
                <p>{item.topic}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
