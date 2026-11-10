import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "templates",
  name: "Document templates",
  version: "1.0.0",
  description: "Your logo, colour and business details on quotes and reports, and turning documents into PDFs. Part of the core.",
  required: true,
  dependsOn: ["companies"],
  permissions: [
    { key: "templates.theme.manage", label: "Change branding on documents", description: "Logo, colour and the business details printed on quotes and reports" },
  ],
  menus: [
    {
      id: "templates.branding",
      slot: "settings.company",
      label: "Branding",
      icon: "file",
      href: "/b/templates/branding",
      permission: "templates.theme.manage",
      order: 40,
    },
  ],
  routes: async () => (await import("./routes")).routes,
  fileAccess: async () => (await import("./service")).canReadLogo,
});
