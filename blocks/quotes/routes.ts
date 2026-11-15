// HTTP routes, mounted at /api/quotes.
import { z } from "zod";
import type { Routes } from "@grid/core";
import * as svc from "./service";
import {
  acceptSchema,
  brandSchema,
  createQuoteSchema,
  declineSchema,
  priceItemSchema,
  sendSchema,
  taxCodeSchema,
  taxSettingsSchema,
  updateQuoteSchema,
  uploadQuoteSchema,
} from "./validation";

const listQuery = z.object({ tab: z.enum(["open", "draft", "sent", "won", "all"]).optional(), q: z.string().max(200).optional() });
const itemsQuery = z.object({
  q: z.string().max(200).optional(),
  kind: z.enum(["LABOUR", "MATERIAL"]).optional(),
  /// A brand's id, or "none" for items without one.
  brand: z.union([z.string().uuid(), z.literal("none")]).optional(),
});
const queryParams = (request: { query: URLSearchParams }) => Object.fromEntries(request.query);

export const routes: Routes = {
  // Tax & currency
  "GET /settings": { permission: "quotes.view", handler: (ctx) => svc.getTaxSettings(ctx) },
  "PUT /settings": { permission: "quotes.settings.manage", handler: (ctx, request) => svc.updateTaxSettings(ctx, taxSettingsSchema.parse(request.body)) },
  "POST /settings/codes": { permission: "quotes.settings.manage", handler: (ctx, request) => svc.saveTaxCode(ctx, null, taxCodeSchema.parse(request.body)) },
  "PUT /settings/codes/:id": { permission: "quotes.settings.manage", handler: (ctx, request) => svc.saveTaxCode(ctx, request.params.id!, taxCodeSchema.parse(request.body)) },


  // Price book
  "GET /items": { permission: "quotes.view", handler: (ctx, request) => svc.listPriceItems(ctx, itemsQuery.parse(queryParams(request))) },
  "POST /items": { permission: "quotes.pricebook.manage", handler: (ctx, request) => svc.savePriceItem(ctx, null, priceItemSchema.parse(request.body)) },
  "PUT /items/:id": { permission: "quotes.pricebook.manage", handler: (ctx, request) => svc.savePriceItem(ctx, request.params.id!, priceItemSchema.parse(request.body)) },
  "DELETE /items/:id": { permission: "quotes.pricebook.manage", handler: (ctx, request) => svc.deletePriceItem(ctx, request.params.id!) },
  "GET /brands": { permission: "quotes.view", handler: (ctx) => svc.listBrands(ctx) },
  "POST /brands": { permission: "quotes.pricebook.manage", handler: (ctx, request) => svc.saveBrand(ctx, null, brandSchema.parse(request.body)) },
  "PUT /brands/:id": { permission: "quotes.pricebook.manage", handler: (ctx, request) => svc.saveBrand(ctx, request.params.id!, brandSchema.parse(request.body)) },
  "DELETE /brands/:id": { permission: "quotes.pricebook.manage", handler: (ctx, request) => svc.deleteBrand(ctx, request.params.id!) },

  // Quotes
  "GET /": { permission: "quotes.view", handler: (ctx, request) => svc.listQuotes(ctx, listQuery.parse(queryParams(request))) },
  "POST /": { permission: "quotes.create", handler: (ctx, request) => svc.createQuote(ctx, createQuoteSchema.parse(request.body)) },
  // A quote made outside Grid: upload its PDF first (/api/files), then this.
  "POST /upload": { permission: "quotes.create", handler: (ctx, request) => svc.uploadQuote(ctx, uploadQuoteSchema.parse(request.body)) },
  "GET /:id": { permission: "quotes.view", handler: (ctx, request) => svc.getQuote(ctx, request.params.id!) },
  "PATCH /:id": { permission: "quotes.create", handler: (ctx, request) => svc.updateQuote(ctx, request.params.id!, updateQuoteSchema.parse(request.body)) },
  "DELETE /:id": { permission: "quotes.create", handler: (ctx, request) => svc.deleteDraft(ctx, request.params.id!) },
  "GET /:id/pdf": {
    permission: "quotes.view",
    handler: (ctx, request) => svc.quotePdf(ctx, request.params.id!, { revisionId: request.query.get("rev"), download: request.query.get("download") === "1", signed: request.query.get("signed") === "1" }),
  },
  "POST /:id/send": { permission: "quotes.send", handler: (ctx, request) => svc.sendQuote(ctx, request.params.id!, sendSchema.parse(request.body)) },
  "POST /:id/reopen": { permission: "quotes.create", handler: (ctx, request) => svc.reopenQuote(ctx, request.params.id!) },
  "POST /:id/accept": { permission: "quotes.send", handler: (ctx, request) => svc.acceptQuote(ctx, request.params.id!, acceptSchema.parse(request.body ?? {})) },
  "POST /:id/decline": { permission: "quotes.send", handler: (ctx, request) => svc.declineQuote(ctx, request.params.id!, declineSchema.parse(request.body ?? {}).reason) },
  "POST /:id/withdraw": { permission: "quotes.send", handler: (ctx, request) => svc.withdrawQuote(ctx, request.params.id!) },
};
