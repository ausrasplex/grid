// HTTP routes, mounted at /api/clients.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { clientSchema } from "./validation";

export const routes: Routes = {
  "GET /": { permission: "clients.view", handler: (ctx, request) => svc.listClients(ctx, request.query.get("q") ?? "") },
  "POST /": { permission: "clients.add", handler: (ctx, request) => svc.saveClient(ctx, null, clientSchema.parse(request.body)) },
  "PUT /:id": { permission: "clients.manage", handler: (ctx, request) => svc.saveClient(ctx, request.params.id!, clientSchema.parse(request.body)) },
  "DELETE /:id": { permission: "clients.manage", handler: (ctx, request) => svc.deleteClient(ctx, request.params.id!) },
};
