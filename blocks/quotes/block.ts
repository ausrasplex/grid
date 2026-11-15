import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "quotes",
  name: "Quotes",
  version: "1.0.0",
  description: "Quick quotes from your phone with a price book, your logo on a proper PDF, emailed to the client. Accepted quotes become jobs.",
  dependsOn: ["clients", "sites", "projects", "templates", "signatures"],
  permissions: [
    { key: "quotes.view", label: "See quotes" },
    { key: "quotes.create", label: "Write quotes", description: "Draft and change quotes" },
    { key: "quotes.send", label: "Send quotes", description: "Email quotes to clients and mark them accepted or declined" },
    { key: "quotes.costs.view", label: "See costs and margins", description: "Buy prices in the price book and the margin on each quote" },
    { key: "quotes.pricebook.manage", label: "Change the price book" },
    { key: "quotes.settings.manage", label: "Change tax and currency settings" },
  ],
  // The Owner gets everything. Estimators and foreman drafts come with teams.
  grants: {
    FOREMAN: ["quotes.view", "quotes.create"],
  },
  menus: [
    { id: "quotes.list", slot: "sidebar.main", label: "Quotes", icon: "dollar", href: "/quotes", permission: "quotes.view", prominence: "main", order: 30 },
    { id: "quotes.pricebook", slot: "settings.company", label: "Price book", icon: "clipboard", href: "/quotes/price-book", permission: "quotes.view", order: 50 },
    { id: "quotes.tax", slot: "settings.company", label: "Tax & currency", icon: "dollar", href: "/quotes/settings", permission: "quotes.settings.manage", order: 52 },
  ],
  routes: async () => (await import("./routes")).routes,
  // Recently deleted running out (none here), and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
  // The customer's private link (/q/<token>): view, sign or decline.
  publicRoutes: async () => (await import("./public")).publicRoutes,
  routeTargets: {
    Quote: (id) => `/quotes/${id}`,
  },
  fileAccess: async () => (await import("./service")).canReadQuoteFile,
  emits: ["quotes.created", "quotes.sent", "quotes.accepted"],
});
