import Link from "next/link";

import AuthGate from "@/components/auth/AuthGate";
import ProfileMenu from "@/components/auth/ProfileMenu";
import DailyChallenge from "@/components/dashboard/DailyChallenge";
import DashboardLogo from "@/components/dashboard/DashboardLogo";
import DashboardMotion from "@/components/dashboard/DashboardMotion";
import RecentProjects from "@/components/dashboard/RecentProjects";
import SystemTutorials from "@/components/dashboard/SystemTutorials";
import { HOME_ROUTE } from "@/lib/routes";

export default function DashboardPage() {
  return (
    <AuthGate>
    <main className="flex h-dvh flex-col overflow-hidden bg-white text-[#0A0A0A] max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      <header className="flex h-14 shrink-0 items-center justify-between bg-white px-8 lg:px-14">
        <Link href={HOME_ROUTE} aria-label="ARCHITECH dashboard" className="focus-visible:outline-2 focus-visible:outline-offset-4">
          <DashboardLogo />
        </Link>

        <nav className="flex items-center gap-8 text-xs text-neutral-500">
          <ProfileMenu />
        </nav>
      </header>

      <DashboardMotion className="flex min-h-0 flex-1 flex-col">
        <DailyChallenge
          title="Design a URL Shortener"
          difficulty="Intermediate"
          requirement="100M redirects / day"
        />
        <RecentProjects />
        <SystemTutorials />
      </DashboardMotion>
    </main>
    </AuthGate>
  );
}
