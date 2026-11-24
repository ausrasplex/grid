import { defineBlock } from "@grid/core";

// Materials (docs/materials-block.md §1): the business's own list of the
// things it installs, with a photo or colour swatch, brand, model, finish,
// trade and family. Core, so Quotes (the price list adds the money) and the
// Handover Block can both rely on it.
export default defineBlock({
  id: "materials",
  name: "Materials",
  version: "1.0.0",
  description: "The things you install: photo, brand, model, finish and trade, kept once and used by quotes and handover sheets. Part of the core.",
  required: true,
  dependsOn: ["companies"],
  permissions: [
    { key: "materials.view", label: "See materials" },
    { key: "materials.manage", label: "Add and change materials", description: "Materials, their photos, brands and families" },
  ],
  grants: {
    FOREMAN: ["materials.view", "materials.manage"],
    EMPLOYEE: ["materials.view"],
    VIEWER: ["materials.view"],
  },
  menus: [{ id: "materials.list", slot: "settings.company", label: "Materials", icon: "package", href: "/materials", permission: "materials.view", order: 48 }],
  routes: async () => (await import("./routes")).routes,
  fileAccess: async () => (await import("./service")).canReadMaterialFile,
  // Deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  routeTargets: {
    Material: (id) => `/materials/${id}`,
  },
  emits: ["materials.changed"],
});
