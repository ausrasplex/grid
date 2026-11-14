import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "clients",
  name: "Clients",
  version: "1.0.0",
  description: "The people and businesses you work for: one list for jobs and quotes. Part of the core.",
  required: true,
  dependsOn: ["companies"],
  permissions: [
    { key: "clients.view", label: "See clients", description: "The client list, with contact details" },
    { key: "clients.add", label: "Add clients", description: "When starting a job or writing a quote" },
    { key: "clients.manage", label: "Change and remove clients" },
  ],
  grants: {
    FOREMAN: ["clients.view", "clients.add"],
  },
  menus: [{ id: "clients.list", slot: "settings.company", label: "Clients", icon: "users", href: "/clients", permission: "clients.view", order: 45 }],
  routes: async () => (await import("./routes")).routes,
  emits: ["clients.renamed"],
});
