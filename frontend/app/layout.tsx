import type { Metadata, Viewport } from "next";

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
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
