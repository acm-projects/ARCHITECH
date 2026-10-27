import Link from "next/link";

import ProfileMenu from "@/components/auth/ProfileMenu";
import { Logo } from "@/components/ui";
import DashboardMotion from "@/components/dashboard/DashboardMotion";
import DailyChallenge from "@/components/dashboard/DailyChallenge";
import RecentProjects from "@/components/dashboard/RecentProjects";
import SystemTutorials from "@/components/dashboard/SystemTutorials";
import { HOME_ROUTE } from "@/lib/routes";
import { urlShortenerChallenge } from "@/components/challenge/challenges";

export default async function DashboardPage() {
  return (
    <main className="ax-dashboard-shell flex h-dvh flex-col overflow-hidden bg-white text-[#0A0A0A] max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      <header className="page-header flex shrink-0 items-center justify-between bg-white">
        <Link href={HOME_ROUTE} aria-label="ARCHITECH dashboard" className="focus-visible:outline-2 focus-visible:outline-offset-4">
          <Logo variant="by-level" />
        </Link>

        <nav className="flex items-center gap-8 text-xs text-neutral-500">
          <ProfileMenu />
        </nav>
      </header>

      <div className="ax-dashboard-challenge-region px-5 sm:px-8 lg:px-14">
        <DailyChallenge
          compact
          title={urlShortenerChallenge.title}
          difficulty={urlShortenerChallenge.difficulty}
          requirement={urlShortenerChallenge.summary[0]}
        />
      </div>

      <DashboardMotion className="ax-dashboard-content">
        <RecentProjects />
        <SystemTutorials />
      </DashboardMotion>
    </main>
  );
}
