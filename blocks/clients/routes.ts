// HTTP routes, mounted at /api/clients.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { businessSchema, clientSchema } from "./validation";

export const routes: Routes = {
  "GET /": { permission: "clients.view", handler: (ctx, request) => svc.listClients(ctx, request.query.get("q") ?? "") },
  "POST /": { permission: "clients.add", handler: (ctx, request) => svc.saveClient(ctx, null, clientSchema.parse(request.body)) },
  // Businesses some clients work for (Honeywell → its Project Manager).
  "GET /businesses": { permission: "clients.view", handler: (ctx, request) => svc.listBusinesses(ctx, request.query.get("q") ?? "") },
  "POST /businesses": { permission: "clients.add", handler: (ctx, request) => svc.saveBusiness(ctx, null, businessSchema.parse(request.body)) },
  "PUT /businesses/:id": { permission: "clients.manage", handler: (ctx, request) => svc.saveBusiness(ctx, request.params.id!, businessSchema.parse(request.body)) },
  "DELETE /businesses/:id": { permission: "clients.manage", handler: (ctx, request) => svc.deleteBusiness(ctx, request.params.id!) },
  "PUT /:id": { permission: "clients.manage", handler: (ctx, request) => svc.saveClient(ctx, request.params.id!, clientSchema.parse(request.body)) },
  "DELETE /:id": { permission: "clients.manage", handler: (ctx, request) => svc.deleteClient(ctx, request.params.id!) },
};
