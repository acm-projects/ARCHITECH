import type { Metadata } from "next";
import { Suspense } from "react";

import ArchitechBreakdown from "@/components/breakdowns/ArchitechBreakdown";

export const metadata: Metadata = { title: "ARCHITECH system breakdown · ARCHITECH" };

export default function ArchitechBreakdownPage() {
  return <Suspense fallback={<p role="status" className="p-6">Loading ARCHITECH architecture…</p>}>
    <ArchitechBreakdown />
  </Suspense>;
}
