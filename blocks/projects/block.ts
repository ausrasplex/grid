import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "projects",
  // Pages at /jobs/...: the screens say "job", the code says "project".
  address: "jobs",
  name: "Jobs",
  version: "1.0.0",
  description: "Jobs on sites: what each job covers, job numbers, finishing and reopening, and Jump to search. Part of the core.",
  required: true,
  dependsOn: ["companies", "clients", "sites"],
  permissions: [
    { key: "projects.view", label: "See jobs" },
    { key: "projects.create", label: "Start jobs" },
    { key: "projects.edit", label: "Change job details and what a job covers" },
    { key: "projects.complete", label: "Finish, reopen and archive jobs, and see what they store" },
  ],
  grants: {
    FOREMAN: ["projects.view", "projects.create", "projects.edit", "projects.complete"],
    EMPLOYEE: ["projects.view"],
    VIEWER: ["projects.view"],
  },
  menus: [
    // Every job in one searchable table, with what each holds (phase 2e).
    { id: "projects.table", slot: "sidebar.main", label: "Jobs", icon: "job", href: "/jobs", permission: "projects.view", order: 15 },
    { id: "projects.search", slot: "header.actions", label: "Search", icon: "search", href: "/jobs/search", permission: "projects.view", order: 5 },
  ],
  routes: async () => (await import("./routes")).routes,
  // Recently deleted running out (none here), and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  routeTargets: {
    Project: (id) => `/jobs/${id}`,
  },
  emits: ["projects.created", "projects.completed", "projects.reopened", "projects.archived", "projects.restored"],
  levelUsage: async () => (await import("./service")).levelUsage,
  on: {
    // Jobs keep a copy of the client's name (lists, search, the Sites list).
    "clients.renamed": async (payload) => (await import("./service")).clientRenamed(payload),
    // Forget a deleted floor as anyone's "last area" on a job.
    "sites.level.deleted": async (payload) => (await import("./service")).levelDeleted(payload),
  },
});
