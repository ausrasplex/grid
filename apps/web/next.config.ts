import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone", // small Docker image for Unraid
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@grid/core",
    "@grid/db",
    "@grid/ui",
    "@grid/block-users",
    "@grid/block-companies",
    "@grid/block-sites",
    "@grid/block-projects",
    "@grid/block-photos",
    "@grid/block-templates",
    "@grid/block-signatures",
    "@grid/block-plans",
    "@grid/block-quotes",
  ],
  // Loaded from node_modules at run time rather than bundled.
  serverExternalPackages: ["pg-boss", "sharp", "puppeteer-core", "@signpdf/signpdf", "@signpdf/signer-p12", "@signpdf/placeholder-pdf-lib", "node-forge", "pdf-lib"],
  // Short public addresses (docs/quotations-block.md §6b).
  async rewrites() {
    return [
      { source: "/q/:token", destination: "/p/quotes/q/:token" },
      { source: "/verify", destination: "/p/signatures/verify" },
      { source: "/verify/:code", destination: "/p/signatures/verify/:code" },
    ];
  },
  async headers() {
    const privateHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store" },
    ];
    return [
      { source: "/q/:path*", headers: privateHeaders },
      { source: "/p/:path*", headers: privateHeaders },
      { source: "/verify/:path*", headers: privateHeaders },
      { source: "/api/public/:path*", headers: privateHeaders },
    ];
  },
};

export default config;
