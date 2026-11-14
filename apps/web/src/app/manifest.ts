// The web app manifest (/manifest.webmanifest): lets Chrome, Edge and
// Android install Grid as an app with its own icon and window. Browsers
// only install over https (e.g. through a Cloudflare tunnel or a reverse
// proxy), never from a plain http://<ip>:3000 address.

import type { MetadataRoute } from "next";
import { ICON_BACKGROUND } from "@/lib/app-icon";

/** Concept C's page colour (--background): the title bar of the installed app. */
const GRAPHITE = "#15171b";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Grid",
    short_name: "Grid",
    description: "Jobs, plans, markups and photos for every trade.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // The splash screen while Grid opens: the icon's own background.
    background_color: ICON_BACKGROUND,
    theme_color: GRAPHITE,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      // The picture already sits well inside its border, so Android's round crop keeps it whole.
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
