// The client's handover link, for people who aren't signed in
// (docs/materials-block.md "The client's link"). Mounted at
// /api/public/handover; the page is /h/<token>. share.ts checks the token
// on every request, and only this job's list, PDF and pictures can be reached.

import "server-only";
import type { PublicRoutes } from "@grid/core";
import { sharedLogo, sharedPdf, sharedPicture } from "./share";

export const publicRoutes: PublicRoutes = {
  "GET /h/:token/pdf": { handler: async (request) => sharedPdf(request.params.token!) },
  "GET /h/:token/logo": { handler: async (request) => sharedLogo(request.params.token!) },
  "GET /h/:token/picture/:fileId": {
    handler: async (request) => sharedPicture(request.params.token!, request.params.fileId!, request.query.get("v") === "display" ? "display" : "thumb"),
  },
};
