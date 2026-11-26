// HTTP routes, mounted at /api/assets.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as stickers from "./stickers";
import * as custody from "./custody";
import { assetSchema, categorySchema, checkOutSchema, returnSchema, takeOverSchema, listQuery, presetSchema, statusSchema, stickerQuery, stickerSettingsSchema } from "./validation";

const queryParams = (request: { query: URLSearchParams }) => Object.fromEntries(request.query);

export const routes: Routes = {
  // Assets
  "GET /": { permission: "assets.view", handler: (ctx, request) => svc.listAssets(ctx, listQuery.parse(queryParams(request))) },
  "POST /": { permission: "assets.manage", handler: (ctx, request) => svc.saveAsset(ctx, null, assetSchema.parse(request.body)) },
  "GET /next-number": { permission: "assets.manage", handler: (ctx) => svc.suggestedNumber(ctx) },

  // What the custody sheets pick from: jobs, stores, vans, the team; a job's levels
  "GET /places": { permission: "assets.custody", handler: (ctx) => custody.places(ctx) },
  "GET /places/job/:projectId": { permission: "assets.custody", handler: (ctx, request) => custody.jobAreas(ctx, request.params.projectId!) },

  // Tags: the sticker PDF (?ids=a,b&layout=a4-21&start=1), a test page (?layout=…),
  // and the layouts with the business's Custom one and "Move everything"
  "GET /stickers.pdf": { permission: "assets.manage", handler: (ctx, request) => stickers.stickerPdf(ctx, stickerQuery.parse(queryParams(request))) },
  "GET /stickers/test.pdf": { permission: "assets.manage", handler: (ctx, request) => stickers.testSheet(ctx, request.query.get("layout") ?? "a4-21") },
  "GET /stickers/settings": { permission: "assets.manage", handler: (ctx) => stickers.stickerSettings(ctx) },
  "PUT /stickers/settings": { permission: "assets.manage", handler: (ctx, request) => stickers.saveStickerSettings(ctx, stickerSettingsSchema.parse(request.body)) },

  // Categories (Settings › Asset categories)
  "GET /categories": { permission: "assets.view", handler: (ctx) => svc.listCategories(ctx) },
  "POST /categories": { permission: "assets.manage", handler: (ctx, request) => svc.saveCategory(ctx, null, categorySchema.parse(request.body)) },
  "GET /categories/presets": { permission: "assets.manage", handler: (ctx) => svc.categoryPresets(ctx) },
  "POST /categories/presets": { permission: "assets.manage", handler: (ctx, request) => svc.addPresets(ctx, presetSchema.parse(request.body).names) },
  "PUT /categories/:id": { permission: "assets.manage", handler: (ctx, request) => svc.saveCategory(ctx, request.params.id!, categorySchema.parse(request.body)) },
  "DELETE /categories/:id": { permission: "assets.manage", handler: (ctx, request) => svc.deleteCategory(ctx, request.params.id!) },

  // One asset
  "GET /:id": { permission: "assets.view", handler: (ctx, request) => svc.getAsset(ctx, request.params.id!) },
  "PUT /:id": { permission: "assets.manage", handler: (ctx, request) => svc.saveAsset(ctx, request.params.id!, assetSchema.parse(request.body)) },
  "PUT /:id/status": { permission: "assets.manage", handler: (ctx, request) => svc.setStatus(ctx, request.params.id!, statusSchema.parse(request.body).status) },
  "POST /:id/new-tag": { permission: "assets.manage", handler: (ctx, request) => svc.newTag(ctx, request.params.id!) },
  // Custody: Check out, Return, Take over, and the movement history
  "POST /:id/check-out": { permission: "assets.custody", handler: (ctx, request) => custody.checkOut(ctx, request.params.id!, checkOutSchema.parse(request.body ?? {})) },
  "POST /:id/return": { permission: "assets.custody", handler: (ctx, request) => custody.returnAsset(ctx, request.params.id!, returnSchema.parse(request.body)) },
  "POST /:id/take-over": { permission: "assets.custody", handler: (ctx, request) => custody.takeOver(ctx, request.params.id!, takeOverSchema.parse(request.body ?? {}).note) },
  "GET /:id/history": { permission: "assets.view", handler: (ctx, request) => custody.history(ctx, request.params.id!) },
  "DELETE /:id": { permission: "assets.manage", handler: (ctx, request) => svc.deleteAsset(ctx, request.params.id!) },
};
