// HTTP routes, mounted at /api/templates.
import { createElement } from "react";
import { requireCompany, type Routes } from "@grid/core";
import { renderPdf, toHtml } from "./render";
import { SampleDocument } from "./sample";
import * as svc from "./service";
import { themeSchema } from "./validation";

export const routes: Routes = {
  "GET /theme": { handler: (ctx) => svc.getTheme(ctx) },
  // What documents look like with the current branding.
  "GET /sample.pdf": {
    handler: async (ctx) => {
      const theme = await svc.themeFor(requireCompany(ctx));
      const pdf = await renderPdf(await toHtml(createElement(SampleDocument, { theme })), { footer: theme.footerText ?? "" });
      return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="sample.pdf"' } });
    },
  },
  "PUT /theme": { permission: "templates.theme.manage", handler: (ctx, request) => svc.updateTheme(ctx, themeSchema.parse(request.body)) },
};
