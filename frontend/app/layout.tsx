import type { Metadata, Viewport } from "next";

import AuthSessionProvider from "@/components/auth/AuthSessionProvider";
import AppThemeBoundary from "@/components/AppThemeBoundary";
import ProjectSync from "@/components/projects/ProjectSync";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "../src/index.css";

export const metadata: Metadata = {
  title: "ARCHITECH · Build systems. Break systems.",
  icons: { icon: { url: "/archie.svg", type: "image/svg+xml" } },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets the theme class on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AuthSessionProvider>
          <ProjectSync />
          <div id="root">
            <AppThemeBoundary>{children}</AppThemeBoundary>
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
