// HTTP routes, mounted at /api/materials.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { brandSchema, brandSupportSchema, listQuery, materialSchema, sameQuery } from "./validation";

const queryParams = (request: { query: URLSearchParams }) => Object.fromEntries(request.query);

export const routes: Routes = {
  "GET /": { permission: "materials.view", handler: (ctx, request) => svc.listMaterials(ctx, listQuery.parse(queryParams(request))) },
  "POST /": { permission: "materials.manage", handler: (ctx, request) => svc.saveMaterial(ctx, null, materialSchema.parse(request.body)) },
  "GET /suggestions": { permission: "materials.view", handler: (ctx) => svc.suggestions(ctx) },
  // A material that looks the same (warned about, not blocked).
  "GET /same": { permission: "materials.view", handler: (ctx, request) => svc.sameMaterial(ctx, sameQuery.parse(queryParams(request))) },
  "GET /brands": { permission: "materials.view", handler: (ctx) => svc.listBrands(ctx) },
  "POST /brands": { permission: "materials.manage", handler: (ctx, request) => svc.saveBrand(ctx, null, brandSchema.parse(request.body)) },
  "PUT /brands/:id": { permission: "materials.manage", handler: (ctx, request) => svc.saveBrand(ctx, request.params.id!, brandSchema.parse(request.body)) },
  "PUT /brands/:id/support": { permission: "materials.manage", handler: (ctx, request) => svc.saveBrandSupport(ctx, request.params.id!, brandSupportSchema.parse(request.body)) },
  "DELETE /brands/:id": { permission: "materials.manage", handler: (ctx, request) => svc.deleteBrand(ctx, request.params.id!) },
  "GET /:id": { permission: "materials.view", handler: (ctx, request) => svc.materialPage(ctx, request.params.id!) },
  "PUT /:id": { permission: "materials.manage", handler: (ctx, request) => svc.saveMaterial(ctx, request.params.id!, materialSchema.parse(request.body)) },
  "DELETE /:id": { permission: "materials.manage", handler: (ctx, request) => svc.deleteMaterial(ctx, request.params.id!) },
};
