import type { Metadata, Viewport } from "next";

import AuthSessionProvider from "@/components/auth/AuthSessionProvider";
import "../src/index.css";

export const metadata: Metadata = {
  title: "ARCHITECT · Build systems. Break systems.",
  icons: { icon: { url: "/archie.svg", type: "image/svg+xml" } },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AuthSessionProvider>
          <div id="root">{children}</div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
