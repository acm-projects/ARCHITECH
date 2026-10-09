import type { NextConfig } from "next";

import { HOME_ROUTE, RETIRED_ROUTES } from "./src/lib/routes";

const nextConfig: NextConfig = {
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
