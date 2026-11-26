// HTTP routes, mounted at /api/clients.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as transfer from "./transfer-service";
import { businessSchema, cardQuerySchema, clientSchema, formatSchema, importSchema } from "./validation";

export const routes: Routes = {
  // Export and import (docs/quotations-block.md "Export and import"). Before "/:id".
  "GET /export": { permission: "clients.manage", handler: (ctx, request) => transfer.exportClients(ctx, formatSchema.parse(request.query.get("format") ?? undefined)) },
  "GET /export/card": {
    permission: "clients.manage",
    handler: (ctx, request) => {
      const query = cardQuerySchema.parse({ format: request.query.get("format") ?? undefined, members: request.query.get("members") ?? undefined });
      return transfer.exportOurCard(ctx, query.members, query.format);
    },
  },
  // Contact files (.vcf). Yours: anyone in the business. A client's: anyone who can see clients.
  "GET /vcard/me": { handler: (ctx) => transfer.myContact(ctx) },
  "GET /:id/vcard": { permission: "clients.view", handler: (ctx, request) => transfer.clientContact(ctx, request.params.id!) },
  "POST /import/preview": {
    permission: "clients.add",
    handler: (ctx, request) => {
      const input = importSchema.parse(request.body);
      return transfer.previewImport(ctx, input.cells, input.pictureNames);
    },
  },
  "POST /import": {
    permission: "clients.add",
    handler: (ctx, request) => {
      const input = importSchema.parse(request.body);
      return transfer.applyImport(ctx, input.cells, input.decisions, input.pictures);
    },
  },
  "GET /": { permission: "clients.view", handler: (ctx, request) => svc.listClients(ctx, request.query.get("q") ?? "") },
  "POST /": { permission: "clients.add", handler: (ctx, request) => svc.saveClient(ctx, null, clientSchema.parse(request.body)) },
  // Businesses some clients work for (Honeywell → its Project Manager).
  "GET /businesses": { permission: "clients.view", handler: (ctx, request) => svc.listBusinesses(ctx, request.query.get("q") ?? "") },
  "POST /businesses": { permission: "clients.add", handler: (ctx, request) => svc.saveBusiness(ctx, null, businessSchema.parse(request.body)) },
  "PUT /businesses/:id": { permission: "clients.edit", handler: (ctx, request) => svc.saveBusiness(ctx, request.params.id!, businessSchema.parse(request.body)) },
  "DELETE /businesses/:id": { permission: "clients.manage", handler: (ctx, request) => svc.deleteBusiness(ctx, request.params.id!) },
  "PUT /:id": { permission: "clients.edit", handler: (ctx, request) => svc.saveClient(ctx, request.params.id!, clientSchema.parse(request.body)) },
  "DELETE /:id": { permission: "clients.manage", handler: (ctx, request) => svc.deleteClient(ctx, request.params.id!) },
};
