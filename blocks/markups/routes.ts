// HTTP routes, mounted at /api/markups.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as icons from "./icon-versions";
import { addIconVersionSchema, createMarkupSchema, renumberSchema, setScaleSchema, updateIconVersionSchema, updateMarkupSchema } from "./validation";

export const routes: Routes = {
  "GET /sheet/:sheetId": { permission: "markups.view", handler: (ctx, request) => svc.sheetMarkups(ctx, request.params.sheetId!) },
  "PUT /sheet/:sheetId/scale/:versionId": {
    permission: "markups.add",
    handler: (ctx, request) => svc.setScale(ctx, request.params.sheetId!, request.params.versionId!, setScaleSchema.parse(request.body)),
  },
  "DELETE /sheet/:sheetId/scale/:versionId": { permission: "markups.add", handler: (ctx, request) => svc.clearScale(ctx, request.params.sheetId!, request.params.versionId!) },

  // Trade icons on a job (phase 4c): numbers per icon, counts, renumbering placed icons.
  "GET /job/:projectId/icons": { permission: "markups.view", handler: (ctx, request) => icons.jobIcons(ctx, request.params.projectId!) },
  "POST /job/:projectId/icon-versions": {
    permission: "markups.add",
    handler: (ctx, request) => icons.addIconVersion(ctx, request.params.projectId!, addIconVersionSchema.parse(request.body)),
  },
  "PATCH /icon-versions/:id": { permission: "markups.add", handler: (ctx, request) => icons.updateIconVersion(ctx, request.params.id!, updateIconVersionSchema.parse(request.body)) },
  "DELETE /icon-versions/:id": { permission: "markups.add", handler: (ctx, request) => icons.deleteIconVersion(ctx, request.params.id!) },
  "POST /icons/renumber": { permission: "markups.add", handler: (ctx, request) => icons.renumberIcons(ctx, renumberSchema.parse(request.body)) },

  "POST /": { permission: "markups.add", handler: (ctx, request) => svc.createMarkup(ctx, createMarkupSchema.parse(request.body)) },
  "PATCH /:id": { permission: "markups.add", handler: (ctx, request) => svc.updateMarkup(ctx, request.params.id!, updateMarkupSchema.parse(request.body)) },
  "DELETE /:id": { permission: "markups.add", handler: (ctx, request) => svc.deleteMarkup(ctx, request.params.id!) },
  "POST /:id/restore": { permission: "markups.add", handler: (ctx, request) => svc.restoreMarkup(ctx, request.params.id!) },
};
