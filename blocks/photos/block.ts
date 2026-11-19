import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "photos",
  name: "Photos & notes",
  version: "1.0.0",
  description: "Photos and notes on every job, filed by building and level, with before and after tags. Works without signal.",
  dependsOn: ["projects"],
  permissions: [
    { key: "photos.view", label: "See job photos and notes" },
    { key: "photos.add", label: "Add photos and notes", description: "And change or delete your own" },
    { key: "photos.manage", label: "Change or delete anyone's photos and notes" },
  ],
  grants: {
    FOREMAN: ["photos.view", "photos.add", "photos.manage"],
    EMPLOYEE: ["photos.view", "photos.add"],
    VIEWER: ["photos.view"],
  },
  routes: async () => (await import("./routes")).routes,
  fileAccess: async () => (await import("./service")).canReadPhotoFile,
  // Recently deleted running out, and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { purgeDeleted: (await import("./service")).purgeDeleted, companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  levelUsage: async () => (await import("./service")).levelUsage,
  jobStorage: async () => (await import("./storage")).jobStorage,
  emits: ["photos.added"],
  on: {
    // A plan sheet layer was deleted (Plans): its photo pins go back on Default.
    "plans.layerDeleted": async (payload) => (await import("./service")).layerDeleted(payload as never),
  },
});
