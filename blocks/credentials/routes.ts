// HTTP routes, mounted at /api/credentials. Your own tickets only: no
// business needed, and no permission beyond being signed in.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { ticketSchema } from "./validation";

export const routes: Routes = {
  "GET /": { requireCompany: false, handler: (ctx) => svc.myTickets(ctx) },
  "POST /": { requireCompany: false, handler: (ctx, request) => svc.addTicket(ctx, ticketSchema.parse(request.body)) },
  "PUT /:id": { requireCompany: false, handler: (ctx, request) => svc.updateTicket(ctx, request.params.id!, ticketSchema.parse(request.body)) },
  "DELETE /:id": { requireCompany: false, handler: (ctx, request) => svc.deleteTicket(ctx, request.params.id!) },
};
