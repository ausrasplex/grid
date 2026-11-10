import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "sites",
  name: "Sites",
  version: "1.0.0",
  description: "Where work happens: sites, buildings and levels, the Sites list and site notes. Part of the core.",
  required: true,
  dependsOn: ["companies"],
  permissions: [
    { key: "sites.view", label: "See sites" },
    { key: "sites.create", label: "Create sites", description: "Managed sites like precincts and centres. House sites are made automatically from a job address." },
    { key: "sites.structure.edit", label: "Change buildings and levels", description: "Only on sites your company looks after" },
    { key: "sites.notes.edit", label: "Edit site notes", description: "Access and hazard notes kept with the address" },
  ],
  grants: {
    FOREMAN: ["sites.view", "sites.create", "sites.structure.edit", "sites.notes.edit"],
    EMPLOYEE: ["sites.view", "sites.notes.edit"],
    VIEWER: ["sites.view"],
  },
  menus: [
    {
      id: "sites.list",
      slot: "sidebar.main",
      label: "Sites",
      icon: "map",
      href: "/b/sites",
      permission: "sites.view",
      prominence: "primary",
      order: 10,
      // Screens inside a site or job highlight Sites (docs/navigation.md §5).
      activeFor: ["/b/projects"],
    },
  ],
  routes: async () => (await import("./routes")).routes,
  routeTargets: {
    Site: (id) => `/b/projects/site/${id}`,
  },
  emits: ["sites.created", "sites.building.converted"],
});
