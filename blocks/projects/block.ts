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
    { key: "projects.complete", label: "Finish and reopen jobs" },
  ],
  grants: {
    FOREMAN: ["projects.view", "projects.create", "projects.edit", "projects.complete"],
    EMPLOYEE: ["projects.view"],
    VIEWER: ["projects.view"],
  },
  menus: [
    { id: "projects.search", slot: "header.actions", label: "Search", icon: "search", href: "/jobs/search", permission: "projects.view", order: 5 },
  ],
  routes: async () => (await import("./routes")).routes,
  routeTargets: {
    Project: (id) => `/jobs/${id}`,
  },
  emits: ["projects.created", "projects.completed", "projects.reopened"],
  on: {
    // Jobs keep a copy of the client's name (lists, search, the Sites list).
    "clients.renamed": async (payload) => (await import("./service")).clientRenamed(payload),
  },
});
