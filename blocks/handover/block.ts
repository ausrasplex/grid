import { defineBlock } from "@grid/core";

// Handover (docs/materials-block.md §2–§3): a job's list of what's
// installed, by trade and room, printed as a landscape "Fixtures & Finishes
// Schedule" and shared with the client by a private link (/h/<token>).
export default defineBlock({
  id: "handover",
  name: "Handover",
  version: "1.0.0",
  description: "Hand the client a proper Fixtures & Finishes Schedule: what's installed in each room, with photos, brands and finishes, as a landscape PDF and a link they can open any time.",
  // Templates: branding and Chromium for the PDF. Signatures: the public link address.
  dependsOn: ["projects", "materials", "clients", "templates", "signatures"],
  permissions: [
    { key: "handover.view", label: "See handover lists and PDFs" },
    { key: "handover.edit", label: "Change a job's handover list", description: "Materials, rooms, quantities, notes and the cover" },
    { key: "handover.share", label: "Share handover sheets with clients", description: "Make and turn off the client's link, and email it" },
    { key: "handover.settings", label: "Change the handover settings", description: "The title and how each trade prints" },
  ],
  grants: {
    FOREMAN: ["handover.view", "handover.edit", "handover.share"],
    EMPLOYEE: ["handover.view", "handover.edit"],
    VIEWER: ["handover.view"],
  },
  menus: [{ id: "handover.settings", slot: "settings.company", label: "Handover", icon: "clipboard", href: "/handover/settings", permission: "handover.settings", order: 52 }],
  routes: async () => (await import("./routes")).routes,
  // The client's link (/h/<token>): its PDF and pictures.
  publicRoutes: async () => (await import("./public")).publicRoutes,
  fileAccess: async () => (await import("./service")).canReadHandoverFile,
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany, purgeProject: purge.purgeProject };
  },
  jobStorage: async () => (await import("./storage")).jobStorage,
  on: {
    // The cached PDF is made again if anyone asks for it.
    "projects.archived": async (payload) => (await import("./pdf")).dropCache(String((payload as { projectId: string }).projectId)),
  },
});
