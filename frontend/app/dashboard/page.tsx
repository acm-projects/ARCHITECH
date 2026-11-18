import Link from "next/link";

import ProfileMenu from "@/components/auth/ProfileMenu";
import { Logo } from "@/components/ui";
import DashboardMotion from "@/components/dashboard/DashboardMotion";
import ChallengeAnnouncement from "@/components/dashboard/ChallengeAnnouncement";
import RecentProjects from "@/components/dashboard/RecentProjects";
import SystemTutorials from "@/components/dashboard/SystemTutorials";
import PendingDemo from "@/components/dashboard/PendingDemo";
import { HOME_ROUTE } from "@/lib/routes";
import { urlShortenerChallenge } from "@/components/challenge/challenges";

export default function DashboardPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden text-[#0A0A0A] max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible ax-dashboard-shell">
      {/* The daily challenge is pinned: always shown, never dismissed. */}
      <ChallengeAnnouncement
        title={urlShortenerChallenge.title}
        announcement={urlShortenerChallenge.announcement}
        difficulty={urlShortenerChallenge.difficulty}
      />

      <header className="page-header flex shrink-0 items-center justify-between">
        <Link href={HOME_ROUTE} aria-label="ARCHITECH dashboard" className="focus-visible:outline-2 focus-visible:outline-offset-4">
          <Logo variant="by-level" />
        </Link>

        <nav className="flex items-center gap-8 text-xs text-neutral-500">
          <ProfileMenu />
        </nav>
      </header>

      <PendingDemo />
      <DashboardMotion className="ax-dashboard-content">
        <RecentProjects />
        <SystemTutorials />
      </DashboardMotion>
    </main>
  );
}
