// The web app manifest (/manifest.webmanifest): lets Chrome, Edge and
// Android install Grid as an app with its own icon and window. Browsers
// only install over https (e.g. through a Cloudflare tunnel or a reverse
// proxy), never from a plain http://<ip>:3000 address.

import type { MetadataRoute } from "next";
import { GRAPHITE } from "@/lib/app-icon";

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
    background_color: GRAPHITE,
    theme_color: GRAPHITE,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
