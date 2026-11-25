import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "clients",
  name: "Clients",
  version: "1.0.0",
  description: "The people and businesses you work for: one list for jobs and quotes. Part of the core.",
  required: true,
  // templates: your own business's phone, email and address for Share our card.
  dependsOn: ["companies", "templates"],
  permissions: [
    { key: "clients.view", label: "See clients", description: "The client list, with contact details" },
    { key: "clients.add", label: "Add clients", description: "When starting a job or writing a quote" },
    { key: "clients.edit", label: "Change client details", description: "Fix names, phones, emails and businesses, and update matches when importing" },
    { key: "clients.manage", label: "Remove clients and export the list", description: "Remove clients and businesses, download the whole list, share your business card" },
  ],
  grants: {
    FOREMAN: ["clients.view", "clients.add", "clients.edit"],
  },
  menus: [{ id: "clients.list", slot: "settings.company", label: "Clients", icon: "users", href: "/clients", permission: "clients.view", order: 45 }],
  routes: async () => (await import("./routes")).routes,
  // Recently deleted running out (none here), and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  emits: ["clients.renamed"],
});
