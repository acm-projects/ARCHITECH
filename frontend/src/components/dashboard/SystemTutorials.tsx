import Image from "next/image";

import DailyChallenge from "./DailyChallenge";
import { urlShortenerChallenge } from "../challenge/challenges";

type Tutorial = {
  id: string;
  company: string;
  title: string;
  topic: string;
  logo: string;
};

const TUTORIALS: readonly Tutorial[] = [
  {
    id: "netflix",
    company: "Netflix",
    title: "How Netflix Streams at Scale",
    topic: "Video Delivery",
    logo: "/tutorial-logos/netflix.svg",
  },
  {
    id: "uber",
    company: "Uber",
    title: "How Uber Matches Riders",
    topic: "Real-Time Systems",
    logo: "/tutorial-logos/uber.svg",
  },
  {
    id: "youtube",
    company: "YouTube",
    title: "How YouTube Delivers Video",
    topic: "Video Infrastructure",
    logo: "/tutorial-logos/youtube.svg",
  },
];

export default function SystemTutorials() {
  return (<section
    className="ax-dashboard-tutorials bg-white px-5 sm:px-8 lg:px-14"
  >
    <div className="ax-dashboard-tutorial-heading flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="ax-dashboard-section-title">
          Tutorials
        </h2>
        <p className="mt-1 text-xs text-[#737373]">
          Explore real-world systems.
        </p>
      </div>
      <button
        type="button"
        // Tutorials are not available yet.

        disabled
        title="Not available yet"
        className="ml-auto text-xs text-[#737373] disabled:cursor-not-allowed"
      >
        Explore all <span aria-hidden="true">→</span>
      </button>
    </div>

    <div className="ax-dashboard-learning-content">
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {TUTORIALS.map((tutorial) => (<li key={tutorial.id} className="min-w-0">
        <button
          type="button"
          disabled
          title="Not available yet"
          aria-label={`${tutorial.company}: ${tutorial.title}. Not available yet.`}
          className="ax-dashboard-tutorial"
        >
          <span className="ax-dashboard-tutorial-logo">
            <Image
              src={tutorial.logo}
              alt=""
              width={160}
              height={96}
              className="ax-dashboard-tutorial-brand"
            />
          </span>
          <span className="ax-dashboard-tutorial-company">{tutorial.company}</span>
          <span className="ax-dashboard-tutorial-topic">{tutorial.topic}</span>
        </button>
      </li>))}
    </ul>
    <DailyChallenge
      compact
      title={urlShortenerChallenge.title}
      difficulty={urlShortenerChallenge.difficulty}
      requirement={urlShortenerChallenge.summary[0]}
    />
    </div>
  </section>);
}
