import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { CUSTOM_THEME_STYLE_ID, themeAttributes, themeColour, tokensCss } from "@grid/ui";
import { getContext } from "@/lib/context";
import "./globals.css";

/** The Soft look's font (styles.css "Soft look"). The Grid look keeps the system font. */
const softFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-soft", preload: false });

export const metadata: Metadata = {
  title: "Grid",
  description: "Jobsite plans, markups, RFIs and variations for every trade.",
  appleWebApp: { capable: true, title: "Grid", statusBarStyle: "black" },
};

/**
 * The person's theme (Settings › Profile › Appearance); Grid dark when signed
 * out. A theme they or their business made comes as its colours (custom).
 */
async function theme() {
  const user = (await getContext().catch(() => null))?.user;
  return { builtIn: user?.theme ?? "grid", custom: user?.customTheme ?? null };
}

export async function generateViewport(): Promise<Viewport> {
  const { builtIn, custom } = await theme();
  return {
    width: "device-width",
    initialScale: 1,
    // Lets the layout use the full screen around notches; the shell pads
    // with safe-area insets.
    viewportFit: "cover",
    // The phone's status bar matches the page (docs/visual-style.md).
    themeColor: custom ? custom.tokens.background : themeColour(builtIn),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { builtIn, custom } = await theme();
  const attributes = custom ? { "data-theme": "custom", "data-look": custom.look } : themeAttributes(builtIn);
  return (
    <html lang="en-AU" className={softFont.variable} {...attributes}>
      {/* Only checked #rrggbb colours reach this (tokensCss). */}
      <head>{custom && <style id={CUSTOM_THEME_STYLE_ID} dangerouslySetInnerHTML={{ __html: tokensCss(custom.tokens) }} />}</head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
