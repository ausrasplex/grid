import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grid",
  description: "Jobsite plans, markups, RFIs and variations for every trade.",
  appleWebApp: { capable: true, title: "Grid", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout use the full screen around notches; the shell pads
  // with safe-area insets.
  viewportFit: "cover",
  // Concept C is dark by default (docs/visual-style.md). When the optional
  // light theme is offered, switch this with the user's theme setting.
  themeColor: "#15171b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
