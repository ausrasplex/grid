// HTTP routes, mounted at /api/plans.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { currentSchema, importSchema, previewSchema, updateSheetSchema, updateVersionSchema } from "./validation";

export const routes: Routes = {
  "GET /job/:projectId": { permission: "plans.view", handler: (ctx, request) => svc.listSheets(ctx, request.params.projectId!) },
  "GET /job/:projectId/deleted": { permission: "plans.manage", handler: (ctx, request) => svc.deletedSheets(ctx, request.params.projectId!) },
  "POST /job/:projectId/preview": { permission: "plans.upload", handler: (ctx, request) => svc.previewImport(ctx, request.params.projectId!, previewSchema.parse(request.body).fileIds) },
  "POST /job/:projectId/import": { permission: "plans.upload", handler: (ctx, request) => svc.commitImport(ctx, request.params.projectId!, importSchema.parse(request.body).rows) },

  "GET /sheet/:id": { permission: "plans.view", handler: (ctx, request) => svc.getSheet(ctx, request.params.id!) },
  "PATCH /sheet/:id": { permission: "plans.manage", handler: (ctx, request) => svc.updateSheet(ctx, request.params.id!, updateSheetSchema.parse(request.body)) },
  "POST /sheet/:id/current": { permission: "plans.manage", handler: (ctx, request) => svc.setCurrentVersion(ctx, request.params.id!, currentSchema.parse(request.body).versionId) },
  "DELETE /sheet/:id": { permission: "plans.manage", handler: (ctx, request) => svc.deleteSheet(ctx, request.params.id!) },
  "POST /sheet/:id/restore": { permission: "plans.manage", handler: (ctx, request) => svc.restoreSheet(ctx, request.params.id!) },

  "PATCH /version/:id": { permission: "plans.manage", handler: (ctx, request) => svc.updateVersion(ctx, request.params.id!, updateVersionSchema.parse(request.body)) },
  "DELETE /version/:id": { permission: "plans.manage", handler: (ctx, request) => svc.deleteVersion(ctx, request.params.id!) },
  "POST /version/:id/retry": { permission: "plans.upload", handler: (ctx, request) => svc.retryRender(ctx, request.params.id!) },

  // Deep-zoom tiles for the viewer (OpenSeadragon asks for plan.dzi, then plan_files/<level>/<x>_<y>.jpeg).
  "GET /tiles/:versionId/plan.dzi": { permission: "plans.view", handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, "plan.dzi") },
  "GET /tiles/:versionId/thumb.jpg": { permission: "plans.view", handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, "thumb.jpg") },
  "GET /tiles/:versionId/plan_files/:level/:tile": {
    permission: "plans.view",
    handler: (ctx, request) => svc.tileResponse(ctx, request.params.versionId!, `plan_files/${request.params.level}/${request.params.tile}`),
  },
};
