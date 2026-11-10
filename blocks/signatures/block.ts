import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "signatures",
  name: "Signatures",
  version: "1.0.0",
  description: "Customers sign online on a private link: one-time code, drawn or typed signature, sealed PDF and a verify page. Part of the core.",
  required: true,
  dependsOn: ["companies"],
  publicRoutes: async () => (await import("./public")).publicRoutes,
  fileAccess: async () => (await import("./service")).canReadSignatureFile,
});
