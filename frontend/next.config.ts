import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { HOME_ROUTE, RETIRED_ROUTES } from "./src/lib/routes";

const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  // The integration tests run their own server with NEXT_DIST_DIR=.next-integration, so it
  // never clashes with a dev server already running in this folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The standalone pages are gone; an old bookmark lands on the dashboard.
  async redirects() {
    return RETIRED_ROUTES.map((source) => ({
      source,
      destination: HOME_ROUTE,
      permanent: false,
    }));
  },
};

export default nextConfig;
