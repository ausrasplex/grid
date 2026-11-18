import { app, defineBlock } from "@grid/core";

export default defineBlock({
  id: "documents",
  name: "Documents",
  version: "1.0.0",
  description: "Your manuals and data sheets in one place, and each job's fit-off sheets, points lists and schedules, readable on the phone.",
  dependsOn: ["projects"],
  permissions: [
    { key: "documents.view", label: "See documents" },
    { key: "documents.upload", label: "Upload documents and new versions" },
    { key: "documents.edit", label: "Change documents", description: "Details, folders, the current version, pinning to jobs" },
    { key: "documents.delete", label: "Delete documents" },
    { key: "documents.libraries.manage", label: "Set up document libraries", description: "Add and rename libraries and each job's starting folders" },
  ],
  grants: {
    FOREMAN: ["documents.view", "documents.upload", "documents.edit"],
    EMPLOYEE: ["documents.view"],
    VIEWER: ["documents.view"],
  },
  menus: [
    { id: "documents.list", slot: "sidebar.main", label: "Documents", icon: "file", href: "/documents", permission: "documents.view", prominence: "main", order: 40 },
    { id: "documents.settings", slot: "settings.company", label: "Document libraries", icon: "file", href: "/documents/settings", permission: "documents.libraries.manage", order: 55 },
  ],
  routes: async () => (await import("./routes")).routes,
  routeTargets: {
    LibraryDocument: (id) => `/documents/doc/${id}`,
  },
  fileAccess: async () => (await import("./service")).canReadDocumentFile,
  // Recently deleted running out, and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { purgeDeleted: purge.purgeDeleted, dropArchivedCopies: (await import("./archive")).dropArchivedCopies, companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  jobStorage: async () => (await import("./storage")).jobStorage,
  jobs: async () => ({
    "documents.render": {
      handler: async (data) => (await import("./service")).renderVersion(String(data.versionId), data.again === true),
      expireInSeconds: 30 * 60,
      retryLimit: 1,
    },
    // Settings › Plans & PDFs › Re-render existing (queued by the server setting).
    "documents.rerender": {
      handler: async () => void (await (await import("./service")).rerenderAll()),
      expireInSeconds: 10 * 60,
      retryLimit: 0,
    },
    // Archived jobs (phase 2e): drop the copies, or make them all again on restore.
    "documents.archive": { handler: async (data) => (await import("./archive")).dropForJob(String(data.projectId)), expireInSeconds: 30 * 60, retryLimit: 1 },
    "documents.restore": { handler: async (data) => void (await (await import("./archive")).restoreJob(String(data.projectId))), expireInSeconds: 10 * 60, retryLimit: 1 },
    // Sizes for page pictures made before Grid recorded them (the job Storage section).
    "documents.measure": {
      handler: async () => void (await (await import("./storage")).measure()),
      schedule: "35 3 * * *",
      retryLimit: 0,
    },
  }),
  emits: ["documents.added", "documents.versioned"],
  on: {
    "projects.archived": async (payload) => app().jobs.send("documents.archive", { projectId: payload.projectId }),
    "projects.restored": async (payload) => app().jobs.send("documents.restore", { projectId: payload.projectId }),
  },
});
