import type { Metadata } from "next";
import { Suspense } from "react";

import NetflixBreakdown from "@/components/breakdowns/NetflixBreakdown";

export const metadata: Metadata = { title: "Netflix system breakdown · ARCHITECH" };

export default function NetflixBreakdownPage() {
  return <Suspense fallback={<p role="status" className="p-6">Loading Netflix architecture…</p>}>
    <NetflixBreakdown />
  </Suspense>;
}
