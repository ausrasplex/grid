import { defineBlock } from "@grid/core";

// A trial (docs/documents-block.md "Row sign-offs"): its own small Block so
// it can be switched off, or taken out of Grid, without touching Documents.
// It only draws into the spreadsheet viewer's "documents.sheet" slot.
export default defineBlock({
  id: "signoffs",
  name: "Sign-offs",
  version: "1.0.0",
  description: "Sign off rows on fit-off sheets and points lists as you go: progress per sheet, who and when, and a copy of the spreadsheet with the sign-offs added for handover.",
  dependsOn: ["documents"],
  permissions: [
    { key: "signoffs.view", label: "See sign-offs on spreadsheets" },
    { key: "signoffs.sign", label: "Sign off rows", description: "And undo your own" },
    { key: "signoffs.manage", label: "Undo anyone's sign-offs, set the match column and clear a sheet" },
  ],
  grants: {
    FOREMAN: ["signoffs.view", "signoffs.sign", "signoffs.manage"],
    EMPLOYEE: ["signoffs.view", "signoffs.sign"],
    VIEWER: ["signoffs.view"],
  },
  routes: async () => (await import("./routes")).routes,
  // Documents purged for good, and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { purgeDeleted: purge.purgeDeleted, companyUsage: purge.companyUsage, purgeCompany: purge.purgeCompany };
  },
});
