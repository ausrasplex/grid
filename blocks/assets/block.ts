import { defineBlock } from "@grid/core";

// Assets (docs/assets-block.md): the business's tools and gear with QR tags.
// Part 1: assets, categories with their own fields, tags and sticker
// sheets, and scan to open. Part 2: custody (check out, return, take over)
// and the movement history. Part 3: faults (Do not use, the repair steps)
// and lost or stolen. Part 4: inspections and servicing (routines, the log,
// bookings, Overdue). Vehicles come later.
export default defineBlock({
  id: "assets",
  name: "Assets",
  version: "1.0.0",
  description: "Your tools and gear with QR tags: who has what, faults and Do not use, test & tag and inspection due dates.",
  dependsOn: ["companies", "templates", "projects", "materials"],
  permissions: [
    { key: "assets.view", label: "See assets", description: "And scan their tags" },
    { key: "assets.custody", label: "Check gear out and in for yourself", description: "And take over gear someone else has" },
    { key: "assets.assign", label: "Check gear out to others and move it between places" },
    { key: "assets.faults.report", label: "Report faults and lost gear" },
    { key: "assets.faults.manage", label: "Look after faults", description: "Acknowledge, repair and close them. Told about faults and lost gear" },
    { key: "assets.lost.retire", label: "Retire lost gear for good" },
    { key: "assets.inspections.record", label: "Log tests, inspections and services", description: "And book them in" },
    { key: "assets.manage", label: "Add and change assets", description: "Assets, categories and printing tags" },
  ],
  grants: {
    FOREMAN: ["assets.view", "assets.custody", "assets.assign", "assets.faults.report", "assets.faults.manage", "assets.inspections.record", "assets.manage"],
    EMPLOYEE: ["assets.view", "assets.custody", "assets.faults.report"],
    VIEWER: ["assets.view"],
  },
  menus: [
    { id: "assets.list", slot: "sidebar.main", label: "Assets", icon: "wrench", href: "/assets", permission: "assets.view", prominence: "main", order: 45 },
    { id: "assets.faults", slot: "sidebar.main", label: "Faults", icon: "wrench", href: "/assets/faults", permission: "assets.faults.manage", order: 46 },
    { id: "assets.categories", slot: "settings.company", label: "Asset categories", icon: "wrench", href: "/assets/categories", permission: "assets.manage", order: 58 },
  ],
  routes: async () => (await import("./routes")).routes,
  fileAccess: async () => (await import("./service")).canReadAssetFile,
  // A scanned barcode linked to an asset, or a tag code typed in (the one scanner, docs/navigation.md §7a).
  scanLookup: async () => (await import("./service")).scanLookup,
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany, purgeProject: purge.purgeProject };
  },
  levelUsage: async () => (await import("./purge")).levelUsage,
  jobs: async () => ({
    // Every morning: gear whose test & tag (or another must-pass routine) went past due becomes Overdue, and Owners and Foremen get one email.
    "assets.morning": { handler: async () => (await import("./inspections")).morningCheck(), schedule: "0 6 * * *" },
  }),
  // A scanned tag (/go/<code>) opens the asset.
  routeTargets: {
    Asset: (id) => `/assets/${id}`,
  },
});
