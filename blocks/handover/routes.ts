// HTTP routes, mounted at /api/handover.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as pdf from "./pdf";
import * as share from "./share";
import * as bring from "./bring-in";
import { bringInSchema, companySettingsSchema, emailSchema, jobSettingsSchema, lineChangeSchema, lineSchema, renameRoomSchema, shareSchema } from "./validation";

export const routes: Routes = {
  // The job's list
  "GET /job/:projectId": { permission: "handover.view", handler: (ctx, request) => svc.handoverFor(ctx, request.params.projectId!) },
  "GET /job/:projectId/rooms": { permission: "handover.view", handler: (ctx, request) => svc.jobRooms(ctx, request.params.projectId!) },
  "POST /job/:projectId/lines": { permission: "handover.edit", handler: (ctx, request) => svc.addLine(ctx, request.params.projectId!, lineSchema.parse(request.body)) },
  "PUT /lines/:id": { permission: "handover.edit", handler: (ctx, request) => svc.updateLine(ctx, request.params.id!, lineChangeSchema.parse(request.body)) },
  "DELETE /lines/:id": { permission: "handover.edit", handler: (ctx, request) => svc.deleteLine(ctx, request.params.id!) },
  "PUT /job/:projectId/settings": { permission: "handover.edit", handler: (ctx, request) => svc.saveJobSettings(ctx, request.params.projectId!, jobSettingsSchema.parse(request.body)) },
  "POST /job/:projectId/rooms/rename": { permission: "handover.edit", handler: (ctx, request) => svc.renameRoom(ctx, request.params.projectId!, renameRoomSchema.parse(request.body)) },

  // Bring in from plans and the accepted quote: what would change, then the ticked changes
  "GET /job/:projectId/bring-in": { permission: "handover.edit", handler: (ctx, request) => bring.bringInPreview(ctx, request.params.projectId!) },
  "POST /job/:projectId/bring-in": { permission: "handover.edit", handler: (ctx, request) => bring.bringIn(ctx, request.params.projectId!, bringInSchema.parse(request.body).choices) },

  // The PDF (?download=1), and its pages as pictures for showing it inside Grid
  "GET /job/:projectId/pdf": { permission: "handover.view", handler: (ctx, request) => pdf.schedulePdf(ctx, request.params.projectId!, request.query.get("download") === "1") },
  "GET /job/:projectId/pdf/pages": { permission: "handover.view", handler: (ctx, request) => pdf.schedulePagesFor(ctx, request.params.projectId!) },
  "GET /job/:projectId/pdf/pages/:key/:name": { permission: "handover.view", handler: (ctx, request) => pdf.pagePictureFor(ctx, request.params.projectId!, request.params.key!, request.params.name!) },

  // The client's link
  "GET /job/:projectId/share": { permission: "handover.share", handler: (ctx, request) => share.currentShare(ctx, request.params.projectId!) },
  "POST /job/:projectId/share": { permission: "handover.share", handler: (ctx, request) => share.createShare(ctx, request.params.projectId!, shareSchema.parse(request.body ?? {})) },
  "DELETE /shares/:id": { permission: "handover.share", handler: (ctx, request) => share.revokeShare(ctx, request.params.id!) },
  "GET /job/:projectId/client-email": { permission: "handover.share", handler: (ctx, request) => share.clientEmail(ctx, request.params.projectId!) },
  "POST /job/:projectId/email": { permission: "handover.share", handler: (ctx, request) => share.emailShare(ctx, request.params.projectId!, emailSchema.parse(request.body)) },

  // Settings › Handover
  "GET /settings": { permission: "handover.view", handler: (ctx) => svc.getCompanySettings(ctx) },
  "PUT /settings": { permission: "handover.settings", handler: (ctx, request) => svc.saveCompanySettings(ctx, companySettingsSchema.parse(request.body)) },
};
