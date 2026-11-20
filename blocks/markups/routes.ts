// HTTP routes, mounted at /api/markups.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as icons from "./icon-versions";
import * as custom from "./custom-icons";
import { addIconVersionSchema, customIconSchema, linkItemSchema, createMarkupSchema, renumberSchema, setScaleSchema, updateIconVersionSchema, updateMarkupSchema } from "./validation";

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
  "PUT /job/:projectId/icon-item": { permission: "markups.add", handler: (ctx, request) => icons.linkIconItem(ctx, request.params.projectId!, linkItemSchema.parse(request.body)) },
  "PATCH /icon-versions/:id": { permission: "markups.add", handler: (ctx, request) => icons.updateIconVersion(ctx, request.params.id!, updateIconVersionSchema.parse(request.body)) },
  "DELETE /icon-versions/:id": { permission: "markups.add", handler: (ctx, request) => icons.deleteIconVersion(ctx, request.params.id!) },
  "POST /icons/renumber": { permission: "markups.add", handler: (ctx, request) => icons.renumberIcons(ctx, renumberSchema.parse(request.body)) },

  // Settings › Icons (phase 4c part 3).
  "GET /custom-icons": { permission: "markups.view", handler: (ctx) => custom.customIcons(ctx) },
  "POST /custom-icons": { permission: "markups.manage", handler: (ctx, request) => custom.saveCustomIcon(ctx, null, customIconSchema.parse(request.body)) },
  "PUT /custom-icons/:id": { permission: "markups.manage", handler: (ctx, request) => custom.saveCustomIcon(ctx, request.params.id!, customIconSchema.parse(request.body)) },
  "DELETE /custom-icons/:id": { permission: "markups.manage", handler: (ctx, request) => custom.deleteCustomIcon(ctx, request.params.id!) },

  "POST /": { permission: "markups.add", handler: (ctx, request) => svc.createMarkup(ctx, createMarkupSchema.parse(request.body)) },
  "PATCH /:id": { permission: "markups.add", handler: (ctx, request) => svc.updateMarkup(ctx, request.params.id!, updateMarkupSchema.parse(request.body)) },
  "DELETE /:id": { permission: "markups.add", handler: (ctx, request) => svc.deleteMarkup(ctx, request.params.id!) },
  "POST /:id/restore": { permission: "markups.add", handler: (ctx, request) => svc.restoreMarkup(ctx, request.params.id!) },
};
