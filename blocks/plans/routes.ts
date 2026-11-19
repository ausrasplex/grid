// HTTP routes, mounted at /api/plans.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { currentSchema, importSchema, layerSchema, pdfQuery, previewSchema, qualitySchema, shareSchema, updateSheetSchema, updateVersionSchema } from "./validation";

export const routes: Routes = {
  "GET /job/:projectId": { permission: "plans.view", handler: (ctx, request) => svc.listSheets(ctx, request.params.projectId!) },
  "GET /job/:projectId/deleted": { permission: "plans.manage", handler: (ctx, request) => svc.deletedSheets(ctx, request.params.projectId!) },
  "POST /job/:projectId/preview": { permission: "plans.upload", handler: (ctx, request) => svc.previewImport(ctx, request.params.projectId!, previewSchema.parse(request.body).fileIds) },
  "POST /job/:projectId/import": { permission: "plans.upload", handler: (ctx, request) => svc.commitImport(ctx, request.params.projectId!, importSchema.parse(request.body).rows) },

  // Share links (docs/plans-block.md "Sharing plans").
  "GET /job/:projectId/shares": { permission: "plans.share", handler: async (ctx, request) => (await import("./share")).listShares(ctx, request.params.projectId!) },
  "POST /job/:projectId/shares": { permission: "plans.share", handler: async (ctx, request) => (await import("./share")).createShare(ctx, request.params.projectId!, shareSchema.parse(request.body)) },
  "DELETE /shares/:id": { permission: "plans.share", handler: async (ctx, request) => (await import("./share")).revokeShare(ctx, request.params.id!) },
  // Every layer on the job's sheets (for picking layers to share).
  "GET /job/:projectId/layers": { permission: "plans.view", handler: async (ctx, request) => (await import("./share")).jobLayers(ctx, request.params.projectId!) },
  // Download PDF: the original page with the chosen layers drawn on.
  "GET /sheet/:id/pdf": { permission: "plans.view", handler: async (ctx, request) => (await import("./share")).downloadSheetPdf(ctx, request.params.id!, pdfQuery(request.query)) },

  "GET /sheet/:id": { permission: "plans.view", handler: (ctx, request) => svc.getSheet(ctx, request.params.id!) },
  // Layers on a sheet (Power, Data…); Default has no row.
  "GET /sheet/:id/layers": { permission: "plans.view", handler: async (ctx, request) => (await import("./layers")).sheetLayers(ctx, request.params.id!) },
  "POST /sheet/:id/layers": { permission: "plans.layers", handler: async (ctx, request) => (await import("./layers")).addLayer(ctx, request.params.id!, layerSchema.parse(request.body).name) },
  "PATCH /layers/:id": { permission: "plans.layers", handler: async (ctx, request) => (await import("./layers")).renameLayer(ctx, request.params.id!, layerSchema.parse(request.body).name) },
  "DELETE /layers/:id": { permission: "plans.layers", handler: async (ctx, request) => (await import("./layers")).deleteLayer(ctx, request.params.id!) },
  "PATCH /sheet/:id": { permission: "plans.manage", handler: (ctx, request) => svc.updateSheet(ctx, request.params.id!, updateSheetSchema.parse(request.body)) },
  "PUT /sheet/:id/quality": { permission: "plans.manage", handler: (ctx, request) => svc.setSheetQuality(ctx, request.params.id!, qualitySchema.parse(request.body).quality) },
  "POST /sheet/:id/current": { permission: "plans.manage", handler: (ctx, request) => svc.setCurrentVersion(ctx, request.params.id!, currentSchema.parse(request.body).versionId) },
  "DELETE /sheet/:id": { permission: "plans.manage", handler: (ctx, request) => svc.deleteSheet(ctx, request.params.id!) },
  "POST /sheet/:id/restore": { permission: "plans.manage", handler: (ctx, request) => svc.restoreSheet(ctx, request.params.id!) },

  "PATCH /version/:id": { permission: "plans.manage", handler: (ctx, request) => svc.updateVersion(ctx, request.params.id!, updateVersionSchema.parse(request.body)) },
  "DELETE /version/:id": { permission: "plans.manage", handler: (ctx, request) => svc.deleteVersion(ctx, request.params.id!) },
  // Archived jobs: the viewer says it opened a revision, which draws it again if needed (phase 2e).
  "POST /version/:id/open": { permission: "plans.view", handler: async (ctx, request) => (await import("./archive")).openVersion(ctx, request.params.id!) },
  "POST /version/:id/retry": { permission: "plans.upload", handler: (ctx, request) => svc.retryRender(ctx, request.params.id!) },

  // Deep-zoom tiles for the viewer (OpenSeadragon asks for plan.dzi, then plan_files/<level>/<x>_<y>.jpeg).
  // Tiles with the rendered width in the address: a sharper re-render gets a new address, so phones don't keep the old tiles.
  "GET /tiles/:versionId/:stamp/plan.dzi": { permission: "plans.view", handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, "plan.dzi") },
  "GET /tiles/:versionId/:stamp/thumb.jpg": { permission: "plans.view", handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, "thumb.jpg") },
  "GET /tiles/:versionId/:stamp/plan_files/:level/:tile": {
    permission: "plans.view",
    handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, `plan_files/${request.params.level}/${request.params.tile}`),
  },
  "GET /tiles/:versionId/plan.dzi": { permission: "plans.view", handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, "plan.dzi") },
  "GET /tiles/:versionId/thumb.jpg": { permission: "plans.view", handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, "thumb.jpg") },
  "GET /tiles/:versionId/plan_files/:level/:tile": {
    permission: "plans.view",
    handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, `plan_files/${request.params.level}/${request.params.tile}`),
  },
};
