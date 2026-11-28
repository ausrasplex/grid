import { defineBlock } from "@grid/core";

// Scheduling (docs/scheduling-block.md): visits on jobs, the Schedule
// (agenda) and "To be booked", tentative visits, warnings for clashes, a
// busy day and time off. Built for one person first: nothing to set up, and
// nothing to type beyond a date and a time. Core (decided Nov 2026): every
// business books visits, so it's always on.
export default defineBlock({
  id: "scheduling",
  // Pages at /schedule (the API stays at /api/scheduling).
  address: "schedule",
  name: "Scheduling",
  version: "1.0.0",
  description: "Book visits on jobs, see your week, and keep track of what still needs booking.",
  // Core: always on, can't be switched off in the Store.
  required: true,
  dependsOn: ["companies", "projects"],
  permissions: [
    { key: "scheduling.view", label: "See the schedule", description: "Visits on jobs, and the Schedule page" },
    { key: "scheduling.visits.book", label: "Book visits", description: "And change, cancel or mark them done" },
    { key: "scheduling.settings", label: "Change booking defaults", description: "The default visit length and working day" },
  ],
  grants: {
    FOREMAN: ["scheduling.view", "scheduling.visits.book", "scheduling.settings"],
    EMPLOYEE: ["scheduling.view", "scheduling.visits.book"],
    VIEWER: ["scheduling.view"],
  },
  menus: [
    { id: "scheduling.schedule", slot: "sidebar.main", label: "Schedule", icon: "calendar", href: "/schedule", permission: "scheduling.view", prominence: "main", order: 35 },
    { id: "scheduling.settings", slot: "settings.user", label: "Scheduling & time off", icon: "calendar", href: "/schedule/settings", permission: "scheduling.view", order: 30 },
  ],
  routes: async () => (await import("./routes")).routes,
  // "Active • Scheduled" on jobs, from their visits.
  jobSecondStatus: async () => (await import("./service")).secondStatusFor,
  // Rows only (no files): they go with a deleted job or business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany, purgeProject: purge.purgeProject };
  },
});
