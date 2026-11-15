import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { themeAttributes, themeColour } from "@grid/ui";
import { getContext } from "@/lib/context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grid",
  description: "Jobsite plans, markups, RFIs and variations for every trade.",
  appleWebApp: { capable: true, title: "Grid", statusBarStyle: "black" },
};

/** The person's theme (Settings › Profile › Appearance); Grid dark when signed out. */
async function theme() {
  return (await getContext().catch(() => null))?.user.theme ?? "grid";
}

export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    // Lets the layout use the full screen around notches; the shell pads
    // with safe-area insets.
    viewportFit: "cover",
    // The phone's status bar matches the page (docs/visual-style.md).
    themeColor: themeColour(await theme()),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" {...themeAttributes(await theme())}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
