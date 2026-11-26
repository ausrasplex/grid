import { defineBlock } from "@grid/core";

// Assets (docs/assets-block.md): the business's tools and gear with QR tags.
// Part 1: assets, categories with their own fields, tags and sticker
// sheets, and scan to open. Custody, faults, inspections and vehicles come
// in later parts, with their own permissions (§5).
export default defineBlock({
  id: "assets",
  name: "Assets",
  version: "1.0.0",
  description: "Your tools and gear with QR tags: who has what, faults and Do not use, test & tag and inspection due dates.",
  dependsOn: ["companies", "templates"],
  permissions: [
    { key: "assets.view", label: "See assets", description: "And scan their tags" },
    { key: "assets.manage", label: "Add and change assets", description: "Assets, categories and printing tags" },
  ],
  grants: {
    FOREMAN: ["assets.view", "assets.manage"],
    EMPLOYEE: ["assets.view"],
    VIEWER: ["assets.view"],
  },
  menus: [
    { id: "assets.list", slot: "sidebar.main", label: "Assets", icon: "wrench", href: "/assets", permission: "assets.view", prominence: "main", order: 45 },
    { id: "assets.categories", slot: "settings.company", label: "Asset categories", icon: "wrench", href: "/assets/categories", permission: "assets.manage", order: 58 },
  ],
  routes: async () => (await import("./routes")).routes,
  fileAccess: async () => (await import("./service")).canReadAssetFile,
  // A scanned barcode linked to an asset, or a tag code typed in (the one scanner, docs/navigation.md §7a).
  scanLookup: async () => (await import("./service")).scanLookup,
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  // A scanned tag (/go/<code>) opens the asset.
  routeTargets: {
    Asset: (id) => `/assets/${id}`,
  },
});
