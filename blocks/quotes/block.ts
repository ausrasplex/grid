import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "quotes",
  name: "Quotes",
  version: "1.0.0",
  description: "Quick quotes from your phone with a price book, your logo on a proper PDF, emailed to the customer. Accepted quotes become jobs.",
  dependsOn: ["projects", "templates", "signatures"],
  permissions: [
    { key: "quotes.view", label: "See quotes" },
    { key: "quotes.create", label: "Write quotes", description: "Draft and change quotes, and add clients" },
    { key: "quotes.send", label: "Send quotes", description: "Email quotes to customers and mark them accepted or declined" },
    { key: "quotes.costs.view", label: "See costs and margins", description: "Buy prices in the price book and the margin on each quote" },
    { key: "quotes.pricebook.manage", label: "Change the price book" },
    { key: "quotes.clients.manage", label: "Change and remove clients" },
    { key: "quotes.settings.manage", label: "Change tax and currency settings" },
  ],
  // The Owner gets everything. Estimators and foreman drafts come with teams.
  grants: {
    FOREMAN: ["quotes.view", "quotes.create"],
  },
  menus: [
    { id: "quotes.list", slot: "sidebar.main", label: "Quotes", icon: "dollar", href: "/b/quotes", permission: "quotes.view", prominence: "main", order: 30 },
    { id: "quotes.pricebook", slot: "settings.company", label: "Price book", icon: "clipboard", href: "/b/quotes/price-book", permission: "quotes.view", order: 50 },
    { id: "quotes.clients", slot: "settings.company", label: "Clients", icon: "users", href: "/b/quotes/clients", permission: "quotes.view", order: 51 },
    { id: "quotes.tax", slot: "settings.company", label: "Tax & currency", icon: "dollar", href: "/b/quotes/settings", permission: "quotes.settings.manage", order: 52 },
  ],
  routes: async () => (await import("./routes")).routes,
  // The customer's private link (/q/<token>): view, sign or decline.
  publicRoutes: async () => (await import("./public")).publicRoutes,
  routeTargets: {
    Quote: (id) => `/b/quotes/${id}`,
  },
  fileAccess: async () => (await import("./service")).canReadQuoteFile,
  emits: ["quotes.created", "quotes.sent", "quotes.accepted"],
});
