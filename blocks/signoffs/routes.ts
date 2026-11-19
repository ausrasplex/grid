// HTTP routes, mounted at /api/signoffs.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { clearSchema, entriesSchema, matchSchema } from "./validation";

export const routes: Routes = {
  "GET /doc/:documentId": { permission: "signoffs.view", handler: (ctx, request) => svc.documentSignoffs(ctx, request.params.documentId!) },
  // Sign off or undo rows (a batch, so sign-offs made with no signal go together).
  "POST /doc/:documentId/entries": {
    permission: "signoffs.sign",
    handler: (ctx, request) => svc.addEntries(ctx, request.params.documentId!, entriesSchema.parse(request.body).entries),
  },
  "PUT /doc/:documentId/match": {
    permission: "signoffs.manage",
    handler: (ctx, request) => {
      const input = matchSchema.parse(request.body);
      return svc.setMatchColumn(ctx, request.params.documentId!, input.sheetName, input.matchColumn);
    },
  },
  "POST /doc/:documentId/clear": {
    permission: "signoffs.manage",
    handler: (ctx, request) => {
      const input = clearSchema.parse(request.body);
      return svc.clearRows(ctx, request.params.documentId!, input.sheetName, input.rowKeys);
    },
  },
  // A copy of the spreadsheet with Signed off, By, When and Note columns added.
  "GET /doc/:documentId/export": { permission: "signoffs.view", handler: (ctx, request) => svc.exportWithSignoffs(ctx, request.params.documentId!) },
};
