import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "users",
  name: "Users",
  version: "1.0.0",
  description: "Sign-in identity, profile and personal settings.",
  required: true,
  // Everyone can view and edit their own profile, so no permissions needed.
  menus: [
    { id: "users.profile", slot: "settings.user", label: "Profile", icon: "user", href: "/b/users/profile", order: 10 },
  ],
  routes: async () => (await import("./routes")).routes,
  emits: [],
});
