// HTTP routes, mounted at /api/assets.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as stickers from "./stickers";
import * as custody from "./custody";
import * as faults from "./faults";
import * as lost from "./lost";
import * as inspections from "./inspections";
import { assetSchema, bookingSchema, categorySchema, checkSchema, routineSchema, checkOutSchema, faultSchema, faultStepSchema, lostSchema, returnSchema, takeOverSchema, listQuery, presetSchema, statusSchema, stickerQuery, stickerSettingsSchema } from "./validation";

const queryParams = (request: { query: URLSearchParams }) => Object.fromEntries(request.query);

export const routes: Routes = {
  // Assets
  "GET /": { permission: "assets.view", handler: (ctx, request) => svc.listAssets(ctx, listQuery.parse(queryParams(request))) },
  "POST /": { permission: "assets.manage", handler: (ctx, request) => svc.saveAsset(ctx, null, assetSchema.parse(request.body)) },
  "GET /next-number": { permission: "assets.manage", handler: (ctx) => svc.suggestedNumber(ctx) },

  // Open faults across the business (the Faults page), and moving a fault along
  "GET /faults": { permission: "assets.faults.manage", handler: (ctx) => faults.openFaults(ctx) },
  "POST /faults/:faultId/step": { permission: "assets.faults.manage", handler: (ctx, request) => faults.faultStep(ctx, request.params.faultId!, faultStepSchema.parse(request.body)) },

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
  // Faults and lost or stolen
  "GET /:id/faults": { permission: "assets.view", handler: (ctx, request) => faults.faultsFor(ctx, request.params.id!) },
  "POST /:id/faults": { permission: "assets.faults.report", handler: (ctx, request) => faults.reportFault(ctx, request.params.id!, faultSchema.parse(request.body)) },
  "GET /:id/last-known": { permission: "assets.faults.report", handler: (ctx, request) => lost.lastKnown(ctx, request.params.id!) },
  "POST /:id/lost": { permission: "assets.faults.report", handler: (ctx, request) => lost.reportLost(ctx, request.params.id!, lostSchema.parse(request.body)) },
  "POST /:id/recovered": { permission: "assets.faults.report", handler: (ctx, request) => lost.recover(ctx, request.params.id!, returnSchema.parse(request.body)) },
  "POST /:id/retire-lost": { permission: "assets.lost.retire", handler: (ctx, request) => lost.retireLost(ctx, request.params.id!) },
  // Inspections and servicing: routines, the log, bookings
  "GET /:id/service": { permission: "assets.view", handler: (ctx, request) => inspections.serviceFor(ctx, request.params.id!) },
  "POST /:id/routines": { permission: "assets.manage", handler: (ctx, request) => inspections.saveRoutine(ctx, request.params.id!, null, routineSchema.parse(request.body)) },
  "PUT /:id/routines/:routineId": { permission: "assets.manage", handler: (ctx, request) => inspections.saveRoutine(ctx, request.params.id!, request.params.routineId!, routineSchema.parse(request.body)) },
  "DELETE /:id/routines/:routineId": { permission: "assets.manage", handler: (ctx, request) => inspections.removeRoutine(ctx, request.params.id!, request.params.routineId!) },
  "POST /:id/checks": { permission: "assets.inspections.record", handler: (ctx, request) => inspections.saveCheck(ctx, request.params.id!, null, checkSchema.parse(request.body)) },
  "PUT /:id/checks/:checkId": { permission: "assets.inspections.record", handler: (ctx, request) => inspections.saveCheck(ctx, request.params.id!, request.params.checkId!, checkSchema.parse(request.body)) },
  "DELETE /:id/checks/:checkId": { permission: "assets.inspections.record", handler: (ctx, request) => inspections.deleteCheck(ctx, request.params.id!, request.params.checkId!) },
  "POST /:id/bookings": { permission: "assets.inspections.record", handler: (ctx, request) => inspections.book(ctx, request.params.id!, bookingSchema.parse(request.body)) },
  "DELETE /:id/bookings/:bookingId": { permission: "assets.inspections.record", handler: (ctx, request) => inspections.cancelBooking(ctx, request.params.id!, request.params.bookingId!) },
  "DELETE /:id": { permission: "assets.manage", handler: (ctx, request) => svc.deleteAsset(ctx, request.params.id!) },
};
