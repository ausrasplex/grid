import { defineBlock } from "@grid/core";

// Themes people make themselves (docs/visual-style.md "Your own themes").
// Your own themes follow you, like your Wallet; a business's themes can be
// picked by everyone in it. Part of the core, so it's always there.
export default defineBlock({
  id: "themes",
  name: "Themes",
  version: "1.0.0",
  description: "Make your own colour theme for Grid, and share themes with your business. Part of the core.",
  required: true,
  dependsOn: ["users", "companies"],
  permissions: [
    {
      key: "themes.business.manage",
      label: "Make the business's themes",
      description: "Add, change and delete themes everyone in the business can pick. Owners by default",
    },
  ],
  menus: [{ id: "themes.mine", slot: "settings.user", label: "Themes", icon: "palette", href: "/themes", order: 15 }],
  routes: async () => (await import("./routes")).routes,
  cleanup: async () => ({ purgeCompany: (await import("./service")).purgeCompanyThemes }),
});
