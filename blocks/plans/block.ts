import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "plans",
  name: "Plans",
  version: "1.0.0",
  description: "Upload a job's drawings (PDFs straight from Procore, Aconex or email), keep every revision, and zoom right in on the tablet.",
  dependsOn: ["projects"],
  permissions: [
    { key: "plans.view", label: "See plans" },
    { key: "plans.upload", label: "Upload plans and new revisions" },
    { key: "plans.manage", label: "Rename, re-order and delete sheets and revisions" },
  ],
  grants: {
    FOREMAN: ["plans.view", "plans.upload", "plans.manage"],
    EMPLOYEE: ["plans.view"],
    VIEWER: ["plans.view"],
  },
  routes: async () => (await import("./routes")).routes,
  routeTargets: {
    PlanSheet: (id) => `/plans/sheet/${id}`,
  },
  fileAccess: async () => (await import("./service")).canReadPlanFile,
  // Recently deleted running out, and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { purgeDeleted: (await import("./service")).purgeDeleted, companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  levelUsage: async () => (await import("./service")).levelUsage,
  jobs: async () => ({
    "plans.render": {
      handler: async (data) => (await import("./service")).renderVersion(String(data.versionId)),
      expireInSeconds: 20 * 60,
      retryLimit: 1,
    },
  }),
  emits: ["plans.uploaded"],
});
