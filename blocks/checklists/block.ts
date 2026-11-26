import { defineBlock } from "@grid/core";

// A to-do list on each job (docs/stage-2-projects.md "Job checklist"):
// anyone who can see the job ticks items off, and each tick records who and
// when. Adding, renaming and removing items is its own permission, so a
// custom role (an Apprentice, say) can tick without changing the list.
export default defineBlock({
  id: "checklists",
  name: "Checklist",
  version: "1.0.0",
  description: "A to-do list on each job: tick things off as they're done, with who and when.",
  dependsOn: ["projects"],
  permissions: [
    { key: "checklists.items.tick", label: "Tick checklist items", description: "And untick them, on jobs they can see" },
    { key: "checklists.items.manage", label: "Add and remove checklist items", description: "And rename them" },
  ],
  grants: {
    FOREMAN: ["checklists.items.tick", "checklists.items.manage"],
    EMPLOYEE: ["checklists.items.tick", "checklists.items.manage"],
    VIEWER: ["checklists.items.tick"],
  },
  routes: async () => (await import("./routes")).routes,
  // Rows only (no files): they go with a deleted job or business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { purgeCompany: purge.purgeCompany, purgeProject: purge.purgeProject };
  },
});
