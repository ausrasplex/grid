import { defineBlock } from "@grid/core";

// Wallet: your tickets & licences (phase 5a, docs/roadmap.md), the first part of the
// credentials wallet (docs/inductions-credentials.md §2). Each person's own,
// not a business's: nobody else sees them yet (sharing comes in phase 9).
// Core, so they're there whichever business you're working in.
export default defineBlock({
  id: "credentials",
  // Pages at /wallet (/tickets, the old address, redirects there).
  address: "wallet",
  name: "Wallet",
  version: "1.0.0",
  description: "Your own tickets and licences (White Card, electrical licence, EWP…) with card photos and expiry reminders. Part of the core.",
  required: true,
  dependsOn: ["users"],
  menus: [{ id: "credentials.mine", slot: "settings.user", label: "Wallet", icon: "wallet", href: "/wallet", order: 20 }],
  routes: async () => (await import("./routes")).routes,
  fileAccess: async () => (await import("./service")).canReadTicketFile,
  cleanup: async () => ({ purgeDeleted: (await import("./service")).purgeDeleted }),
  jobs: async () => ({
    // Every morning: reminder emails 60, 30 and 7 days before a ticket runs out, and on the day.
    "credentials.remind": { handler: async () => (await import("./service")).sendReminders(), schedule: "0 7 * * *" },
  }),
});
