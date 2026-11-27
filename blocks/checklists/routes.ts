import type { Routes } from "@grid/core";
import * as service from "./service";
import { addSchema, renameSchema, tickSchema } from "./validation";

// /api/checklists/… (docs/stage-2-projects.md "Job checklist")
export const routes: Routes = {
  // Anyone who can see the job sees its list.
  "GET /jobs/:jobId": { permission: "projects.view", handler: (ctx, request) => service.listItems(ctx, request.params.jobId!) },
  "POST /jobs/:jobId": { permission: "checklists.items.manage", handler: (ctx, request) => service.addItems(ctx, request.params.jobId!, addSchema.parse(request.body).text) },
  "POST /items/:id/tick": { permission: "checklists.items.tick", handler: (ctx, request) => service.tickItem(ctx, request.params.id!, tickSchema.parse(request.body).done) },
  "PUT /items/:id": { permission: "checklists.items.manage", handler: (ctx, request) => service.renameItem(ctx, request.params.id!, renameSchema.parse(request.body).text) },
  "DELETE /items/:id": { permission: "checklists.items.manage", handler: (ctx, request) => service.removeItem(ctx, request.params.id!) },
};
