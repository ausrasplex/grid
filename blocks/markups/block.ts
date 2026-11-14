import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "markups",
  name: "Markups & measuring",
  version: "1.0.0",
  description: "Draw on plans (pen, highlighter, text, arrows, boxes, clouds) and measure lengths and areas once the sheet's scale is set.",
  dependsOn: ["plans"],
  permissions: [
    { key: "markups.view", label: "See markups and measurements" },
    { key: "markups.add", label: "Draw markups, measure and set a sheet's scale", description: "And change or delete your own markups" },
    { key: "markups.manage", label: "Change or delete anyone's markups" },
  ],
  grants: {
    FOREMAN: ["markups.view", "markups.add", "markups.manage"],
    EMPLOYEE: ["markups.view", "markups.add"],
    VIEWER: ["markups.view"],
  },
  routes: async () => (await import("./routes")).routes,
  emits: ["markups.added"],
});
