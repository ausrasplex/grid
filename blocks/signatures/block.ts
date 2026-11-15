import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "signatures",
  name: "Signatures",
  version: "1.0.0",
  description: "Clients sign online on a private link: one-time code, drawn or typed signature, sealed PDF and a verify page. Part of the core.",
  required: true,
  dependsOn: ["companies"],
  publicRoutes: async () => (await import("./public")).publicRoutes,
  // Recently deleted running out (none here), and deleting a whole business.
  cleanup: async () => {
    const purge = await import("./purge");
    return { purgeCompany: purge.purgeCompany };
  },
  fileAccess: async () => (await import("./service")).canReadSignatureFile,
});
