// Public routes, mounted at /api/public/signatures: the verify page.
import { z } from "zod";
import type { PublicRoutes } from "@grid/core";
import { badRequest } from "@grid/core";
import { lookupVerifyCode, verifyFile } from "./service";

export const publicRoutes: PublicRoutes = {
  "GET /verify/:code": { handler: async (request) => lookupVerifyCode(z.string().max(20).parse(request.params.code)) },
  // Body: the PDF itself (application/pdf). Only its hash is compared; nothing is kept.
  "POST /verify/:code": {
    maxBytes: 30 * 1024 * 1024,
    handler: async (request) => {
      if (!request.bytes?.byteLength) throw badRequest("Choose the PDF to check");
      return verifyFile(z.string().max(20).parse(request.params.code), request.bytes);
    },
  },
};
