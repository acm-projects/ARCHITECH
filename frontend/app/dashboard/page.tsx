import Link from "next/link";

import DailyChallenge from "@/components/dashboard/DailyChallenge";
import DashboardMotion from "@/components/dashboard/DashboardMotion";
import RecentProjects from "@/components/dashboard/RecentProjects";
import SystemTutorials from "@/components/dashboard/SystemTutorials";

export default function DashboardPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-white text-[#0A0A0A] max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      <header className="flex h-14 shrink-0 items-center justify-between bg-white px-8 lg:px-14">
        <Link href="/dashboard" className="text-xs font-medium uppercase tracking-[0.24em]">
          ARCHITECH
        </Link>

        <nav className="flex items-center gap-8 text-xs text-neutral-500">
          <Link href="/learn" className="transition-colors hover:text-[#0A0A0A]">
            Learn
          </Link>
          <Link href="/challenge" className="transition-colors hover:text-[#0A0A0A]">
            Challenge
          </Link>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0A0A0A] text-[11px] text-white"
            aria-label="Profile"
          >
            J
          </span>
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
  );
}
