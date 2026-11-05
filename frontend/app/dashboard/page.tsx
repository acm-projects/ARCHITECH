import { cookies } from "next/headers";
import Link from "next/link";

import ProfileMenu from "@/components/auth/ProfileMenu";
import { Logo } from "@/components/ui";
import DashboardMotion from "@/components/dashboard/DashboardMotion";
import ChallengeAnnouncement from "@/components/dashboard/ChallengeAnnouncement";
import { DISMISSED_CHALLENGE_COOKIE, isChallengeDismissed } from "@/components/dashboard/challengeDismissal";
import RecentProjects from "@/components/dashboard/RecentProjects";
import SystemTutorials from "@/components/dashboard/SystemTutorials";
import { HOME_ROUTE } from "@/lib/routes";
import { urlShortenerChallenge } from "@/components/challenge/challenges";

export default async function DashboardPage() {
  const dismissedChallenge = (await cookies()).get(DISMISSED_CHALLENGE_COOKIE)?.value;

  return (
    <main className="flex h-dvh flex-col overflow-hidden text-[#0A0A0A] max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible ax-dashboard-shell">
      <ChallengeAnnouncement
        challengeId={urlShortenerChallenge.id}
        title={urlShortenerChallenge.title}
        announcement={urlShortenerChallenge.announcement}
        difficulty={urlShortenerChallenge.difficulty}
        initiallyDismissed={isChallengeDismissed(dismissedChallenge, urlShortenerChallenge.id)}
      />

      <header className="page-header flex shrink-0 items-center justify-between">
        <Link href={HOME_ROUTE} aria-label="ARCHITECH dashboard" className="focus-visible:outline-2 focus-visible:outline-offset-4">
          <Logo variant="by-level" />
        </Link>

        <nav className="flex items-center gap-8 text-xs text-neutral-500">
          <ProfileMenu />
        </nav>
      </header>

      <DashboardMotion className="ax-dashboard-content">
        <RecentProjects />
        <SystemTutorials />
      </DashboardMotion>
    </main>
  );
}
