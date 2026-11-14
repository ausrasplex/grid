// HTTP routes, mounted at /api/markups.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { createMarkupSchema, setScaleSchema, updateMarkupSchema } from "./validation";

export const routes: Routes = {
  "GET /sheet/:sheetId": { permission: "markups.view", handler: (ctx, request) => svc.sheetMarkups(ctx, request.params.sheetId!) },
  "PUT /sheet/:sheetId/scale/:versionId": {
    permission: "markups.add",
    handler: (ctx, request) => svc.setScale(ctx, request.params.sheetId!, request.params.versionId!, setScaleSchema.parse(request.body)),
  },
  "DELETE /sheet/:sheetId/scale/:versionId": { permission: "markups.add", handler: (ctx, request) => svc.clearScale(ctx, request.params.sheetId!, request.params.versionId!) },

  "POST /": { permission: "markups.add", handler: (ctx, request) => svc.createMarkup(ctx, createMarkupSchema.parse(request.body)) },
  "PATCH /:id": { permission: "markups.add", handler: (ctx, request) => svc.updateMarkup(ctx, request.params.id!, updateMarkupSchema.parse(request.body)) },
  "DELETE /:id": { permission: "markups.add", handler: (ctx, request) => svc.deleteMarkup(ctx, request.params.id!) },
  "POST /:id/restore": { permission: "markups.add", handler: (ctx, request) => svc.restoreMarkup(ctx, request.params.id!) },
};
