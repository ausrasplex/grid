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
  cleanup: async () => ({ purgeDeleted: (await import("./service")).purgeDeleted }),
  emits: ["photos.added"],
});
