import type { RequestContext, Routes } from "@grid/core";
import { deleteTimeOff, myTimeOff, saveTimeOff, timeOffSchema, type LeaveRow } from "@grid/block-companies";
import * as svc from "./service";
import { localDay } from "./times";
import { agendaQuery, settingsSchema, userSettingsSchema, visitSchema, visitStatusSchema } from "./validation";

// /api/scheduling/… (docs/scheduling-block.md)
export const routes: Routes = {
  // The Schedule: ?from=2026-11-30&to=2026-12-13 (up to three months)
  "GET /agenda": {
    permission: "scheduling.view",
    handler: (ctx, request) => svc.agenda(ctx, agendaQuery.parse({ from: request.query.get("from"), to: request.query.get("to") })),
  },
  "GET /to-book": { permission: "scheduling.view", handler: (ctx) => svc.toBeBooked(ctx) },

  // A job's visits
  "GET /jobs/:projectId/visits": { permission: "scheduling.view", handler: (ctx, request) => svc.jobVisits(ctx, request.params.projectId!) },
  "POST /jobs/:projectId/visits": {
    permission: "scheduling.visits.book",
    handler: (ctx, request) => svc.bookVisit(ctx, request.params.projectId!, visitSchema.parse(request.body)),
  },
  "PUT /visits/:id": { permission: "scheduling.visits.book", handler: (ctx, request) => svc.changeVisit(ctx, request.params.id!, visitSchema.parse(request.body)) },
  "POST /visits/:id/confirm": { permission: "scheduling.visits.book", handler: (ctx, request) => svc.confirmVisit(ctx, request.params.id!) },
  "POST /visits/:id/status": {
    permission: "scheduling.visits.book",
    handler: (ctx, request) => svc.setVisitStatus(ctx, request.params.id!, visitStatusSchema.parse(request.body).status),
  },

  // Settings: the business's defaults, your daily limit
  "GET /settings": { permission: "scheduling.view", handler: (ctx) => svc.getSettings(ctx) },
  "PUT /settings": { permission: "scheduling.settings", handler: (ctx, request) => svc.saveBusinessSettings(ctx, settingsSchema.parse(request.body)) },
  "PUT /settings/mine": { permission: "scheduling.view", handler: (ctx, request) => svc.saveUserSettings(ctx, userSettingsSchema.parse(request.body)) },

  // Your time off (core's leave records, approved straight away)
  "GET /time-off": { permission: "scheduling.view", handler: (ctx) => myTimeOff(ctx, localDay(new Date())) },
  // Saving says which of your booked visits fall in it, to move (nothing is moved for you).
  "POST /time-off": { permission: "scheduling.view", handler: (ctx, request) => withVisits(ctx, saveTimeOff(ctx, null, timeOffSchema.parse(request.body))) },
  "PUT /time-off/:id": { permission: "scheduling.view", handler: (ctx, request) => withVisits(ctx, saveTimeOff(ctx, request.params.id!, timeOffSchema.parse(request.body))) },
  "DELETE /time-off/:id": { permission: "scheduling.view", handler: (ctx, request) => deleteTimeOff(ctx, request.params.id!) },
};

async function withVisits(ctx: RequestContext, saving: Promise<LeaveRow>) {
  const timeOff = await saving;
  return { timeOff, visitsDuringTimeOff: await svc.visitsDuringTimeOff(ctx, timeOff) };
}

