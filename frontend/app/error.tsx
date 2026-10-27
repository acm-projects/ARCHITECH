"use client";

import { HOME_ROUTE } from "@/lib/routes";
import Link from "next/link";
import { useEffect } from "react";

// What every route shows if something throws while rendering, instead of a blank page. A
// saved project is autosaved before this appears, so trying again or going back is safe.
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 bg-white text-[#0A0A0A]">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="text-sm text-neutral-500">This page could not be shown.</p>
      <div className="mt-2 flex items-center gap-6 text-sm">
        <button
          type="button"
          onClick={() => retry()}
          className="text-blue-700 transition-opacity hover:opacity-60"
        >
          Try again
        </button>
        <Link href={HOME_ROUTE} className="text-blue-700 transition-opacity hover:opacity-60">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
